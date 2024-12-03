const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('VoucherTokenMarket', function () {
	let usdtContract;
	let operatorManager;
	let whitelistManager;
	let feeManager;
	let voucherMarket;
	let voucherContract;
	let owner;
	let operator;
	let user;
	let seller;
	let buyer;

	// This function runs before each test and sets up the necessary contracts and signers
	beforeEach(async function () {
		// Deconstructing signer objects for various roles (owner, operator, user, seller, buyer)
		[owner, operator, user, seller, buyer] = await ethers.getSigners();

		// Deploying the MockERC20 contract (USDT token)
		const USDT = await ethers.getContractFactory('MockERC20');
		usdtContract = await USDT.deploy('USDT', 'USDT');
		await usdtContract.deployed();

		// Deploying the OperatorManager contract, responsible for managing operators
		const OperatorManager = await ethers.getContractFactory('OperatorManager');
		operatorManager = await OperatorManager.deploy();
		await operatorManager.deployed();

		// Deploying the WhitelistManager contract, responsible for managing whitelists
		const WhitelistManager = await ethers.getContractFactory('WhitelistManager');
		whitelistManager = await WhitelistManager.deploy(operatorManager.address);
		await whitelistManager.deployed();

		// Deploying the FeeManager contract, managing fees related to transactions
		const FeeManager = await ethers.getContractFactory('FeeManager');
		feeManager = await FeeManager.deploy(operatorManager.address, owner.address, 10);
		await feeManager.deployed();

		// Deploying the VoucherTokenMarket contract, which manages the marketplace for voucher tokens
		const VoucherTokenMarket = await ethers.getContractFactory('VoucherTokenMarket');
		voucherMarket = await VoucherTokenMarket.deploy(usdtContract.address, operatorManager.address, whitelistManager.address, feeManager.address);
		await voucherMarket.deployed();

		// Deploying the VoucherToken contract, which handles voucher tokens in the marketplace
		const VoucherContract = await ethers.getContractFactory('VoucherToken');
		voucherContract = await VoucherContract.deploy('CarbonToken', 'CTK', feeManager.address);
		await voucherContract.deployed();

		// Adding the operator to the operator manager by the owner
		await operatorManager.connect(owner).addOperator(operator.address);
	});

	describe('VoucherTokenMarket Contract', function () {
		// Test case to verify the functionality of voucher contract verification
		it('should verify a voucher contract', async function () {
			// Operator verifies the voucher contract
			await voucherMarket.connect(operator).verifyVoucherContract(voucherContract.address);

			// Checking that the voucher contract is verified in the marketplace
			const isVerified = await voucherMarket.voucherContractMap(voucherContract.address);
			expect(isVerified).to.equal(true); // Assert that the contract is verified
		});

		// Test case to place a voucher for sale
		it('should place a voucher for sale', async function () {
			const tokenId = 1; // The unique ID for the voucher token
			const amount = 10; // The amount of tokens being placed for sale
			const metadata = ''; // Metadata associated with the voucher token
			const price = ethers.utils.parseUnits('10', 6); // Price in USDT (10 tokens, 6 decimals)

			// Verifying the voucher contract
			await voucherMarket.connect(operator).verifyVoucherContract(voucherContract.address);

			// Adding the seller to the whitelist for the specific voucher contract and tokenId
			await whitelistManager.connect(operator).addWhitelist(voucherContract.address, tokenId, seller.address);

			// Minting the voucher tokens for the seller
			await voucherContract.mintByOperator(seller.address, amount, tokenId, metadata);

			// Approving the marketplace to transfer the seller's voucher tokens
			await voucherContract.connect(seller).setApprovalForAll(voucherMarket.address, true);

			// Seller places the voucher on the marketplace for sale
			await voucherMarket.connect(seller).place(tokenId, amount, voucherContract.address, price);

			// Fetching the marketplace item and checking the placed information
			const marketItem = await voucherMarket._marketItemMap(1); // Item ID is 1
			expect(marketItem.voucherContract).to.equal(voucherContract.address); // Check contract address
			expect(marketItem.tokenId).to.equal(tokenId); // Check token ID
			expect(marketItem.amount).to.equal(amount); // Check the amount of tokens for sale
			expect(marketItem.price).to.equal(price); // Check the price
			expect(marketItem.seller).to.equal(seller.address); // Check the seller's address
		});

		// Test case to unplace a voucher from sale
		it('should unplace a voucher from sale', async function () {
			const tokenId = 1;
			const amount = 10;
			const metadata = '';
			const price = ethers.utils.parseUnits('10', 6);

			// Verify contract and add seller to whitelist
			await voucherMarket.connect(operator).verifyVoucherContract(voucherContract.address);
			await whitelistManager.connect(operator).addWhitelist(voucherContract.address, tokenId, seller.address);

			// Mint voucher and place it on the marketplace
			await voucherContract.mintByOperator(seller.address, amount, tokenId, metadata);
			await voucherContract.connect(seller).setApprovalForAll(voucherMarket.address, true);
			await voucherMarket.connect(seller).place(tokenId, amount, voucherContract.address, price);

			// Unplace the voucher from the marketplace (item ID = 1)
			await voucherMarket.connect(seller).unPlace(1, amount);

			// Fetch the market item and verify the amount is set to 0 (unlisted)
			const marketItem = await voucherMarket._marketItemMap(1);
			expect(marketItem.amount).to.equal(0); // Ensure the amount is 0, indicating unlisted
		});

		// Test case for a user to purchase a voucher using USDT
		it('should allow a user to purchase a voucher in USDT', async function () {
			const tokenId = 1;
			const amount = 1;
			const metadata = '';
			const price = ethers.utils.parseUnits('10', 6); // Price for 1 voucher in USDT

			// Verify the voucher contract and add both seller and buyer to the whitelist
			await voucherMarket.connect(operator).verifyVoucherContract(voucherContract.address);
			await whitelistManager.connect(operator).addWhitelist(voucherContract.address, tokenId, seller.address);
			await whitelistManager.connect(operator).addWhitelist(voucherContract.address, tokenId, buyer.address);

			// Mint a single voucher token to the seller
			await voucherContract.mintByOperator(seller.address, amount, tokenId, metadata);

			// Approve the marketplace to handle the seller's voucher token
			await voucherContract.connect(seller).setApprovalForAll(voucherMarket.address, true);

			// Seller places the voucher on the marketplace
			await voucherMarket.connect(seller).place(tokenId, amount, voucherContract.address, price);

			// Calculate total price and fee amount (1% fee)
			const totalPrice = price.mul(amount);
			const feeAmount = totalPrice.mul(1).div(100); // 1% fee
			const remainAmount = totalPrice.sub(feeAmount); // Amount after fee

			// Mint USDT for the buyer and approve the marketplace to spend it
			await usdtContract.connect(owner).mint(buyer.address, totalPrice);
			await usdtContract.connect(buyer).approve(voucherMarket.address, totalPrice);

			// Buyer purchases the voucher from the marketplace
			await voucherMarket.connect(buyer).purchaseInUSDT(1, amount);

			// Fetch the seller's and buyer's balances of USDT after the transaction
			const sellerBalance = await usdtContract.balanceOf(seller.address);
			const buyerBalance = await usdtContract.balanceOf(buyer.address);

			// Assert that the seller receives the amount minus the fee
			expect(sellerBalance).to.equal(remainAmount);
			// Assert that the buyer's balance is 0 after the purchase
			expect(buyerBalance).to.equal(0);
		});
	});
});
