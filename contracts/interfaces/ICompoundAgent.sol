// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

/**
 * @title CompoundAgent interface
 * @author CloudWalk Inc.
 * @dev The interface of the Compound operations wrapper contract.
 */
interface ICompoundAgent {
    // -------------------- Events -----------------------------------

    /**
     * @dev Emitted when a trusted borrow is repaid.
     * @param account The address of the trusted borrower.
     * @param repayAmount The amount of tokens being repaid.
     */
    event RepayTrustedBorrow(address indexed account, uint256 repayAmount);

    /**
     * @dev Emitted when a defaulted borrow is repaid.
     * @param account The address of the trusted borrower.
     * @param burnAmount The amount of tokens being burned.
     */
    event RepayDefaultedBorrow(address indexed account, uint256 burnAmount);

    /**
     * @dev Emitted when cTokens are minted due to debt collection.
     * @param borrower The address of the borrower associated with the debt collection.
     * @param mintAmount The amount of underlying asset tokens to supply.
     */
    event MintOnDebtCollection(address borrower, uint256 mintAmount);

    // -------------------- Functions -----------------------------------

    /**
     * @dev Supplies underlying asset tokens into the market and receives cTokens in exchange.
     * @param mintAmount The amount of underlying asset tokens to supply.
     */
    function mint(uint256 mintAmount) external;

    /**
     * @dev Redeems cTokens from the market in exchange for underlying asset tokens.
     * @param redeemTokens The amount of cTokens to redeem.
     */
    function redeem(uint256 redeemTokens) external;

    /**
     * @dev Redeems cTokens from the market in exchange for underlying asset tokens.
     * @param redeemAmount The amount of underlying asset tokens to redeem.
     */
    function redeemUnderlying(uint256 redeemAmount) external;

    /**
     * @dev Repays a borrow belonging to a trusted borrower.
     *
     * Emits a {RepayTrustedBorrow} event.
     * Emits a {RepayDefaultedBorrow} event in the case of a defaulted borrow.
     *
     * @param borrower The address of the borrower.
     * @param repayAmount The amount of tokens to repay.
     * @param defaulted True if the borrow is defaulted.
     */
    function repayTrustedBorrow(
        address borrower,
        uint256 repayAmount,
        bool defaulted
    ) external;

    /**
     * @dev Repays borrows belonging to trusted borrowers.
     *
     * If the borrow is defaulted along with the repayment redeems the corresponding amount of cTokens
     * and burns the underlying tokens gotten in exchange.
     *
     * The provided amount of tokens can exceed the remaining amount of the loan.
     * In this case, only the amount of tokens required to complete the loan will be used.
     *
     * Emits a {RepayTrustedBorrow} event.
     * Emits a {BurnDefaultedBorrow} event if the `defaulted` argument is true.
     *
     * @param borrowers An array of addresses of verified borrowers.
     * @param repayAmounts An array of token amounts to repay.
     * @param defaulted An array of defaulted borrows.
     */
    function repayTrustedBorrows(
        address[] calldata borrowers,
        uint256[] calldata repayAmounts,
        bool[] calldata defaulted
    ) external;

    /**
     * @dev Mints and supplies underlying asset tokens into the market due to debt collection.
     *
     * Emits a {MintOnDebtCollection} event.
     *
     * @param borrower The address of the borrower associated with the debt collection.
     * @param mintAmount The amount of underlying asset tokens to mint and supply.
     */
    function mintOnDebtCollection(address borrower, uint256 mintAmount) external;

    /**
     * @dev Redeems and burns tokens when a defaulted borrow is being repaid.
     *
     * Emits a {RepayDefaultedBorrow} event.
     *
     * @param borrower The address of the borrower being repaid.
     * @param burnAmount The amount of tokens to burn.
     */
    function redeemAndBurn(address borrower, uint256 burnAmount) external;

    /**
     * @dev Checks if the account is configured as a contract administrator.
     */
    function isAdmin(address account) external view returns (bool);

    /**
     * @dev Returns the address of the market contract.
     */
    function market() external view returns (address);

    /**
     * @dev Returns the cap of mint-on-debt-collection operation in underlying tokens.
     */
    function mintOnDebtCollectionCap() external view returns (uint256);
}
