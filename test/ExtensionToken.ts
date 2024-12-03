const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ExtensionToken', function () {
	let voucherContract, extensionTokenContract;
	let owner, operator, user;
	let voucherTokenId = 1;
	let feeManager, operatorManager;
	const feeAmount = 0.99; // Fee percentage applied to minted tokens

	// Setup the contracts and state before each test case
	beforeEach(async function () {
		// Get signers for the tests (owner, operator, and user)
		[owner, operator, user] = await ethers.getSigners();

		// Deploy the OperatorManager contract (mock version)
		const OperatorManagerMock = await ethers.getContractFactory('OperatorManager');
		operatorManager = await OperatorManagerMock.deploy();
		await operatorManager.deployed();
		// Add the operator to the OperatorManager
		await operatorManager.addOperator(operator.address);

		// Deploy the FeeManager contract (mock version), linking it to the operatorManager and owner
		const FeeManagerMock = await ethers.getContractFactory('FeeManager');
		feeManager = await FeeManagerMock.deploy(operatorManager.address, owner.address, 10);
		await feeManager.deployed();

		// Deploy the VoucherToken contract, linking it to the FeeManager
		const VoucherToken = await ethers.getContractFactory('VoucherToken');
		voucherContract = await VoucherToken.deploy('VoucherToken', 'VT', feeManager.address);
		await voucherContract.deployed();

		// Deploy the ExtensionToken contract, linking it to OperatorManager, FeeManager, and VoucherToken
		const ExtensionToken = await ethers.getContractFactory('ExtensionToken');
		extensionTokenContract = await ExtensionToken.deploy('CarbonToken', 'CTK', operatorManager.address, feeManager.address, voucherContract.address, voucherTokenId);
		await extensionTokenContract.deployed();

		// Mint some initial voucher tokens to the user (amount: 100, tokenId: 1)
		const tokenId = 1;
		const amount = 100;
		const metadata = '';
		await voucherContract.mintByOperator(user.address, amount, tokenId, metadata);
	});

	// Testing the minting functionality of the ExtensionToken contract
	describe('Minting', function () {
		it('should mint new carbon tokens with signature', async function () {
			const carbonAmount = 100; // Amount of carbon tokens to mint
			const nonce = 1; // Unique nonce for the minting process
			const metadata = ''; // Metadata associated with the tokens (empty in this case)
			const carbonPrice = 20000; // The price for minting the carbon tokens

			// Add the operator to the operator manager to allow them to mint tokens
			await operatorManager.connect(owner).addOperator(operator.address);
			// Give the voucher contract approval to transfer the user's vouchers for minting
			await voucherContract.connect(user).setApprovalForAll(extensionTokenContract.address, true);

			// Create a message hash to be signed by the user, using their address, carbon amount, nonce, and the contract address
			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [user.address, carbonAmount, nonce, extensionTokenContract.address]);
			// The user signs the message with their private key
			const signature = await user.signMessage(ethers.utils.arrayify(messageHash));

			// Mint the carbon tokens, using the operator to execute the mint, passing the user's signature for validation
			await extensionTokenContract.connect(operator).mint(user.address, carbonAmount, nonce, metadata, signature, carbonPrice);

			// Verify that the user's balance has been updated to reflect the minted carbon tokens, after applying the fee
			const balance = await extensionTokenContract.balanceOf(user.address, 1);
			expect(balance).to.equal(carbonAmount * feeAmount); // The balance should be the minted amount minus the fee
		});

		it('should revert if the price is below the minimum price', async function () {
			const carbonAmount = 100; // Amount of carbon tokens to mint
			const nonce = 1; // Unique nonce for minting
			const metadata = 'http://metadata.com'; // Metadata URL for the tokens
			const carbonPrice = 9999; // A price below the minimum required

			// Create a message hash and sign it with the user's private key
			const messageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [user.address, carbonAmount, nonce, extensionTokenContract.address]);
			const signature = await user.signMessage(ethers.utils.arrayify(messageHash));

			// Attempt to mint the tokens with a price lower than the minimum price, expecting the transaction to revert
			await expect(extensionTokenContract.connect(operator).mint(user.address, carbonAmount, nonce, metadata, signature, carbonPrice)).to.be.revertedWith('price must be higher than min');
		});
	});

	// Testing the transfer functionality of the ExtensionToken contract with signatures
	describe('Transfer with signature', function () {
		it('should transfer carbon tokens with signature', async function () {
			const mintAmount = 100; // Amount of tokens to mint
			const mintNonce = 1; // Nonce for minting
			const metadata = ''; // Empty metadata
			const carbonPrice = 20000; // The price for minting the tokens

			// Add the operator and allow them to mint tokens
			await operatorManager.connect(owner).addOperator(operator.address);
			await voucherContract.connect(user).setApprovalForAll(extensionTokenContract.address, true);

			// Create and sign the message hash for minting the tokens
			const mintMessageHash = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'address'], [user.address, mintAmount, mintNonce, extensionTokenContract.address]);
			const mintSignature = await user.signMessage(ethers.utils.arrayify(mintMessageHash));

			// Mint the tokens to the user
			await extensionTokenContract.connect(operator).mint(user.address, mintAmount, mintNonce, metadata, mintSignature, carbonPrice);

			// Verify the user's balance after minting
			const userBalanceAfterMint = await extensionTokenContract.balanceOf(user.address, 1);
			expect(userBalanceAfterMint).to.equal(mintAmount * feeAmount); // Check that the balance is correct after applying the fee

			// Now attempt to transfer the minted tokens from the user to the operator
			const transferAmount = userBalanceAfterMint; // The amount to transfer (the full balance)
			const transferNonce = 1; // Nonce for the transfer

			// Allow the voucher contract to transfer the user's tokens for the transfer
			await voucherContract.connect(user).setApprovalForAll(extensionTokenContract.address, true);

			// Create and sign the message hash for the transfer
			const transferMessageHash = ethers.utils.solidityKeccak256(['address', 'address', 'uint256', 'uint256', 'uint256', 'address'], [user.address, operator.address, 1, transferAmount, transferNonce, extensionTokenContract.address]);
			const transferSignature = await user.signMessage(ethers.utils.arrayify(transferMessageHash));

			// Execute the transfer with the signed message
			await extensionTokenContract.connect(operator).transferWithSignature(user.address, operator.address, 1, transferAmount, transferNonce, transferSignature);

			// Verify the operator's balance after the transfer
			const operatorBalanceAfterTransfer = await extensionTokenContract.balanceOf(operator.address, 1);
			expect(operatorBalanceAfterTransfer).to.equal(transferAmount); // Ensure the operator received the transferred tokens
		});

		it('should revert if the signature is invalid', async function () {
			const carbonAmount = 50; // Amount of tokens to transfer
			const nonce = 1; // Nonce for the transfer
			const invalidSignature = '0x'; // An invalid empty signature

			// Attempt to transfer the tokens with an invalid signature, expecting the transaction to revert
			await expect(extensionTokenContract.connect(operator).transferWithSignature(user.address, operator.address, 1, carbonAmount, nonce, invalidSignature)).to.be.revertedWith('invalid signature length');
		});
	});
});
