// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

/**
 * @title IComptroller interface
 * @author CloudWalk Inc.
 * @dev The interface of the Compound protocol comptroller.
 */
interface IComptroller {
    /**
     * @dev Adds assets to be included in account liquidity calculation.
     * @param cTokens The list of addresses of the cToken markets to be enabled.
     * @return Success indicator for whether each corresponding market was entered.
     */
    function enterMarkets(address[] memory cTokens) external returns (uint256[] memory);
}
