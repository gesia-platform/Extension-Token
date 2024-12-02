const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('DerivativeTokenMarket', function () {
	let derivativeTokenMarket;
	let usdtContract;
	let operatorManager;
	let whitelistManager;
	let feeManager;
	let carbon1155DerivativeToken;
	let voucherContract;
	let owner;
	let operator;
	let user;
	let seller;
	let buyer;
	let voucherTokenId = 1;
	let derivativeTokenId = 1;
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

		const Voucher1155DerivativeToken = await ethers.getContractFactory('Voucher1155DerivativeToken');
		voucherContract = await Voucher1155DerivativeToken.deploy('VoucherToken', 'VT', feeManager.address);
		await voucherContract.deployed();

		// Deploy the VoucherMarket contract
		const Carbon1155DerivativeToken = await ethers.getContractFactory('Carbon1155DerivativeToken');
		carbon1155DerivativeToken = await Carbon1155DerivativeToken.deploy('CarbonToken', 'CTK', operatorManager.address, feeManager.address, voucherContract.address, voucherTokenId);
		await carbon1155DerivativeToken.deployed();

		// Deploy DerivativeTokenMarket
		const DerivativeTokenMarket = await ethers.getContractFactory('DerivativeTokenMarket');
		derivativeTokenMarket = await DerivativeTokenMarket.deploy(usdtContract.address, whitelistManager.address, operatorManager.address, feeManager.address);
		await derivativeTokenMarket.deployed();

		await operatorManager.connect(owner).addOperator(operator.address);
	});

	describe('Market Actions', function () {
		it('should place a token on the market', async function () {
			const carbonAmount = 100;
			const nonce = 1;
			const metadata = '';
			const carbonPrice = ethers.utils.parseUnits('10', 6); // Price in USDT (6 decimals)

			await voucherContract.mintByOperator(seller.address, carbonAmount, voucherTokenId, metadata);
			await voucherContract.connect(seller).setApprovalForAll(carbon1155DerivativeToken.address, true);

			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [seller.address, carbonAmount, nonce, carbon1155DerivativeToken.address]);
			const signature = await seller.signMessage(ethers.utils.arrayify(messageHash));
			await carbon1155DerivativeToken.connect(operator).mint(seller.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Set approval for the voucher market to transfer tokens on behalf of the seller
			await carbon1155DerivativeToken.connect(seller).setApprovalForAll(derivativeTokenMarket.address, true);

			// Place token on market
			await derivativeTokenMarket.connect(operator).verifyDerivativeTokenContract(carbon1155DerivativeToken.address);
			await derivativeTokenMarket.connect(seller).place(carbonAmount * feeAmount, carbon1155DerivativeToken.address, derivativeTokenId, carbonPrice);

			const marketItem = await derivativeTokenMarket._marketItemMap(1);

			expect(marketItem.seller).to.equal(seller.address);
			expect(marketItem.amount).to.equal(carbonAmount * feeAmount);
			expect(marketItem.price).to.equal(carbonPrice);
		});

		it('should not allow placing tokens from an unverified contract', async function () {
			const amount = 10;
			const price = ethers.utils.parseUnits('1', 6); // 1 USDT per token

			await expect(derivativeTokenMarket.connect(seller).place(amount, carbon1155DerivativeToken.address, 2, price)).to.be.revertedWith('Not Valid Derivative Token Contract');
		});

		it('should unplace a token from the market', async function () {
			const carbonAmount = 100;
			const nonce = 1;
			const metadata = '';
			const carbonPrice = ethers.utils.parseUnits('10', 6); // Price in USDT (6 decimals)

			await voucherContract.mintByOperator(seller.address, carbonAmount, voucherTokenId, metadata);
			await voucherContract.connect(seller).setApprovalForAll(carbon1155DerivativeToken.address, true);

			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [seller.address, carbonAmount, nonce, carbon1155DerivativeToken.address]);
			const signature = await seller.signMessage(ethers.utils.arrayify(messageHash));
			await carbon1155DerivativeToken.connect(operator).mint(seller.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Set approval for the voucher market to transfer tokens on behalf of the seller
			await carbon1155DerivativeToken.connect(seller).setApprovalForAll(derivativeTokenMarket.address, true);

			// Place token on market
			await derivativeTokenMarket.connect(operator).verifyDerivativeTokenContract(carbon1155DerivativeToken.address);
			await derivativeTokenMarket.connect(seller).place(carbonAmount * feeAmount, carbon1155DerivativeToken.address, derivativeTokenId, carbonPrice);

			// Unplace token
			await derivativeTokenMarket.connect(seller).unPlace(1, carbonAmount * feeAmount);

			const marketItem = await derivativeTokenMarket._marketItemMap(1);
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
			await voucherContract.connect(seller).setApprovalForAll(carbon1155DerivativeToken.address, true);

			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [seller.address, carbonAmount, nonce, carbon1155DerivativeToken.address]);
			const signature = await seller.signMessage(ethers.utils.arrayify(messageHash));
			await carbon1155DerivativeToken.connect(operator).mint(seller.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Set approval for the voucher market to transfer tokens on behalf of the seller
			await carbon1155DerivativeToken.connect(seller).setApprovalForAll(derivativeTokenMarket.address, true);

			// Place token on market
			await derivativeTokenMarket.connect(operator).verifyDerivativeTokenContract(carbon1155DerivativeToken.address);
			await derivativeTokenMarket.connect(seller).place(amount, carbon1155DerivativeToken.address, derivativeTokenId, carbonPrice);

			// Mint USDT for buyer and approve
			await usdtContract.mint(buyer.address, totalPrice);
			await usdtContract.connect(buyer).approve(derivativeTokenMarket.address, totalPrice);

			// Purchase token
			await derivativeTokenMarket.connect(buyer).purchaseInUSDT(1, amount);

			const marketItem = await derivativeTokenMarket._marketItemMap(1);
			expect(marketItem.amount).to.equal(0);

			const sellerBalance = await usdtContract.balanceOf(seller.address);
			expect(sellerBalance).to.equal(ethers.utils.parseUnits('10', 6).mul(amount) * feeAmount);

			const buyerBalance = await carbon1155DerivativeToken.balanceOf(buyer.address, 1);
			expect(buyerBalance).to.equal(amount);
		});
	});
});
