// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// Interface for checking if an address is an operator
interface IOperator {
    /**
     * @dev Check if the given address is an operator.
     * @param _account Address to check if it is an operator.
     * @return bool Returns true if the address is an operator, otherwise false.
     */
    function isOperator(address _account) external view returns (bool);
}
