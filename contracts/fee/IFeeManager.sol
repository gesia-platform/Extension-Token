// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

/**
 * @title IFeeManager
 * @dev Interface for the FeeManager contract that defines fee-related functionalities.
 */
interface IFeeManager {
    /**
     * @notice Calculates the fee amount for a given transaction value.
     * @param _amount The base amount to calculate the fee on.
     * @return The calculated fee based on the current fee percentage.
     */
    function feeAmount(uint256 _amount) external view returns (uint256);

    /**
     * @notice Retrieves the current fee wallet address.
     * @return The address where collected fees are sent.
     */
    function feeAddress() external view returns (address);
}
