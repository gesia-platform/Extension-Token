// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOperator.sol";

// Contract to manage operators with Ownable functionality
contract OperatorManager is Ownable, IOperator {

    // Mapping to store operator status for each address
    mapping(address => bool) public operatorMap;

    // Events to notify when operators are added or removed
    event AddOperator(address account);
    event RemoveOperator(address account);

    // Constructor sets the owner as the first operator
    constructor() {
        operatorMap[msg.sender] = true;
    }

    /**
     * @dev Adds a new operator to the operatorMap. Can only be called by the contract owner.
     * @param _account Address of the account to be added as an operator.
     */
    function addOperator(address _account) external onlyOwner {
        operatorMap[_account] = true;
        emit AddOperator(_account);
    }

    /**
     * @dev Removes an operator from the operatorMap. Can only be called by the contract owner.
     * @param _account Address of the operator to be removed.
     */
    function removeOperator(address _account) external onlyOwner {
        operatorMap[_account] = false;
        emit RemoveOperator(_account);
    }

    /**
     * @dev Checks if the provided address is an operator.
     * @param _account Address to check if it is an operator.
     * @return bool Returns true if the address is an operator, otherwise false.
     */
    function isOperator(address _account) external view override returns (bool) {
        return operatorMap[_account];
    }
}
