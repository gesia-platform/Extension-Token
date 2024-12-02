const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('VoucherMarket', function () {
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

	beforeEach(async function () {
		// Get signers
		[owner, operator, user, seller, buyer] = await ethers.getSigners();

		// Deploy the necessary contracts

		// Deploy Mock ERC20 contract for USDT
		const USDT = await ethers.getContractFactory('MockERC20'); // Mock ERC20 for USDT
		usdtContract = await USDT.deploy('USDT', 'USDT');
		await usdtContract.deployed();

		// Deploy the OperatorManager contract
		const OperatorManager = await ethers.getContractFactory('OperatorManager');
		operatorManager = await OperatorManager.deploy();
		await operatorManager.deployed();

		// Deploy the WhitelistManager contract
		const WhitelistManager = await ethers.getContractFactory('WhitelistManager');
		whitelistManager = await WhitelistManager.deploy(operatorManager.address);
		await whitelistManager.deployed();

		// Deploy the FeeManager contract
		const FeeManager = await ethers.getContractFactory('FeeManager');
		feeManager = await FeeManager.deploy(operatorManager.address, owner.address, 10);
		await feeManager.deployed();

		// Deploy the VoucherMarket contract
		const VoucherMarket = await ethers.getContractFactory('VoucherMarket');
		voucherMarket = await VoucherMarket.deploy(usdtContract.address, operatorManager.address, whitelistManager.address, feeManager.address);
		await voucherMarket.deployed();

		// Deploy the Voucher Contract (ERC1155)
		const VoucherContract = await ethers.getContractFactory('Voucher1155DerivativeToken');
		voucherContract = await VoucherContract.deploy('CarbonToken', 'CTK', feeManager.address);
		await voucherContract.deployed();

		// Add the operator
		await operatorManager.connect(owner).addOperator(operator.address);
	});

	describe('VoucherMarket Contract', function () {
		// Test case for verifying a voucher contract
		it('should verify a voucher contract', async function () {
			// Verify the voucher contract with the voucher market
			await voucherMarket.connect(operator).verifyVoucherContract(voucherContract.address);

			// Check if the voucher contract is correctly verified in the VoucherMarket
			const isVerified = await voucherMarket.voucherContractMap(voucherContract.address);
			expect(isVerified).to.equal(true);
		});

		// Test case for placing a voucher for sale
		it('should place a voucher for sale', async function () {
			const tokenId = 1;
			const amount = 10;
			const metadata = '';
			const price = ethers.utils.parseUnits('10', 6); // Price in USDT (6 decimals)

			// Verify voucher contract and add seller to the whitelist
			await voucherMarket.connect(operator).verifyVoucherContract(voucherContract.address);
			await whitelistManager.connect(operator).addWhitelist(voucherContract.address, tokenId, seller.address);

			// Mint vouchers for the seller
			await voucherContract.mintByOperator(seller.address, amount, tokenId, metadata);

			// Set approval for the voucher market to transfer tokens on behalf of the seller
			await voucherContract.connect(seller).setApprovalForAll(voucherMarket.address, true);

			// Seller places the voucher for sale on the market
			await voucherMarket.connect(seller).place(tokenId, amount, voucherContract.address, price);

			// Fetch the market item to verify it's correctly placed for sale
			const marketItem = await voucherMarket._marketItemMap(1);
			expect(marketItem.voucherContract).to.equal(voucherContract.address);
			expect(marketItem.tokenId).to.equal(tokenId);
			expect(marketItem.amount).to.equal(amount);
			expect(marketItem.price).to.equal(price);
			expect(marketItem.seller).to.equal(seller.address);
		});

		// Test case for unplacing a voucher from sale
		it('should unplace a voucher from sale', async function () {
			const tokenId = 1;
			const amount = 10;
			const metadata = '';
			const price = ethers.utils.parseUnits('10', 6); // Price in USDT (6 decimals)

			// Verify voucher contract and add seller to the whitelist
			await voucherMarket.connect(operator).verifyVoucherContract(voucherContract.address);
			await whitelistManager.connect(operator).addWhitelist(voucherContract.address, tokenId, seller.address);

			// Mint vouchers for the seller
			await voucherContract.mintByOperator(seller.address, amount, tokenId, metadata);

			// Set approval for the voucher market to transfer tokens on behalf of the seller
			await voucherContract.connect(seller).setApprovalForAll(voucherMarket.address, true);

			// Seller places the voucher for sale on the market
			await voucherMarket.connect(seller).place(tokenId, amount, voucherContract.address, price);

			// Unplace the voucher from sale
			await voucherMarket.connect(seller).unPlace(1, amount);

			// Fetch the market item and verify that the amount is now 0 (unplaced)
			const marketItem = await voucherMarket._marketItemMap(1);
			expect(marketItem.amount).to.equal(0);
		});

		// Test case for purchasing a voucher with USDT
		it('should allow a user to purchase a voucher in USDT', async function () {
			const tokenId = 1;
			const amount = 1;
			const metadata = '';
			const price = ethers.utils.parseUnits('10', 6); // Price in USDT (6 decimals)

			// Verify voucher contract and add both seller and buyer to the whitelist
			await voucherMarket.connect(operator).verifyVoucherContract(voucherContract.address);
			await whitelistManager.connect(operator).addWhitelist(voucherContract.address, tokenId, seller.address);
			await whitelistManager.connect(operator).addWhitelist(voucherContract.address, tokenId, buyer.address);

			// Mint the voucher for the seller
			await voucherContract.mintByOperator(seller.address, amount, tokenId, metadata);

			// Set approval for the voucher market to transfer tokens on behalf of the seller
			await voucherContract.connect(seller).setApprovalForAll(voucherMarket.address, true);

			// Seller places the voucher for sale on the market
			await voucherMarket.connect(seller).place(tokenId, amount, voucherContract.address, price);

			// Calculate the total price, fee, and remaining amount after fee deduction
			const totalPrice = price.mul(amount);
			const feeAmount = totalPrice.mul(1).div(100); // 1% fee
			const remainAmount = totalPrice.sub(feeAmount);

			// Mint USDT to the buyer and approve the voucher market to spend it
			await usdtContract.connect(owner).mint(buyer.address, totalPrice);
			await usdtContract.connect(buyer).approve(voucherMarket.address, totalPrice);

			// Buyer purchases the voucher with USDT
			await voucherMarket.connect(buyer).purchaseInUSDT(1, amount);

			// Fetch the balances of seller and buyer after the purchase
			const sellerBalance = await usdtContract.balanceOf(seller.address);
			const buyerBalance = await usdtContract.balanceOf(buyer.address);

			// Verify the seller received the correct amount after deducting the fee
			expect(sellerBalance).to.equal(remainAmount);
			// Verify the buyer's balance is now 0 (since they spent all their USDT)
			expect(buyerBalance).to.equal(0);
		});
	});
});
