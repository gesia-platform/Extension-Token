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

	// This block is executed before each test case
	beforeEach(async function () {
		[owner, operator, user, seller, buyer] = await ethers.getSigners(); // Retrieve signer accounts

		// Deploying a mock USDT ERC20 contract for testing
		const USDT = await ethers.getContractFactory('MockERC20');
		usdtContract = await USDT.deploy('USDT', 'USDT');
		await usdtContract.deployed();

		// Deploying OperatorManager contract for managing operators
		const OperatorManager = await ethers.getContractFactory('OperatorManager');
		operatorManager = await OperatorManager.deploy();
		await operatorManager.deployed();

		// Deploying WhitelistManager contract to handle whitelisting of addresses
		const WhitelistManager = await ethers.getContractFactory('WhitelistManager');
		whitelistManager = await WhitelistManager.deploy(operatorManager.address);
		await whitelistManager.deployed();

		// Deploying FeeManager contract for managing fees
		const FeeManager = await ethers.getContractFactory('FeeManager');
		feeManager = await FeeManager.deploy(operatorManager.address, owner.address, 10); // Fee set to 10%
		await feeManager.deployed();

		// Deploying the VoucherToken contract which represents a type of token
		const VoucherToken = await ethers.getContractFactory('VoucherToken');
		voucherContract = await VoucherToken.deploy('VoucherToken', 'VT', feeManager.address);
		await voucherContract.deployed();

		// Deploying ExtensionToken contract, a new token type associated with the voucher
		const ExtensionToken = await ethers.getContractFactory('ExtensionToken');
		extensionToken = await ExtensionToken.deploy('CarbonToken', 'CTK', operatorManager.address, feeManager.address, voucherContract.address, voucherTokenId);
		await extensionToken.deployed();

		// Deploying ExtensionTokenMarket contract to manage listing and buying of ExtensionTokens
		const ExtensionTokenMarket = await ethers.getContractFactory('ExtensionTokenMarket');
		extensionTokenMarket = await ExtensionTokenMarket.deploy(usdtContract.address, whitelistManager.address, operatorManager.address, feeManager.address);
		await extensionTokenMarket.deployed();

		// Adding an operator (this is a permissioned action, only operator can perform certain actions)
		await operatorManager.connect(owner).addOperator(operator.address);
	});

	describe('Market Actions', function () {
		it('should place a token on the market', async function () {
			const carbonAmount = 100; // Amount of the token to list
			const nonce = 1; // Nonce for transaction uniqueness
			const metadata = ''; // Metadata related to the token
			const carbonPrice = ethers.utils.parseUnits('10', 6); // Price for the token in USDT, 10 USDT

			// Minting the voucher token for the seller
			await voucherContract.mintByOperator(seller.address, carbonAmount, voucherTokenId, metadata);
			await voucherContract.connect(seller).setApprovalForAll(extensionToken.address, true); // Allow extensionToken to manage the seller's tokens

			// Signing the message to mint the extension token, using a hash of the transaction details
			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [seller.address, carbonAmount, nonce, extensionToken.address]);
			const signature = await seller.signMessage(ethers.utils.arrayify(messageHash));

			// Minting the extension token with the signed message, allowing the seller to mint tokens for sale
			await extensionToken.connect(operator).mint(seller.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Approving the ExtensionTokenMarket to manage the seller's extension tokens
			await extensionToken.connect(seller).setApprovalForAll(extensionTokenMarket.address, true);

			// Verifying the ExtensionToken contract before listing
			await extensionTokenMarket.connect(operator).verifyExtensionTokenContract(extensionToken.address);
			// Placing the extension token on the market for sale
			await extensionTokenMarket.connect(seller).place(carbonAmount * feeAmount, extensionToken.address, extensionTokenId, carbonPrice);

			// Retrieving the market item to confirm listing details
			const marketItem = await extensionTokenMarket._marketItemMap(1);

			// Asserting that the item was listed correctly with the expected details
			expect(marketItem.seller).to.equal(seller.address);
			expect(marketItem.amount).to.equal(carbonAmount * feeAmount);
			expect(marketItem.price).to.equal(carbonPrice);
		});

		it('should not allow placing tokens from an unverified contract', async function () {
			const amount = 10;
			const price = ethers.utils.parseUnits('1', 6); // Price of token for sale

			// Attempt to place token from an unverified contract should revert
			await expect(extensionTokenMarket.connect(seller).place(amount, extensionToken.address, 2, price)).to.be.revertedWith('Not Valid Extension Token Contract');
		});

		it('should unplace a token from the market', async function () {
			const carbonAmount = 100;
			const nonce = 1;
			const metadata = '';
			const carbonPrice = ethers.utils.parseUnits('10', 6);

			// Minting and approving tokens to the extension contract
			await voucherContract.mintByOperator(seller.address, carbonAmount, voucherTokenId, metadata);
			await voucherContract.connect(seller).setApprovalForAll(extensionToken.address, true);

			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [seller.address, carbonAmount, nonce, extensionToken.address]);
			const signature = await seller.signMessage(ethers.utils.arrayify(messageHash));

			await extensionToken.connect(operator).mint(seller.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			await extensionToken.connect(seller).setApprovalForAll(extensionTokenMarket.address, true);
			await extensionTokenMarket.connect(operator).verifyExtensionTokenContract(extensionToken.address);
			await extensionTokenMarket.connect(seller).place(carbonAmount * feeAmount, extensionToken.address, extensionTokenId, carbonPrice);

			// Unplacing the token from the market
			await extensionTokenMarket.connect(seller).unPlace(1, carbonAmount * feeAmount);

			// Checking the market item to verify it has been removed
			const marketItem = await extensionTokenMarket._marketItemMap(1);
			expect(marketItem.amount).to.equal(0); // Token amount should now be zero (unlisted)
		});

		it('should purchase a token using USDT', async function () {
			const carbonAmount = 100;
			const nonce = 1;
			const metadata = '';
			const carbonPrice = ethers.utils.parseUnits('10', 6);
			const totalPrice = carbonPrice.mul(carbonAmount); // Total price for purchasing the tokens
			const amount = carbonAmount * feeAmount; // Amount after fee

			// Minting the voucher token and allowing extensionToken to manage it
			await voucherContract.mintByOperator(seller.address, carbonAmount, voucherTokenId, metadata);
			await voucherContract.connect(seller).setApprovalForAll(extensionToken.address, true);

			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [seller.address, carbonAmount, nonce, extensionToken.address]);
			const signature = await seller.signMessage(ethers.utils.arrayify(messageHash));

			// Minting the extension token
			await extensionToken.connect(operator).mint(seller.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Approving the ExtensionTokenMarket contract to handle the seller's tokens
			await extensionToken.connect(seller).setApprovalForAll(extensionTokenMarket.address, true);

			// Verifying the extensionToken contract before proceeding
			await extensionTokenMarket.connect(operator).verifyExtensionTokenContract(extensionToken.address);
			// Placing the extension token on the market
			await extensionTokenMarket.connect(seller).place(amount, extensionToken.address, extensionTokenId, carbonPrice);

			// Minting USDT for the buyer and approving the transaction
			await usdtContract.mint(buyer.address, totalPrice);
			await usdtContract.connect(buyer).approve(extensionTokenMarket.address, totalPrice);

			// Buyer purchasing the token using USDT
			await extensionTokenMarket.connect(buyer).purchaseInUSDT(1, amount);

			// Confirming that the token has been purchased and removed from the market
			const marketItem = await extensionTokenMarket._marketItemMap(1);
			expect(marketItem.amount).to.equal(0);

			// Verifying the seller's balance after the transaction
			const sellerBalance = await usdtContract.balanceOf(seller.address);
			expect(sellerBalance).to.equal(ethers.utils.parseUnits('10', 6).mul(amount) * feeAmount);

			// Verifying that the buyer now owns the purchased tokens
			const buyerBalance = await extensionToken.balanceOf(buyer.address, 1);
			expect(buyerBalance).to.equal(amount); // Buyer should now hold the purchased tokens
		});
	});
});
