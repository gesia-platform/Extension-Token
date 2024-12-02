// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

interface IWhitelist {
    /**
     * @dev Returns whether the specified account is whitelisted for the given voucher contract and token ID.
     * @param _voucherContract The address of the voucher contract.
     * @param _tokenId The ID of the token.
     * @param _account The address of the account to check.
     * @return True if the account is whitelisted for the given voucher contract and token ID, false otherwise.
     */
    function isWhitelist(
        address _voucherContract,
        uint256 _tokenId,
        address _account
    ) external view returns (bool);
}
