const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ExtensionTokenMarket', function () {
	let extensionTokenMarket;
	let usdtContract;
	let operatorManager;
	let whitelistManager;
	let feeManager;
	let extensionToken;
	let voucherContract;
	let owner;
	let operator;
	let user;
	let seller;
	let buyer;
	let voucherTokenId = 1;
	let extensionTokenId = 1;
	const feeAmount = 0.99;

	beforeEach(async function () {
		// Setup accounts
		[owner, operator, user, seller, buyer] = await ethers.getSigners();

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

		const VoucherToken = await ethers.getContractFactory('VoucherToken');
		voucherContract = await VoucherToken.deploy('VoucherToken', 'VT', feeManager.address);
		await voucherContract.deployed();

		// Deploy the VoucherMarket contract
		const ExtensionToken = await ethers.getContractFactory('ExtensionToken');
		extensionToken = await ExtensionToken.deploy('CarbonToken', 'CTK', operatorManager.address, feeManager.address, voucherContract.address, voucherTokenId);
		await extensionToken.deployed();

		// Deploy ExtensionTokenMarket
		const ExtensionTokenMarket = await ethers.getContractFactory('ExtensionTokenMarket');
		extensionTokenMarket = await ExtensionTokenMarket.deploy(usdtContract.address, whitelistManager.address, operatorManager.address, feeManager.address);
		await extensionTokenMarket.deployed();

		await operatorManager.connect(owner).addOperator(operator.address);
	});

	describe('Market Actions', function () {
		it('should place a token on the market', async function () {
			const carbonAmount = 100;
			const nonce = 1;
			const metadata = '';
			const carbonPrice = ethers.utils.parseUnits('10', 6); // Price in USDT (6 decimals)

			await voucherContract.mintByOperator(seller.address, carbonAmount, voucherTokenId, metadata);
			await voucherContract.connect(seller).setApprovalForAll(extensionToken.address, true);

			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [seller.address, carbonAmount, nonce, extensionToken.address]);
			const signature = await seller.signMessage(ethers.utils.arrayify(messageHash));
			await extensionToken.connect(operator).mint(seller.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Set approval for the voucher market to transfer tokens on behalf of the seller
			await extensionToken.connect(seller).setApprovalForAll(extensionTokenMarket.address, true);

			// Place token on market
			await extensionTokenMarket.connect(operator).verifyExtensionTokenContract(extensionToken.address);
			await extensionTokenMarket.connect(seller).place(carbonAmount * feeAmount, extensionToken.address, extensionTokenId, carbonPrice);

			const marketItem = await extensionTokenMarket._marketItemMap(1);

			expect(marketItem.seller).to.equal(seller.address);
			expect(marketItem.amount).to.equal(carbonAmount * feeAmount);
			expect(marketItem.price).to.equal(carbonPrice);
		});

		it('should not allow placing tokens from an unverified contract', async function () {
			const amount = 10;
			const price = ethers.utils.parseUnits('1', 6); // 1 USDT per token

			await expect(extensionTokenMarket.connect(seller).place(amount, extensionToken.address, 2, price)).to.be.revertedWith('Not Valid Extension Token Contract');
		});

		it('should unplace a token from the market', async function () {
			const carbonAmount = 100;
			const nonce = 1;
			const metadata = '';
			const carbonPrice = ethers.utils.parseUnits('10', 6); // Price in USDT (6 decimals)

			await voucherContract.mintByOperator(seller.address, carbonAmount, voucherTokenId, metadata);
			await voucherContract.connect(seller).setApprovalForAll(extensionToken.address, true);

			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [seller.address, carbonAmount, nonce, extensionToken.address]);
			const signature = await seller.signMessage(ethers.utils.arrayify(messageHash));
			await extensionToken.connect(operator).mint(seller.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Set approval for the voucher market to transfer tokens on behalf of the seller
			await extensionToken.connect(seller).setApprovalForAll(extensionTokenMarket.address, true);

			// Place token on market
			await extensionTokenMarket.connect(operator).verifyExtensionTokenContract(extensionToken.address);
			await extensionTokenMarket.connect(seller).place(carbonAmount * feeAmount, extensionToken.address, extensionTokenId, carbonPrice);

			// Unplace token
			await extensionTokenMarket.connect(seller).unPlace(1, carbonAmount * feeAmount);

			const marketItem = await extensionTokenMarket._marketItemMap(1);
			expect(marketItem.amount).to.equal(0);
		});

		it('should purchase a token using USDT', async function () {
			const carbonAmount = 100;
			const nonce = 1;
			const metadata = '';
			const carbonPrice = ethers.utils.parseUnits('10', 6); // Price in USDT (6 decimals)
			const totalPrice = carbonPrice.mul(carbonAmount);
			const amount = carbonAmount * feeAmount;

			await voucherContract.mintByOperator(seller.address, carbonAmount, voucherTokenId, metadata);
			await voucherContract.connect(seller).setApprovalForAll(extensionToken.address, true);

			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [seller.address, carbonAmount, nonce, extensionToken.address]);
			const signature = await seller.signMessage(ethers.utils.arrayify(messageHash));
			await extensionToken.connect(operator).mint(seller.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Set approval for the voucher market to transfer tokens on behalf of the seller
			await extensionToken.connect(seller).setApprovalForAll(extensionTokenMarket.address, true);

			// Place token on market
			await extensionTokenMarket.connect(operator).verifyExtensionTokenContract(extensionToken.address);
			await extensionTokenMarket.connect(seller).place(amount, extensionToken.address, extensionTokenId, carbonPrice);

			// Mint USDT for buyer and approve
			await usdtContract.mint(buyer.address, totalPrice);
			await usdtContract.connect(buyer).approve(extensionTokenMarket.address, totalPrice);

			// Purchase token
			await extensionTokenMarket.connect(buyer).purchaseInUSDT(1, amount);

			const marketItem = await extensionTokenMarket._marketItemMap(1);
			expect(marketItem.amount).to.equal(0);

			const sellerBalance = await usdtContract.balanceOf(seller.address);
			expect(sellerBalance).to.equal(ethers.utils.parseUnits('10', 6).mul(amount) * feeAmount);

			const buyerBalance = await extensionToken.balanceOf(buyer.address, 1);
			expect(buyerBalance).to.equal(amount);
		});
	});
});
