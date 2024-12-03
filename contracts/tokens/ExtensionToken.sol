// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../operator/IOperator.sol";
import "../fee/IFeeManager.sol";
import "../price/IPrice.sol";

contract ExtensionToken is ERC1155, ReentrancyGuard, IPrice {
    using Strings for string;
    using SafeMath for uint256;
    using Counters for Counters.Counter;

    // Mapping for token supplies and balances
    mapping(uint256 => uint256) public tokenSupply;
    mapping(bytes32 => bool) private transactionHashes;
    mapping(uint256 => mapping(address => uint256)) internal balances;
    mapping(uint256 => address) public creators;
    mapping(uint256 => string) tokenURIs;  // URI for each token
    string public name;  // Token name
    string public symbol;  // Token symbol

    mapping(uint256 => uint256) private _tokenWeight; // Token weight for each tokenId

    address public voucherAddress;  // Address for the voucher contract
    uint256 public voucherTokenId;  // Token ID for the voucher
    address public operatorManager;  // Operator manager address
    address public feeManager;  // Fee manager address
    uint256 public feeAmount = 100;  // Fee amount (1%)
    uint256 public minUSDTPrice = 10000;  // Minimum USDT price threshold (0.01 USDT)

    Counters.Counter private _tokenIdTracker; // Token ID counter, incrementing by 1
    uint256 private carbonPrice;  // Carbon price value
    mapping(uint256 => uint256) private carbonMapPrice;  // Mapping of token ID to carbon price

    /**
     * @notice Constructor to initialize the contract with the provided values.
     * @param _name The name of the token.
     * @param _symbol The symbol of the token.
     * @param _operatorManager The address of the operator manager contract.
     * @param _feeManager The address of the fee manager contract.
     * @param _voucherAddress The address of the voucher contract.
     * @param _tokenId The token ID for the voucher.
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _operatorManager,
        address _feeManager,
        address _voucherAddress,
        uint256 _tokenId
    ) ERC1155("") {
        name = _name;
        symbol = _symbol;
        voucherAddress = _voucherAddress;
        voucherTokenId = _tokenId;
        operatorManager = _operatorManager;
        feeManager = _feeManager;
        _tokenIdTracker.increment();  // Start token ID from 1
    }

    /**
     * @notice Modifier to restrict access to operators only.
     */
    modifier operatorsOnly() {
        require(IOperator(operatorManager).isOperator(msg.sender), "#operatorsOnly: Caller is not an operator");
        _;
    }

    /**
     * @notice Function to mint new carbon tokens.
     * @param _from The address minting the token.
     * @param _carbonAmount The amount of carbon being minted.
     * @param _nonce A unique nonce for the transaction.
     * @param _metadata Metadata URI for the token.
     * @param _signature The signature to verify the transaction.
     * @param _carbonPrice The price of the carbon token in USDT.
     * @dev This function mints a new carbon token, verifies the transaction signature, and transfers the token.
     */
    function mint(
        address _from,
        uint256 _carbonAmount,
        uint256 _nonce,
        string memory _metadata,
        bytes memory _signature,
        uint256 _carbonPrice
    ) external operatorsOnly {
        require(_carbonAmount > 0, "must be higher than zero");
        require(_carbonPrice >= minUSDTPrice, "price must be higher than min");
        require(_carbonPrice > carbonMapPrice[_tokenIdTracker.current()], "price must be higher than old");

        // Hash the message for signature validation
        bytes32 hashMessage = keccak256(abi.encodePacked(_from, _carbonAmount, _nonce, address(this)));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hashMessage));
        address signer = recoverSigner(hash, _signature);
        require(signer == _from, "Signature does not match the sender");
        require(!transactionHashes[hashMessage], "Transaction already processed");
        transactionHashes[hashMessage] = true;

        // Check if the user has enough balance in the voucher contract
        require(IERC1155(voucherAddress).balanceOf(_from, voucherTokenId) >= _carbonAmount, "lack of carbon balance");

        // Calculate and transfer the fee to the company owner
        uint256 calculatedAmount = IFeeManager(feeManager).feeAmount(_carbonAmount);
        uint256 remainAmount = _carbonAmount.sub(calculatedAmount);
        IERC1155(voucherAddress).safeTransferFrom(_from, IFeeManager(feeManager).feeAddress(), voucherTokenId, calculatedAmount, "");

        // Create new token and store information
        creators[_tokenIdTracker.current()] = _from;
        tokenURIs[_tokenIdTracker.current()] = _metadata;
        tokenSupply[_tokenIdTracker.current()] = remainAmount;
        _mint(_from, _tokenIdTracker.current(), remainAmount, "");
        _tokenWeight[_tokenIdTracker.current()] = remainAmount;
        carbonMapPrice[_tokenIdTracker.current()] = _carbonPrice;
        _tokenIdTracker.increment();
    }

    /**
     * @notice Function to transfer tokens with a signature.
     * @param from The sender address.
     * @param to The receiver address.
     * @param tokenId The token ID being transferred.
     * @param amount The amount of tokens being transferred.
     * @param nonce A unique nonce for the transaction.
     * @param signature The signature to verify the transfer.
     * @dev This function transfers tokens with the signature verification to prevent unauthorized transfers.
     */
    function transferWithSignature(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external nonReentrant operatorsOnly {
        require(msg.sender == to, "Only receiver call");

        // Hash the message for signature validation
        bytes32 hashMessage = keccak256(abi.encodePacked(from, to, tokenId, amount, nonce, address(this)));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hashMessage));
        address signer = recoverSigner(hash, signature);
        require(signer == from, "Signature does not match the sender");
        require(!transactionHashes[hashMessage], "Transaction already processed");
        transactionHashes[hashMessage] = true;

        // Ensure sender has enough carbon balance
        require(IERC1155(voucherAddress).balanceOf(from, voucherTokenId) >= amount, "lack of carbon balance");

        // Calculate and transfer the fee
        uint256 calculatedAmount = IFeeManager(feeManager).feeAmount(amount);
        uint256 remainAmount = amount.sub(calculatedAmount);
        IERC1155(voucherAddress).safeTransferFrom(from, IFeeManager(feeManager).feeAddress(), voucherTokenId, calculatedAmount, "");

        // Perform token transfer
        _safeTransferFrom(from, to, tokenId, remainAmount, "");
    }

    /**
     * @notice Function to transfer tokens as a gift without a fee.
     * @param from The sender address.
     * @param to The receiver address.
     * @param tokenId The token ID being transferred.
     * @param amount The amount of tokens being transferred.
     * @param nonce A unique nonce for the transaction.
     * @param signature The signature to verify the transfer.
     * @dev This function transfers tokens as a gift, without any fee.
     */
    function transferWithGift(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external nonReentrant {
        require(msg.sender == to, "Only receiver call");

        // Hash the message for signature validation
        bytes32 hashMessage = keccak256(abi.encodePacked(from, to, tokenId, amount, nonce, address(this)));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hashMessage));
        address signer = recoverSigner(hash, signature);
        require(signer == from, "Signature does not match the sender");
        require(!transactionHashes[hashMessage], "Transaction already processed");
        transactionHashes[hashMessage] = true;

        // Perform token transfer
        _safeTransferFrom(from, to, tokenId, amount, "");
    }

    /**
     * @notice Retrieves the carbon price for a specific tokenId.
     * @param tokenId The ID of the token whose price is to be fetched.
     * @return The price of the token in USDT.
     */
    function getCarbonPrice(uint256 tokenId) public view returns (uint256) {
        return carbonMapPrice[tokenId];
    }

    /**
     * @dev Internal function to recover the signer from a hashed message.
     * @param _hash The message hash.
     * @param _signature The signature of the message.
     * @return The address of the signer.
     */
    function recoverSigner(bytes32 _hash, bytes memory _signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_hash, v, r, s);
    }

    /**
     * @dev Internal function to split the signature into its components.
     * @param _signature The full signature.
     */
    function splitSignature(bytes memory _signature) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(_signature.length == 65, "invalid signature length");
        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := byte(0, mload(add(_signature, 96)))
        }
    }
}
