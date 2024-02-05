// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

/**
 * @title CompoundRelayer storage
 * @author CloudWalk Inc.
 */
abstract contract CompoundRelayerStorage {
    /// @dev The compound payer account whose tokens are used to repay borrows.
    address internal _compoundPayer;
    /// @dev The mapping of an admin status for a given address.
    mapping(address => bool) internal _admins;
}
