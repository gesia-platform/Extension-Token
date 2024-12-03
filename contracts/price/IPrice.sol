// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Interface for fetching carbon price related to a specific token
interface IPrice {
    
    /**
     * @dev Returns the carbon price for a given tokenId.
     * @param tokenId The ID of the token for which the carbon price is requested.
     * @return uint256 The carbon price for the specified tokenId.
     */
    function getCarbonPrice(uint256 tokenId) external view returns (uint256);
}
