// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

/**
 * @title ICompoundRelayer interface
 * @author CloudWalk Inc.
 * @dev The interface of the Compound operations wrapper contract.
 */
interface ICompoundRelayer {
    // -------------------- Structs -----------------------------------
    /// @dev Structure with data of a repayments.
    struct Repayment {
        address market;
        address borrower;
        uint256 amount;
        bool defaulted;
    }

    // -------------------- Events -----------------------------------

    /**
     * @dev Emitted when a borrow is repaid on behalf of this compound relayer.
     * @param borrower The address of the borrower.
     * @param repayAmount The amount of tokens being repaid.
     */
    event RepayBorrowBehalf(address indexed borrower, uint256 repayAmount);

    /**
     * @dev Emitted when the payer account is configured.
     * @param oldPayer The old compound payer address.
     * @param newPayer The new compound payer address.
     */
    event ConfigureCompoundPayer(address indexed oldPayer, address indexed newPayer);

    // -------------------- Functions -----------------------------------

    /**
     * @dev Proxy function to enter markets.
     * @param market The address of the market.
     */
    function enterMarket(address market) external;

    /**
     * @dev Repays a borrow on behalf of this compound relayer.
     *
     * Requirements:
     *
     * - The caller must be an admin.
     * - The contract must not be paused.
     *
     * @param market The address of the market.
     * @param borrower The address of a borrower.
     * @param repayAmount The amount of tokens to repay.
     * @param defaulted True if the borrow is defaulted.
     */
    function repayBorrowBehalf(
        address market,
        address borrower,
        uint256 repayAmount,
        bool defaulted
    ) external;

    /**
     * @dev Repays a batch of borrows on behalf of this compound relayer.
     *
     * Requirements:
     *
     * - The caller must be an admin.
     * - The contract must not be paused.
     *
     * @param repayments structs of repayments data.
     */
    function repayBorrowBehalfBatch(
        Repayment[] calldata repayments
    ) external;

    /**
     * @dev Configures the compound payer account whose tokens are used to repay borrows.
     * @param compoundPayer The address of the new compound payer.
     */
    function configureCompoundPayer(address compoundPayer) external;

    /**
     * @dev Returns the compound payer address.
     */
    function compoundPayer() external view returns (address);

    /**
     * @dev Checks if the account is configured as a contract administrator.
     */
    function isAdmin(address account) external view returns (bool);
}
