// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import { ICToken } from "../interfaces/ICToken.sol";

/**
 * @title CTokenMock contract
 * @author CloudWalk Inc.
 * @dev An implementation of the {ICToken} interface for test purposes.
 */
contract CTokenMock is ICToken {
    /// @dev The address of the comptroller contract.
    address private _comptroller;

    /// @dev The address of the underlying token.
    address private _underlyingToken;

    /// @dev The result of the `mint()` function.
    uint256 private _mintResult;

    /// @dev The result of the `redeem()` function.
    uint256 private _redeemResult;

    /// @dev The result of the `redeemUnderlying()` function.
    uint256 private _redeemUnderlyingResult;

    /// @dev The result of the `repayBorrowBehalf()` function.
    uint256 private _repayBorrowBehalfResult;

    /// @dev The result of the `borrowBalanceCurrent()` function.
    uint256 private _borrowBalanceCurrentResult;

    // -------------------- Events -----------------------------------

    /// @dev Emitted when the `mint()` function is executed. Contains the argument of the function.
    event CTokenMockMint(uint256 amount);

    /// @dev Emitted when the `redeem()` function is executed. Contains the argument of the function.
    event CTokenMockRedeem(uint256 amount);

    /// @dev Emitted when the `redeemUnderlying()` function is executed. Contains the argument of the function.
    event CTokenMockRedeemUnderlying(uint256 amount);

    /// @dev Emitted when the `repayBorrowBehalf()` function is executed. Contains the arguments of the function.
    event CTokenMockRepayBorrowBehalf(address borrower, uint256 actualRepayAmount);

    /// @dev Emitted when the `borrowBalanceCurrent()` function is executed. Contains the argument of the function.
    event CTokenMockBorrowBalanceCurrent(address borrower);

    // -------------------- Functions --------------------------------

    /// @dev Initializes the contract with the provided addresses of the comptroller and underlying token.
    constructor(address comptroller_, address underlyingToken_) {
        _comptroller = comptroller_;
        _underlyingToken = underlyingToken_;
    }

    /**
     * @dev Simulates the call of the {ICToken-mint} function with emitting the corresponding event.
     * @param amount The amount of tokens to mint.
     * @return The value of the corresponding storage variable previously set to the contract.
     */
    function mint(uint256 amount) external returns (uint256) {
        emit CTokenMockMint(amount);
        return _mintResult;
    }

    /**
     * @dev Simulates the call of the {ICToken-redeem} function with emitting the corresponding event.
     * @param amount The amount of tokens to redeem.
     * @return The value of the corresponding storage variable previously set to the contract.
     */
    function redeem(uint256 amount) external returns (uint256) {
        emit CTokenMockRedeem(amount);
        return _redeemResult;
    }

    /**
     * @dev Simulates the call of the {ICToken-redeemUnderlying} function with emitting the corresponding event.
     * @param amount The amount of underlying tokens to redeem.
     * @return The value of the corresponding storage variable previously set to the contract.
     */
    function redeemUnderlying(uint256 amount) external returns (uint256) {
        emit CTokenMockRedeemUnderlying(amount);
        return _redeemUnderlyingResult;
    }

    /**
     * @dev Simulates the call of the {ICToken-repayBorrowBehalf} function with emitting the corresponding event.
     * @param borrower The address of the borrower.
     * @param repayAmount The amount of tokens to repay.
     * @return The value of the corresponding storage variable previously set to the contract.
     */
    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256) {
        emit CTokenMockRepayBorrowBehalf(borrower, repayAmount);
        return _repayBorrowBehalfResult;
    }

    /**
     * @dev Simulates the call of the {ICToken-borrowBalanceCurrent} function with emitting the corresponding event.
     * @param borrower The address of the borrower.
     * @return The value of the corresponding storage variable previously set to the contract.
     */
    function borrowBalanceCurrent(address borrower) external returns (uint256) {
        emit CTokenMockBorrowBalanceCurrent(borrower);
        return _borrowBalanceCurrentResult;
    }

    /**
     * @dev Simulates the call of the {ICToken-comptroller} function.
     * @return The value of the corresponding storage variable previously set to the contract.
     */
    function comptroller() external view returns (address) {
        return _comptroller;
    }

    /**
     * @dev Simulates the call of the {ICToken-underlying} function.
     * @return The value of the corresponding storage variable previously set to the contract.
     */
    function underlying() external view returns (address) {
        return _underlyingToken;
    }

    /// @dev Sets the result of the `mint()` function in the corresponding storage variable.
    function setMintResult(uint256 newResult) external {
        _mintResult = newResult;
    }

    /// @dev Sets the result of the `redeem()` function in the corresponding storage variable.
    function setRedeemResult(uint256 newResult) external {
        _redeemResult = newResult;
    }

    /// @dev Sets the result of the `redeemUnderlying()` function in the corresponding storage variable.
    function setRedeemUnderlyingResult(uint256 newResult) external {
        _redeemUnderlyingResult = newResult;
    }

    /// @dev Sets the result of the `repayBorrowBehalf()` function in the corresponding storage variable.
    function setRepayBorrowBehalfResult(uint256 newResult) external {
        _repayBorrowBehalfResult = newResult;
    }

    /// @dev Sets the result of the `borrowBalanceCurrent()` function in the corresponding storage variable.
    function setBorrowBalanceCurrentResult(uint256 newResult) external {
        _borrowBalanceCurrentResult = newResult;
    }
}
