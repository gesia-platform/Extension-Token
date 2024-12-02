// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../price/IPrice.sol";
import "../operator/IMintOperator.sol";
import "../operator/IOperator.sol";
import "../fee/IFeeManager.sol";

contract Voucher1155DerivativeToken is ERC1155, IMintOperator, ReentrancyGuard, IPrice, Ownable {
    using Strings for string;
    using SafeMath for uint256;
    using Counters for Counters.Counter;

    // Mapping of token supply by token ID
    mapping(uint256 => uint256) public tokenSupply;

    // Mapping of transaction hashes to prevent replays
    mapping(bytes32 => bool) private transactionHashes;

    // Mapping of balances per token and user
    mapping(uint256 => mapping(address => uint256)) internal balances;

    // Mapping of token creators
    mapping(uint256 => address) public creators;

    // Mapping of token URIs by token ID
    mapping(uint256 => string) tokenURIs;

    // Name and symbol of the token
    string public name;
    string public symbol;

    // Address of the Fee Manager contract
    address public feeManager;

    // Minimum acceptable carbon price in USDT (10000 means 0.01 USDT)
    uint256 public minUSDTPrice = 10000;

    // Token ID counter
    Counters.Counter private _tokenIdTracker;

    // Mapping of carbon prices by token ID
    mapping(uint256 => uint256) private carbonMapPrice;

    /**
     * @notice Constructor for the Voucher1155DerivativeToken contract.
     * @param _name The name of the token.
     * @param _symbol The symbol of the token.
     * @param _feeManager The address of the Fee Manager contract.
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _feeManager
    ) ERC1155("") {
        name = _name;
        symbol = _symbol;
        feeManager = _feeManager;
        _tokenIdTracker.increment(); // Start token ID from 1
    }

    /**
     * @notice Mint new tokens by operator (only callable by owner).
     * @param _receiver The address of the receiver.
     * @param _amount The amount of tokens to mint.
     * @param _tokenId The token ID to mint.
     * @param _metadata The metadata URI for the token.
     */
    function mintByOperator(address _receiver, uint256 _amount, uint256 _tokenId, string memory _metadata) external override onlyOwner {
        tokenURIs[_tokenId] = _metadata;
        tokenSupply[_tokenId] = tokenSupply[_tokenId].add(_amount);
        _mint(_receiver, _tokenId, _amount, "");
    }

    /**
     * @notice Mint new tokens by signature (only callable by owner).
     * @param _receiver The address of the receiver.
     * @param _amount The amount of tokens to mint.
     * @param _tokenId The token ID to mint.
     * @param _nonce A nonce to prevent replay attacks.
     * @param _metadata The metadata URI for the token.
     * @param signature The signature to verify the mint request.
     * @param _carbonPrice The carbon price for the minted token.
     */
    function mintBySignature(address _receiver, uint256 _amount, uint256 _tokenId, uint256 _nonce, string memory _metadata, bytes memory signature, uint256 _carbonPrice) external onlyOwner {
        require(_carbonPrice >= minUSDTPrice, "price must be higher than min");
        require(_carbonPrice > carbonMapPrice[_tokenId], "price must be higher than old");

        bytes32 hashMessage = keccak256(abi.encodePacked(_receiver, _tokenId, _amount, _nonce, address(this)));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hashMessage));
        address signer = recoverSigner(hash, signature);

        require(signer == _receiver, "Signature does not match the sender");
        require(!transactionHashes[hashMessage], "Transaction already processed");

        transactionHashes[hashMessage] = true;

        uint256 calculatedAmount = IFeeManager(feeManager).feeAmount(_amount);
        uint256 remainAmount = _amount.sub(calculatedAmount);

        tokenURIs[_tokenId] = _metadata;
        tokenSupply[_tokenId] = tokenSupply[_tokenId].add(_amount);

        _mint(_receiver, _tokenId, remainAmount, "");
        _mint(IFeeManager(feeManager).feeAddress(), _tokenId, calculatedAmount, "");

        carbonMapPrice[_tokenId] = _carbonPrice;
    }

    /**
     * @notice Transfer tokens by signature (only callable by owner).
     * @param from The address sending tokens.
     * @param to The address receiving tokens.
     * @param tokenId The ID of the token being transferred.
     * @param amount The amount of tokens being transferred.
     * @param nonce A nonce to prevent replay attacks.
     * @param signature The signature to verify the transfer request.
     */
    function transferBySignature(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external nonReentrant onlyOwner {
        bytes32 hashMessage = keccak256(abi.encodePacked(from, to, tokenId, amount, nonce, address(this)));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hashMessage));
        address signer = recoverSigner(hash, signature);

        require(signer == from, "Signature does not match the sender");
        require(!transactionHashes[hashMessage], "Transaction already processed");

        transactionHashes[hashMessage] = true;

        uint256 calculatedAmount = IFeeManager(feeManager).feeAmount(amount);
        uint256 remainAmount = amount.sub(calculatedAmount);

        _safeTransferFrom(from, to, tokenId, remainAmount, "");
        _safeTransferFrom(from, IFeeManager(feeManager).feeAddress(), tokenId, calculatedAmount, "");
    }

    /**
     * @notice Get the URI of the token with the specified ID.
     * @param _id The ID of the token.
     * @return The URI of the token.
     */
    function uri(uint256 _id) override public view returns (string memory) {
        require(_exists(_id), "MultiCollection#uri: NONEXISTENT_TOKEN");
        return tokenURIs[_id];
    }

    /**
     * @notice Check if a token exists.
     * @param _id The ID of the token.
     * @return True if the token exists, false otherwise.
     */
    function _exists(uint256 _id) internal view returns (bool) {
        return creators[_id] != address(0);
    }

    /**
     * @dev Recover the signer of a hashed message from a signature.
     * @param _ethSignedMessageHash The hash of the signed message.
     * @param _signature The signature to recover the signer from.
     * @return The address of the signer.
     */
    function recoverSigner(
        bytes32 _ethSignedMessageHash,
        bytes memory _signature
    ) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    /**
     * @dev Split the signature into its components (r, s, v).
     * @param sig The signature to split.
     * @return r The 'r' component of the signature.
     * @return s The 's' component of the signature.
     * @return v The 'v' component of the signature.
     */
    function splitSignature(
        bytes memory sig
    ) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    /**
     * @notice Get the carbon price of a specific token ID.
     * @param tokenId The ID of the token.
     * @return The carbon price associated with the token ID.
     */
    function getCarbonPrice(uint256 tokenId) external view override returns (uint256) {
        return carbonMapPrice[tokenId];
    }
}
