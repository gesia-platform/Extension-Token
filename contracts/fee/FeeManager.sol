// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IFeeManager.sol";
import "../operator/IOperator.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract FeeManager is IFeeManager {
    using SafeMath for uint256;

    /** 
     * @notice Represents the fee percentage applied to transactions.
     * @dev Fee percentage is in basis points (e.g., 5 -> 0.5%, 50 -> 5%, 500 -> 50%).
     */
    uint256 public feePercentage;

    /** 
     * @notice Address of the operator manager contract.
     */
    address public operatorManager;

    /** 
     * @notice Address where collected fees will be sent.
     */
    address public feeWalletAddress;

    /**
     * @notice Emitted when the fee wallet address is updated.
     * @param _feeAddress The new fee wallet address.
     */
    event ChangeFeeAddress(address _feeAddress);

    /**
     * @notice Emitted when the fee percentage is updated.
     * @param _feePercentage The new fee percentage in basis points.
     */
    event ChangeFeePercentage(uint256 _feePercentage);

    /**
     * @notice Restricts access to only operators defined in the OperatorManager contract.
     */
    modifier operatorsOnly() {
        require(IOperator(operatorManager).isOperator(msg.sender), "#operatorsOnly:");
        _;
    }

    /**
     * @notice Initializes the contract with the operator manager address, fee wallet address, and fee percentage.
     * @param _operatorManager Address of the OperatorManager contract.
     * @param _feeAddress Address where fees will be collected.
     * @param _feePercentage Fee percentage in basis points.
     */
    constructor(address _operatorManager, address _feeAddress, uint256 _feePercentage) {
        operatorManager = _operatorManager;
        feeWalletAddress = _feeAddress;
        feePercentage = _feePercentage;
    }

    /**
     * @notice Allows operators to update the fee wallet address.
     * @dev Only callable by an operator defined in the OperatorManager contract.
     * @param _feeAddress The new fee wallet address.
     */
    function changeFeeAddress(address _feeAddress) external operatorsOnly {
        feeWalletAddress = _feeAddress;
        emit ChangeFeeAddress(_feeAddress);
    }

    /**
     * @notice Allows operators to update the fee percentage.
     * @dev Only callable by an operator defined in the OperatorManager contract.
     * @param _feePercentage The new fee percentage in basis points.
     */
    function changeFeePercentage(uint256 _feePercentage) external operatorsOnly {
        feePercentage = _feePercentage;
        emit ChangeFeePercentage(_feePercentage);
    }

    /**
     * @notice Calculates the fee amount for a given transaction value.
     * @param _feeAmount The base amount to calculate the fee on.
     * @return The calculated fee based on the current fee percentage.
     */
    function feeAmount(uint256 _feeAmount) external view override returns (uint256) {
        return _feeAmount.mul(feePercentage).div(1000);
    }

    /**
     * @notice Retrieves the current fee wallet address.
     * @return The address where collected fees are sent.
     */
    function feeAddress() external view override returns (address) {
        return feeWalletAddress;
    }
}
