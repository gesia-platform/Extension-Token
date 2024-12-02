// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// Interface for minting tokens by an operator
interface IMintOperator {
    /**
     * @dev Mint tokens for a specified receiver address by an operator.
     * @param _receiver Address that will receive the minted tokens.
     * @param _amount Amount of tokens to mint.
     * @param _tokenId Token ID of the token to mint.
     * @param _metadata Metadata associated with the minted token (could be a URI or other details).
     */
    function mintByOperator(address _receiver, uint256 _amount, uint256 _tokenId, string memory _metadata) external;
}
