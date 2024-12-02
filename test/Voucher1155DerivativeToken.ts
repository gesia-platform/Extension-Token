const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Voucher1155DerivativeToken', function () {
	let voucherToken;
	let feeManager;
	let operatorManager;
	let owner;
	let addr1;
	let addr2;

	beforeEach(async function () {
		// Get accounts
		[owner, addr1, addr2] = await ethers.getSigners();

		// Deploy OperatorManager Mock
		const OperatorManagerMock = await ethers.getContractFactory('OperatorManager');
		operatorManager = await OperatorManagerMock.deploy();
		await operatorManager.deployed();

		// Deploy FeeManager Mock
		const FeeManagerMock = await ethers.getContractFactory('FeeManager');
		feeManager = await FeeManagerMock.deploy(operatorManager.address, owner.address, 10);
		await feeManager.deployed();

		// Deploy Voucher1155DerivativeToken
		const Voucher1155DerivativeToken = await ethers.getContractFactory('Voucher1155DerivativeToken');
		voucherToken = await Voucher1155DerivativeToken.deploy('CarbonToken', 'CTK', feeManager.address);
		await voucherToken.deployed();
	});

	describe('Deployment', function () {
		it('Should deploy Voucher1155DerivativeToken contract correctly', async function () {
			expect(await voucherToken.name()).to.equal('CarbonToken');
			expect(await voucherToken.symbol()).to.equal('CTK');
			expect(await voucherToken.feeManager()).to.equal(feeManager.address);
		});
	});

	describe('Minting', function () {
		it('Should mint tokens by operator', async function () {
			const tokenId = 1;
			const amount = 100;
			const metadata = '';

			// Call mintByOperator
			await voucherToken.mintByOperator(addr1.address, amount, tokenId, metadata);

			// Check addr1's balance
			const balance = await voucherToken.balanceOf(addr1.address, tokenId);
			expect(balance).to.equal(amount);
		});

		it('Should mint tokens by signature', async function () {
			const tokenId = 2;
			const amount = 200;
			const nonce = 1;
			const metadata = '';
			const carbonPrice = 15000;

			// Create message hash
			const hashMessage = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'uint256', 'address'], [addr1.address, tokenId, amount, nonce, voucherToken.address]);

			// Create signature
			const signer = await addr1.signMessage(ethers.utils.arrayify(hashMessage));
			const signature = ethers.utils.arrayify(signer);

			// Call mintBySignature
			await voucherToken.mintBySignature(addr1.address, amount, tokenId, nonce, metadata, signature, carbonPrice);

			// Check addr1's balance
			const balance = await voucherToken.balanceOf(addr1.address, tokenId);
			expect(balance).to.equal(amount * 0.99);
		});
	});

	describe('Transfers', function () {
		it('Should transfer tokens by signature', async function () {
			const tokenId = 3;
			const amount = 50;
			const nonce = 2;
			const metadata = 'https://example.com/metadata3.json';
			const carbonPrice = 20000;

			// First signed mint
			const hashMessage = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256', 'uint256', 'address'], [addr1.address, tokenId, amount, nonce, voucherToken.address]);
			const signer = await addr1.signMessage(ethers.utils.arrayify(hashMessage));
			const signature = ethers.utils.arrayify(signer);

			await voucherToken.mintBySignature(addr1.address, amount, tokenId, nonce, metadata, signature, carbonPrice);

			// Transfer to second address
			const transferNonce = 3;
			const transferMessage = ethers.utils.solidityKeccak256(['address', 'address', 'uint256', 'uint256', 'uint256', 'address'], [addr1.address, addr2.address, tokenId, amount, transferNonce, voucherToken.address]);
			const transferSigner = await addr1.signMessage(ethers.utils.arrayify(transferMessage));
			const transferSignature = ethers.utils.arrayify(transferSigner);

			await voucherToken.transferBySignature(addr1.address, addr2.address, tokenId, amount, transferNonce, transferSignature);

			// Check addr1 and addr2's balances
			const addr1Balance = await voucherToken.balanceOf(addr1.address, tokenId);
			const addr2Balance = await voucherToken.balanceOf(addr2.address, tokenId);

			expect(addr1Balance).to.equal(0);
			expect(addr2Balance).to.equal(amount);
		});
	});
});
