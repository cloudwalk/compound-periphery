// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

/**
 * @title CompoundAgent storage version 1
 * @author CloudWalk Inc.
 */
abstract contract CompoundAgentStorageV1 {
    /// @dev The address of the Compound market.
    address internal _market;

    /// @dev The mapping of an admin status for a given address.
    mapping(address => bool) internal _admins;
}

/**
 * @title CompoundAgent storage version 2
 * @author CloudWalk Inc.
 */
abstract contract CompoundAgentStorageV2 {
    /// @dev The cap of mint-on-debt-collection operation in underlying tokens.
    uint256 internal _mintOnDebtCollectionCap;
}

/**
 * @title CompoundAgent storage
 *
 * We are following Compound's approach of upgrading new contract implementations.
 * See https://github.com/compound-finance/compound-protocol.
 * When we need to add new storage variables, we create a new version of CompoundAgent
 * e.g. CompoundAgentStorage<versionNumber>, so finally it would look like
 * "contract CompoundAgentStorage is CompoundAgentStorageV1, CompoundAgentStorageV2".
 */
abstract contract CompoundAgentStorage is CompoundAgentStorageV1, CompoundAgentStorageV2 {

}
