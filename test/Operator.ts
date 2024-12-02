const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('OperatorManager', function () {
	let operatorManager;
	let owner;
	let addr1;
	let addr2;

	beforeEach(async function () {
		// Setting up the test environment by getting signers (accounts)
		// and deploying the OperatorManager contract before each test
		[owner, addr1, addr2] = await ethers.getSigners();

		// Deploying the OperatorManager contract
		const OperatorManagerFactory = await ethers.getContractFactory('OperatorManager');
		operatorManager = await OperatorManagerFactory.deploy();
	});

	describe('Add and Remove Operators', function () {
		it('should add an operator', async function () {
			// Adding addr1 as an operator
			await operatorManager.addOperator(addr1.address);

			// Verifying if addr1 is added as an operator
			expect(await operatorManager.isOperator(addr1.address)).to.equal(true);
		});

		it('should remove an operator', async function () {
			// Adding addr1 as an operator first
			await operatorManager.addOperator(addr1.address);

			// Removing addr1 as an operator
			await operatorManager.removeOperator(addr1.address);

			// Verifying if addr1 is removed as an operator
			expect(await operatorManager.isOperator(addr1.address)).to.equal(false);
		});

		it('should emit AddOperator event when adding an operator', async function () {
			// Verifying if AddOperator event is emitted when adding an operator
			await expect(operatorManager.addOperator(addr1.address)).to.emit(operatorManager, 'AddOperator').withArgs(addr1.address);
		});

		it('should emit RemoveOperator event when removing an operator', async function () {
			// Adding addr1 as an operator first
			await operatorManager.addOperator(addr1.address);

			// Verifying if RemoveOperator event is emitted when removing an operator
			await expect(operatorManager.removeOperator(addr1.address)).to.emit(operatorManager, 'RemoveOperator').withArgs(addr1.address);
		});

		it('should not allow non-owner to add or remove operators', async function () {
			// Verifying that only the owner can add an operator
			await expect(operatorManager.connect(addr1).addOperator(addr2.address)).to.be.revertedWith('Ownable: caller is not the owner');

			// Verifying that only the owner can remove an operator
			await expect(operatorManager.connect(addr1).removeOperator(addr2.address)).to.be.revertedWith('Ownable: caller is not the owner');
		});
	});
});
