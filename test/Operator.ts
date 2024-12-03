const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('OperatorManager', function () {
	let operatorManager; // Declaring a variable for the OperatorManager contract instance
	let owner; // Declaring a variable for the owner's address
	let addr1; // Declaring a variable for the first address (operator to be added/removed)
	let addr2; // Declaring a variable for the second address (to test adding/removing operator)

	// This block will run before each test case to set up the environment
	beforeEach(async function () {
		// Fetching the signers (accounts) from the Ethereum environment, which are used to simulate different users (owner, addr1, addr2)
		[owner, addr1, addr2] = await ethers.getSigners();

		// Deploying the OperatorManager contract using the contract factory
		const OperatorManagerFactory = await ethers.getContractFactory('OperatorManager');
		operatorManager = await OperatorManagerFactory.deploy(); // Deploy the contract
	});

	describe('Add and Remove Operators', function () {
		// Test case to check adding an operator
		it('should add an operator', async function () {
			// Calling the addOperator function to add addr1 as an operator
			await operatorManager.addOperator(addr1.address);

			// Verifying that addr1 is now an operator by calling isOperator and expecting it to return true
			expect(await operatorManager.isOperator(addr1.address)).to.equal(true);
		});

		// Test case to check removing an operator
		it('should remove an operator', async function () {
			// First, add addr1 as an operator
			await operatorManager.addOperator(addr1.address);

			// Calling removeOperator to remove addr1 as an operator
			await operatorManager.removeOperator(addr1.address);

			// Verifying that addr1 is no longer an operator by calling isOperator and expecting it to return false
			expect(await operatorManager.isOperator(addr1.address)).to.equal(false);
		});

		// Test case to check if the AddOperator event is emitted when adding an operator
		it('should emit AddOperator event when adding an operator', async function () {
			// Expecting the addOperator function to emit the AddOperator event with the correct arguments (addr1's address)
			await expect(operatorManager.addOperator(addr1.address))
				.to.emit(operatorManager, 'AddOperator') // Check if AddOperator event is emitted
				.withArgs(addr1.address); // Verifying that the event contains the correct operator address
		});

		// Test case to check if the RemoveOperator event is emitted when removing an operator
		it('should emit RemoveOperator event when removing an operator', async function () {
			// First, add addr1 as an operator
			await operatorManager.addOperator(addr1.address);

			// Expecting the removeOperator function to emit the RemoveOperator event with the correct arguments (addr1's address)
			await expect(operatorManager.removeOperator(addr1.address))
				.to.emit(operatorManager, 'RemoveOperator') // Check if RemoveOperator event is emitted
				.withArgs(addr1.address); // Verifying that the event contains the correct operator address
		});

		// Test case to check that non-owners cannot add or remove operators
		it('should not allow non-owner to add or remove operators', async function () {
			// Trying to add addr2 as an operator from addr1's address (who is not the owner), should be reverted
			await expect(operatorManager.connect(addr1).addOperator(addr2.address)).to.be.revertedWith('Ownable: caller is not the owner'); // Checking that the revert error matches the expected message

			// Trying to remove addr2 as an operator from addr1's address (who is not the owner), should be reverted
			await expect(operatorManager.connect(addr1).removeOperator(addr2.address)).to.be.revertedWith('Ownable: caller is not the owner'); // Checking that the revert error matches the expected message
		});
	});
});
