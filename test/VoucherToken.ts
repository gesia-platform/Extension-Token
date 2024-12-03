const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('VoucherToken', function () {
	let voucherToken; // Instance of the VoucherToken contract.
	let feeManager; // Instance of the FeeManager contract.
	let operatorManager; // Instance of the OperatorManager contract.
	let owner; // The account deploying the contract (the default account).
	let addr1; // An additional account used for testing.
	let addr2; // Another additional account used for testing.

	// Deploy the contracts and initialize before each test.
	beforeEach(async function () {
		// Get the accounts available in Hardhat.
		[owner, addr1, addr2] = await ethers.getSigners();

		// 1. Deploy the OperatorManager mock contract.
		const OperatorManagerMock = await ethers.getContractFactory('OperatorManager'); // Factory to create the contract.
		operatorManager = await OperatorManagerMock.deploy(); // Deploy OperatorManager contract.
		await operatorManager.deployed(); // Wait for deployment to complete.

		// 2. Deploy the FeeManager mock contract.
		const FeeManagerMock = await ethers.getContractFactory('FeeManager'); // Factory for FeeManager contract.
		feeManager = await FeeManagerMock.deploy(operatorManager.address, owner.address, 10);
		// FeeManager takes the OperatorManager address, the owner address, and a fee percentage (10).
		await feeManager.deployed(); // Wait for FeeManager deployment to complete.

		// 3. Deploy the VoucherToken contract.
		const VoucherToken = await ethers.getContractFactory('VoucherToken'); // Factory for VoucherToken contract.
		voucherToken = await VoucherToken.deploy('CarbonToken', 'CTK', feeManager.address);
		// VoucherToken name is 'CarbonToken', symbol is 'CTK', and FeeManager address is passed.
		await voucherToken.deployed(); // Wait for VoucherToken deployment to complete.
	});

	// Deployment tests.
	describe('Deployment', function () {
		it('Should deploy VoucherToken contract correctly', async function () {
			// 1. Check the token name.
			expect(await voucherToken.name()).to.equal('CarbonToken'); // Ensure the name is 'CarbonToken'.
			// 2. Check the token symbol.
			expect(await voucherToken.symbol()).to.equal('CTK'); // Ensure the symbol is 'CTK'.
			// 3. Check the FeeManager address.
			expect(await voucherToken.feeManager()).to.equal(feeManager.address);
			// Ensure the FeeManager address is correctly set.
		});
	});

	// Minting tests.
	describe('Minting', function () {
		it('Should mint tokens by operator', async function () {
			// Parameters for minting the tokens.
			const tokenId = 1; // Token ID to mint.
			const amount = 100; // Amount of tokens to mint.
			const metadata = ''; // Metadata is an empty string.

			// Mint tokens by the operator (address addr1).
			await voucherToken.mintByOperator(addr1.address, amount, tokenId, metadata);

			// Check the balance of tokens in addr1's account.
			const balance = await voucherToken.balanceOf(addr1.address, tokenId);
			expect(balance).to.equal(amount); // Ensure the balance matches the minted amount.
		});

		it('Should mint tokens by signature', async function () {
			// Parameters for minting the tokens.
			const tokenId = 2; // Token ID to mint.
			const amount = 200; // Amount of tokens to mint.
			const nonce = 1; // Nonce used for the signature.
			const metadata = ''; // Metadata is an empty string.
			const carbonPrice = 15000; // Carbon price associated with the minting.

			// Create a hash of the message for the signature.
			const hashMessage = ethers.utils.solidityKeccak256(
				['address', 'uint256', 'uint256', 'uint256', 'address'], // Data types for hashing.
				[addr1.address, tokenId, amount, nonce, voucherToken.address], // Values to be hashed.
			);

			// Sign the message with addr1's private key.
			const signer = await addr1.signMessage(ethers.utils.arrayify(hashMessage));
			const signature = ethers.utils.arrayify(signer); // Convert the signature to array format.

			// Mint the tokens by signature (addr1 signs the message).
			await voucherToken.mintBySignature(addr1.address, amount, tokenId, nonce, metadata, signature, carbonPrice);

			// Check addr1's token balance after minting (1% fee deducted).
			const balance = await voucherToken.balanceOf(addr1.address, tokenId);
			expect(balance).to.equal(amount * 0.99); // Ensure the balance is the minted amount minus the 1% fee.
		});
	});

	// Transfer tests.
	describe('Transfers', function () {
		it('Should transfer tokens by signature', async function () {
			// 1. Initial minting parameters.
			const tokenId = 3; // Token ID to mint.
			const amount = 50; // Amount of tokens to mint.
			const nonce = 2; // Nonce for minting.
			const metadata = 'https://example.com/metadata3.json'; // Metadata URL.
			const carbonPrice = 20000; // Carbon price associated with the minting.

			// Sign the minting transaction with addr1's private key.
			const hashMessage = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'uint256', 'address'], [addr1.address, tokenId, amount, nonce, voucherToken.address]);
			const signer = await addr1.signMessage(ethers.utils.arrayify(hashMessage));
			const signature = ethers.utils.arrayify(signer);

			// Mint the tokens by signature.
			await voucherToken.mintBySignature(addr1.address, amount, tokenId, nonce, metadata, signature, carbonPrice);

			// 2. Parameters for token transfer.
			const transferNonce = 3; // Nonce for the transfer.
			const transferMessage = ethers.utils.solidityKeccak256(['address', 'address', 'uint256', 'uint256', 'uint256', 'address'], [addr1.address, addr2.address, tokenId, amount, transferNonce, voucherToken.address]);
			const transferSigner = await addr1.signMessage(ethers.utils.arrayify(transferMessage));
			const transferSignature = ethers.utils.arrayify(transferSigner);

			// Transfer tokens by signature (addr1 to addr2).
			await voucherToken.transferBySignature(addr1.address, addr2.address, tokenId, amount, transferNonce, transferSignature);

			// Check the balances of addr1 and addr2 after transfer.
			const addr1Balance = await voucherToken.balanceOf(addr1.address, tokenId);
			const addr2Balance = await voucherToken.balanceOf(addr2.address, tokenId);

			expect(addr1Balance).to.equal(0); // Ensure addr1's balance is now 0.
			expect(addr2Balance).to.equal(amount); // Ensure addr2's balance matches the transferred amount.
		});
	});
});
