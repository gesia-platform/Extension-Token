// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../operator/IOperator.sol";
import "../whitelist/IWhitelist.sol";
import "../fee/IFeeManager.sol";
import "../price/IPrice.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

contract ExtensionTokenMarket is ERC1155Holder {
    using Counters for Counters.Counter;
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    struct ExtensionTokenMarketItem {
        address contractAddress; // Extension token contract address
        uint256 tokenId; // Token ID of the extension token
        uint256 amount; // Amount of the token listed for sale
        uint256 price;  // Price per token (in USDT or BNB)
        address seller; // Wallet address of the seller
    }

    mapping(uint256 => ExtensionTokenMarketItem) public _marketItemMap; // Mapping of market ID to market items
    mapping(address => bool) public extensionTokenContractMap; // Verified extension token contracts
    Counters.Counter private _marketItemIds; // Counter for market item IDs
    address public usdtContractAddress; // Address of the USDT contract
    address public operatorManager; // Address of the operator manager
    address public whitelistManager; // Address of the whitelist manager
    address public feeManager; // Address of the fee manager
    bool public isWhitelistEnabled; // Toggle for whitelist functionality

    // Events
    event MinPriceChange(uint256 price, bool isBnb);
    event VerificationExtensionTokenContract(address indexed extensionTokenContract, bool isVerified);
    event TokenPlaced(address indexed extensionTokenContract, uint256 indexed tokenId, uint256 indexed marketId, uint256 amount, address seller, uint256 price);
    event TokenUnPlaced(address indexed extensionTokenContract, uint256 indexed tokenId, uint256 indexed marketId, uint256 deductedAmount, uint256 remainAmount, address seller, uint256 price);
    event TokenSold(address indexed extensionTokenContract, uint256 indexed tokenId, uint256 indexed marketId, uint256 amount, address buyer, address seller, uint256 price, uint256 totalPrice, uint256 feeAmount, uint256 remainAmount);

    /**
     * @dev Constructor to initialize the contract with required addresses.
     * @param _usdtContractAddress Address of the USDT contract.
     * @param _whitelistManager Address of the whitelist manager.
     * @param _operatorManager Address of the operator manager.
     * @param _feeManager Address of the fee manager.
     */
    constructor(
        address _usdtContractAddress,
        address _whitelistManager,
        address _operatorManager,
        address _feeManager
    ) {
        usdtContractAddress = _usdtContractAddress;
        whitelistManager = _whitelistManager;
        operatorManager = _operatorManager;
        feeManager = _feeManager;
    }

    /**
     * @dev Fallback function to receive native currency.
     */
    receive() external payable {}

    /**
     * @dev Modifier to restrict access to operators only.
     */
    modifier operatorsOnly() {
        require(IOperator(operatorManager).isOperator(msg.sender), "#operatorsOnly:");
        _;
    }

    /**
     * @dev Enable or disable the whitelist functionality.
     * @param _status Boolean value to enable or disable the whitelist.
     */
    function changeWhitelistStatus(bool _status) external operatorsOnly {
        isWhitelistEnabled = _status;
    }

    /**
     * @dev Verify a extension token contract.
     * @param _extensionTokenContract Address of the extension token contract.
     */
    function verifyExtensionTokenContract(address _extensionTokenContract) external operatorsOnly {
        extensionTokenContractMap[_extensionTokenContract] = true;
        emit VerificationExtensionTokenContract(_extensionTokenContract, true);
    }

    /**
     * @dev Unverify a extension token contract.
     * @param _extensionTokenContract Address of the extension token contract.
     */
    function unVerifyExtensionTokenContract(address _extensionTokenContract) external operatorsOnly {
        extensionTokenContractMap[_extensionTokenContract] = false;
        emit VerificationExtensionTokenContract(_extensionTokenContract, false);
    }

    /**
     * @dev Place a extension token on the marketplace for sale.
     * @param _amount Number of tokens to sell.
     * @param _extensionTokenContract Address of the token contract.
     * @param _tokenId Token ID to list.
     * @param _perExtensionTokenPrice Price per token.
     */
    function place(uint256 _amount, address _extensionTokenContract, uint256 _tokenId, uint256 _perExtensionTokenPrice) external {
        require(extensionTokenContractMap[_extensionTokenContract], "Not Valid Extension Token Contract");
        require(_amount > 0, "Must be higher than zero");
        require(_perExtensionTokenPrice >= IPrice(_extensionTokenContract).getCarbonPrice(_tokenId), "min carbon price issue");
        if (isWhitelistEnabled) {
            require(IWhitelist(whitelistManager).isWhitelist(_extensionTokenContract, _tokenId, msg.sender), "not in whitelist");
        }

        _marketItemIds.increment();
        uint256 marketId = _marketItemIds.current();

        _marketItemMap[marketId] = ExtensionTokenMarketItem(
            _extensionTokenContract,
            _tokenId,
            _amount,
            _perExtensionTokenPrice,
            msg.sender
        );

        IERC1155(_extensionTokenContract).safeTransferFrom(msg.sender, address(this), _tokenId, _amount, "");
        emit TokenPlaced(_extensionTokenContract, _tokenId, marketId, _amount, msg.sender, _perExtensionTokenPrice);
    }

    /**
     * @dev Remove a token from the marketplace.
     * @param _marketId Market ID of the token to unplace.
     * @param _amount Number of tokens to remove.
     */
    function unPlace(uint256 _marketId, uint256 _amount) external {
        require(_amount > 0, "Must be higher than zero");

        ExtensionTokenMarketItem storage marketItem = _marketItemMap[_marketId];
        require(marketItem.seller == msg.sender || IOperator(operatorManager).isOperator(msg.sender), "Not ownerOf or Operators");
        require(marketItem.amount >= _amount, "Not Enough amount");

        marketItem.amount = marketItem.amount.sub(_amount);
        IERC1155(marketItem.contractAddress).safeTransferFrom(address(this), msg.sender, marketItem.tokenId, _amount, "");
        emit TokenUnPlaced(marketItem.contractAddress, marketItem.tokenId, _marketId, _amount, marketItem.amount, marketItem.seller, marketItem.price);
    }

    /**
     * @dev Purchase a token listed on the marketplace using USDT.
     * @param _marketId Market ID of the token to purchase.
     * @param _amount Number of tokens to buy.
     */
    function purchaseInUSDT(uint256 _marketId, uint256 _amount) external {
        require(_amount > 0, "Must be higher than zero");

        ExtensionTokenMarketItem storage marketItem = _marketItemMap[_marketId];
        require(marketItem.amount >= _amount, "Not Enough amount");
        if (isWhitelistEnabled) {
            require(IWhitelist(whitelistManager).isWhitelist(marketItem.contractAddress, marketItem.tokenId, msg.sender), "not in whitelist");
        }

        uint256 totalPrice = marketItem.price.mul(_amount);
        uint256 feeAmount = IFeeManager(feeManager).feeAmount(totalPrice);
        uint256 remainAmount = totalPrice.sub(feeAmount);

        require(ERC20(usdtContractAddress).balanceOf(msg.sender) >= totalPrice, "Lack Of USDT");
        marketItem.amount = marketItem.amount.sub(_amount);

        ERC20(usdtContractAddress).safeTransferFrom(msg.sender, marketItem.seller, remainAmount);
        ERC20(usdtContractAddress).safeTransferFrom(msg.sender, IFeeManager(feeManager).feeAddress(), feeAmount);
        IERC1155(marketItem.contractAddress).safeTransferFrom(address(this), msg.sender, marketItem.tokenId, _amount, "");

        emit TokenSold(marketItem.contractAddress, marketItem.tokenId, _marketId, _amount, msg.sender, marketItem.seller, marketItem.price, totalPrice, feeAmount, remainAmount);
    }
}
