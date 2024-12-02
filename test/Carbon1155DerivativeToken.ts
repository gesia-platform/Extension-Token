const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Carbon1155DerivativeToken', function () {
	let voucherContract, carbonTokenContract;
	let owner, operator, user;
	let voucherTokenId = 1;
	let feeManager, operatorManager;
	const feeAmount = 0.99;

	beforeEach(async function () {
		// Get signers
		[owner, operator, user] = await ethers.getSigners();

		// Deploy OperatorManager Mock
		const OperatorManagerMock = await ethers.getContractFactory('OperatorManager');
		operatorManager = await OperatorManagerMock.deploy();
		await operatorManager.deployed();

		await operatorManager.addOperator(operator.address);

		// Deploy FeeManager Mock
		const FeeManagerMock = await ethers.getContractFactory('FeeManager');
		feeManager = await FeeManagerMock.deploy(operatorManager.address, owner.address, 10);
		await feeManager.deployed();

		// Deploy Voucher1155DerivativeToken
		const Voucher1155DerivativeToken = await ethers.getContractFactory('Voucher1155DerivativeToken');
		voucherContract = await Voucher1155DerivativeToken.deploy('VoucherToken', 'VT', feeManager.address);
		await voucherContract.deployed();

		// Deploy the Carbon1155DerivativeToken contract
		const Carbon1155DerivativeToken = await ethers.getContractFactory('Carbon1155DerivativeToken');
		carbonTokenContract = await Carbon1155DerivativeToken.deploy('CarbonToken', 'CTK', operatorManager.address, feeManager.address, voucherContract.address, voucherTokenId);
		await carbonTokenContract.deployed();

		// Mint some voucher tokens to the user
		const tokenId = 1;
		const amount = 100;
		const metadata = '';

		// Call mintByOperator
		await voucherContract.mintByOperator(user.address, amount, tokenId, metadata);
	});

	describe('Minting', function () {
		it('should mint new carbon tokens with signature', async function () {
			const carbonAmount = 100;
			const nonce = 1;
			const metadata = '';
			const carbonPrice = 20000; // 20 USDT

			// Ensure operator is added
			await operatorManager.connect(owner).addOperator(operator.address);

			// Ensure the user has approved the carbon contract to transfer voucher tokens
			await voucherContract.connect(user).setApprovalForAll(carbonTokenContract.address, true);

			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [user.address, carbonAmount, nonce, carbonTokenContract.address]);

			// Sign the message
			const signature = await user.signMessage(ethers.utils.arrayify(messageHash));

			// Mint the token
			await carbonTokenContract.connect(operator).mint(user.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Check the balance of the minted tokens
			const balance = await carbonTokenContract.balanceOf(user.address, 1);
			expect(balance).to.equal(carbonAmount * feeAmount);
		});

		it('should revert if the price is below the minimum price', async function () {
			const carbonAmount = 100;
			const nonce = 1;
			const metadata = 'http://metadata.com';
			const carbonPrice = 9999; // Below minimum price
			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [user.address, carbonAmount, nonce, carbonTokenContract.address]);

			const signature = await user.signMessage(ethers.utils.arrayify(messageHash));

			await expect(carbonTokenContract.connect(operator).mint(user.address, carbonAmount, nonce, metadata, signature, carbonPrice)).to.be.revertedWith('price must be higher than min');
		});
	});

	describe('Transfer with signature', function () {
		it('should transfer carbon tokens with signature', async function () {
			const mintAmount = 100; // Amount to mint
			const mintNonce = 1; // Nonce for minting
			const metadata = ''; // Metadata for minting
			const carbonPrice = 20000; // Carbon token price (in USDT)

			// Ensure operator is added
			await operatorManager.connect(owner).addOperator(operator.address);

			// Ensure the user has approved the carbon contract to transfer voucher tokens
			await voucherContract.connect(user).setApprovalForAll(carbonTokenContract.address, true);

			// Prepare message hash for minting
			const mintMessageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [user.address, mintAmount, mintNonce, carbonTokenContract.address]);

			// Sign the message for minting
			const mintSignature = await user.signMessage(ethers.utils.arrayify(mintMessageHash));

			// Mint the token
			await carbonTokenContract.connect(operator).mint(user.address, mintAmount, mintNonce, metadata, mintSignature, carbonPrice);

			// Check the balance of the minted tokens
			const userBalanceAfterMint = await carbonTokenContract.balanceOf(user.address, 1);
			expect(userBalanceAfterMint).to.equal(mintAmount * feeAmount);

			// Transfer details
			const transferAmount = userBalanceAfterMint; // Amount to transfer
			const transferNonce = 1; // Nonce for transfer

			// Ensure the user has approved the operator to transfer tokens on their behalf
			await voucherContract.connect(user).setApprovalForAll(carbonTokenContract.address, true);

			// Prepare message hash for transfer
			const transferMessageHash = ethers.utils.solidityKeccak256(['address', 'address', 'uint256', 'uint256', 'uint256', 'address'], [user.address, operator.address, 1, transferAmount, transferNonce, carbonTokenContract.address]);

			// Sign the message for transfer
			const transferSignature = await user.signMessage(ethers.utils.arrayify(transferMessageHash));

			// Operator should call the transfer function on behalf of the user
			await carbonTokenContract.connect(operator).transferWithSignature(
				user.address, // 'from' address
				operator.address, // 'to' address
				1, // tokenId
				transferAmount, // amount
				transferNonce, // nonce
				transferSignature, // signature
			);

			// Check the balance of the operator to verify the transfer
			const operatorBalanceAfterTransfer = await carbonTokenContract.balanceOf(operator.address, 1);
			expect(operatorBalanceAfterTransfer).to.equal(transferAmount);
		});

		it('should revert if the signature is invalid', async function () {
			const carbonAmount = 50;
			const nonce = 1;
			const invalidSignature = '0x';

			await expect(carbonTokenContract.connect(operator).transferWithSignature(user.address, operator.address, 1, carbonAmount, nonce, invalidSignature)).to.be.revertedWith('invalid signature length');
		});
	});
});
