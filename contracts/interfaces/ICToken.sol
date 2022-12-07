// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

/**
 * @title ICToken interface
 * @author CloudWalk Inc.
 * @dev The interface of the Compound protocol market.
 */
interface ICToken {
    /**
     * @dev Supplies underlying asset tokens into the market and receives cTokens in exchange.
     * @param mintAmount The amount of the underlying asset tokens to supply.
     * @return 0=success, otherwise a failure.
     */
    function mint(uint256 mintAmount) external returns (uint256);

    /**
     * @dev Redeems cTokens in exchange for the underlying asset tokens.
     * @param redeemTokens The amount of cTokens to redeem.
     * @return 0=success, otherwise a failure.
     */
    function redeem(uint256 redeemTokens) external returns (uint256);

    /**
     * @dev Redeems cTokens in exchange for a specified amount of underlying asset tokens.
     * @param redeemAmount The amount of underlying asset tokens to redeem.
     * @return 0=success, otherwise a failure.
     */
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);

    /**
     * @dev Repays a borrow belonging to the borrower.
     * @param borrower The account with the debt being payed off.
     * @param repayAmount The amount to repay (-1 for the full outstanding amount).
     * @return 0=success, otherwise a failure.
     */
    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256);

    /**
     * @dev Accrues interest and then calculates the account's borrow balance.
     * @param account The address whose balance should be calculated.
     * @return The calculated borrow balance.
     */
    function borrowBalanceCurrent(address account) external returns (uint256);

    /**
     * @dev Returns the address of the comptroller contract.
     */
    function comptroller() external view returns (address);

    /**
     * @dev Returns the address of the underlying token.
     */
    function underlying() external view returns (address);
}
