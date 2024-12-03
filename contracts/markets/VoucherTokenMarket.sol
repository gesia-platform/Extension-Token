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
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

contract VoucherTokenMarket is ERC1155Holder {
    using Counters for Counters.Counter;
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    struct MarketItem {
        address voucherContract; // Address of the voucher contract
        uint256 tokenId;         // Token ID of the voucher
        uint256 amount;          // Amount of the voucher
        uint256 price;           // Price per voucher (in USDT with 6 decimals)
        address seller;          // Wallet address of the seller
    }

    mapping(uint256 => MarketItem) public _marketItemMap; // Mapping of market item IDs to MarketItem struct
    mapping(address => bool) public voucherContractMap;   // Mapping to verify voucher contracts
    Counters.Counter private _marketItemIds;             // Counter to generate unique market item IDs
    address public usdtContractAddress;                  // Address of the USDT contract
    address public operatorManager;                      // Address of the operator manager contract
    address public whitelistManager;                     // Address of the whitelist manager contract
    address public feeManager;                           // Address of the fee manager contract
    uint256 public minVoucherAmount = 1;                 // Minimum amount of vouchers required (default is 1)

    // Events
    event VerificationVoucherContract(address indexed voucherContract, bool isVerified);
    event MinPriceChange(uint256 price, bool isBnb);
    event TokenPlaced(
        address indexed voucherContract,
        uint256 indexed marketId,
        uint256 tokenId,
        uint256 amount,
        address seller,
        uint256 price
    );
    event TokenUnPlaced(
        address indexed voucherContract,
        uint256 indexed marketId,
        uint256 tokenId,
        uint256 deductedAmount,
        uint256 remainAmount,
        address seller,
        uint256 price
    );
    event TokenSold(
        address indexed voucherContract,
        uint256 indexed marketId,
        uint256 tokenId,
        uint256 amount,
        address buyer,
        address seller,
        uint256 price,
        uint256 totalPrice,
        uint256 feeAmount,
        uint256 remainAmount
    );

    /**
     * @dev Constructor to initialize the contract with the required addresses.
     * @param _usdtContractAddress Address of the USDT contract.
     * @param _operatorManager Address of the operator manager contract.
     * @param _whitelistManager Address of the whitelist manager contract.
     * @param _feeManager Address of the fee manager contract.
     */
    constructor(
        address _usdtContractAddress,
        address _operatorManager,
        address _whitelistManager,
        address _feeManager
    ) {
        usdtContractAddress = _usdtContractAddress;
        operatorManager = _operatorManager;
        whitelistManager = _whitelistManager;
        feeManager = _feeManager;
    }

    // Fallback function to receive Ether
    receive() external payable {}

    /**
     * @dev Modifier to restrict access to operators only.
     */
    modifier operatorsOnly() {
        require(IOperator(operatorManager).isOperator(msg.sender), "Access restricted to operators only");
        _;
    }

    /**
     * @dev Verify a voucher contract.
     * @param _voucherContract Address of the voucher contract to verify.
     */
    function verifyVoucherContract(address _voucherContract) external operatorsOnly {
        voucherContractMap[_voucherContract] = true;
        emit VerificationVoucherContract(_voucherContract, true);
    }

    /**
     * @dev Unverify a voucher contract.
     * @param _voucherContract Address of the voucher contract to unverify.
     */
    function unVerifyVoucherContract(address _voucherContract) external operatorsOnly {
        voucherContractMap[_voucherContract] = false;
        emit VerificationVoucherContract(_voucherContract, false);
    }

    /**
     * @dev Place a voucher token for sale.
     * @param _tokenId Token ID of the voucher.
     * @param _amount Amount of the voucher.
     * @param _voucherContract Address of the voucher contract.
     * @param _perTokenPrice Price per voucher token (in USDT with 6 decimals).
     */
    function place(
        uint256 _tokenId,
        uint256 _amount,
        address _voucherContract,
        uint256 _perTokenPrice
    ) external {
        require(voucherContractMap[_voucherContract], "Invalid voucher contract");
        require(_amount >= minVoucherAmount, "Amount below minimum limit");
        require(IWhitelist(whitelistManager).isWhitelist(_voucherContract, _tokenId, msg.sender), "Not in whitelist");
        require(_perTokenPrice >= IPrice(_voucherContract).getCarbonPrice(_tokenId), "Price below minimum");

        _marketItemIds.increment();
        uint256 marketId = _marketItemIds.current();

        _marketItemMap[marketId] = MarketItem(
            _voucherContract,
            _tokenId,
            _amount,
            _perTokenPrice,
            msg.sender
        );

        IERC1155(_voucherContract).safeTransferFrom(msg.sender, address(this), _tokenId, _amount, "");
        emit TokenPlaced(_voucherContract, marketId, _tokenId, _amount, msg.sender, _perTokenPrice);
    }

    /**
     * @dev Cancel or deduct voucher tokens from a placed item.
     * @param _marketId ID of the market item.
     * @param _amount Amount of the voucher to deduct.
     */
    function unPlace(uint256 _marketId, uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than zero");

        MarketItem storage marketItem = _marketItemMap[_marketId];
        require(
            marketItem.seller == msg.sender || IOperator(operatorManager).isOperator(msg.sender),
            "Not authorized"
        );
        require(marketItem.amount >= _amount, "Insufficient amount");

        marketItem.amount = marketItem.amount.sub(_amount);
        IERC1155(marketItem.voucherContract).safeTransferFrom(address(this), msg.sender, marketItem.tokenId, _amount, "");
        emit TokenUnPlaced(marketItem.voucherContract, _marketId, marketItem.tokenId, _amount, marketItem.amount, marketItem.seller, marketItem.price);
    }

    /**
     * @dev Purchase voucher tokens using USDT.
     * @param _marketId ID of the market item.
     * @param _amount Amount of the voucher to buy.
     */
    function purchaseInUSDT(uint256 _marketId, uint256 _amount) external {
        require(_amount >= minVoucherAmount, "Amount below minimum limit");

        MarketItem storage marketItem = _marketItemMap[_marketId];
        require(IWhitelist(whitelistManager).isWhitelist(marketItem.voucherContract, marketItem.tokenId, msg.sender), "Not in whitelist");
        require(marketItem.amount >= _amount, "Insufficient voucher amount");

        uint256 totalPrice = marketItem.price.mul(_amount);
        uint256 feeAmount = IFeeManager(feeManager).feeAmount(totalPrice);
        uint256 remainAmount = totalPrice.sub(feeAmount);

        require(IERC1155(marketItem.voucherContract).balanceOf(address(this), marketItem.tokenId) >= _amount, "Contract has insufficient tokens");
        require(IERC20(usdtContractAddress).balanceOf(msg.sender) >= totalPrice, "Insufficient USDT balance");

        marketItem.amount = marketItem.amount.sub(_amount);
        ERC20(usdtContractAddress).safeTransferFrom(msg.sender, marketItem.seller, remainAmount);
        ERC20(usdtContractAddress).safeTransferFrom(msg.sender, IFeeManager(feeManager).feeAddress(), feeAmount);
        IERC1155(marketItem.voucherContract).safeTransferFrom(address(this), msg.sender, marketItem.tokenId, _amount, "");

        emit TokenSold(marketItem.voucherContract, _marketId, marketItem.tokenId, _amount, msg.sender, marketItem.seller, marketItem.price, totalPrice, feeAmount, remainAmount);
    }
}
