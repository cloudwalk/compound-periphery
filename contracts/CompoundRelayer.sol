// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { PausableExtUpgradeable } from "./base/PausableExtUpgradeable.sol";

import { IERC20Mintable } from "./interfaces/IERC20Mintable.sol";
import { ICToken } from "./interfaces/ICToken.sol";
import { IComptroller } from "./interfaces/IComptroller.sol";

import { CompoundRelayerStorage } from "./CompoundRelayerStorage.sol";
import { ICompoundRelayer } from "./interfaces/ICompoundRelayer.sol";

/**
 * @title CompoundRelayer contract
 * @author CloudWalk Inc.
 * @dev Compound operations wrapper contract.
 */
contract CompoundRelayer is
    CompoundRelayerStorage,
    Initializable,
    OwnableUpgradeable,
    PausableExtUpgradeable,
    ICompoundRelayer
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    // -------------------- Events -----------------------------------

    /**
     * @dev Emitted when an admin account is configured.
     * @param account The address of the admin account.
     * @param newStatus The new status of the admin account.
     */
    event ConfigureAdmin(address indexed account, bool newStatus);

    /**
     * @dev Emitted when a defaulted borrow is repaid.
     * @param borrower The address of the borrower.
     * @param burnAmount The amount of tokens that has been burned.
     */
    event RepayDefaultedBorrow(address indexed borrower, uint256 burnAmount);

    // -------------------- Errors -----------------------------------

    /// @dev The provided compound payer address is invalid.
    error CompoundPayerInvalidAddress();

    /// @dev The provided compound payer account is already configured.
    error CompoundPayerAlreadyConfigured();

    /// @dev The provided admin account is already configured.
    error AdminAlreadyConfigured();

    /// @dev The transaction sender is not an admin.
    error UnauthorizedAdmin();

    /// @dev Token transferring failed.
    error TransferFromFailure();

    /// @dev The length of the input arrays does not match.
    error InputArraysLengthMismatch();

    /**
     * @dev An error occurred on the Compound comptroller.
     * @param compError The code of the error that occurred.
     */
    error CompoundComptrollerFailure(uint256 compError);

    /**
     * @dev An error occurred on the Compound market.
     * @param compError The code of the error that occurred.
     */
    error CompoundMarketFailure(uint256 compError);

    /// @dev The provided owner is the same as previously set one.
    error OwnerUnchanged();

    // -------------------- Modifiers -----------------------------------

    /**
     * @dev Throws if called by any account other than the admin.
     */
    modifier onlyAdmin() {
        if (!_admins[_msgSender()]) {
            revert UnauthorizedAdmin();
        }
        _;
    }

    // -------------------- Functions -----------------------------------

    /**
     * @dev Constructor that prohibits the initialization of the implementation of the upgradable contract.
     *
     * See details
     * https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializing_the_implementation_contract
     *
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev The initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     */
    function initialize() external initializer {
        __CompoundRelayer_init();
    }

    /**
     * @dev The internal initializer of the upgradable contract.
     *
     * See {CompoundRelayer-initialize}.
     */
    function __CompoundRelayer_init() internal onlyInitializing {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __Pausable_init_unchained();
        __PausableExt_init_unchained();

        __CompoundRelayer_init_unchained();
    }

    /**
     * @dev The unchained internal initializer of the upgradable contract.
     *
     * See {CompoundRelayer-initialize}.
     */
    function __CompoundRelayer_init_unchained() internal onlyInitializing {}

    /**
     * @dev See {ICompoundRelayer-enterMarket}.
     *
     * Requirements:
     *
     * - The caller must be an owner.
     *
     */
    function enterMarket(address market) external onlyOwner {
        address[] memory cTokens = new address[](1);
        cTokens[0] = market;
        uint256[] memory enterMarketResults = IComptroller(ICToken(market).comptroller()).enterMarkets(cTokens);
        if (enterMarketResults[0] != 0) {
            revert CompoundComptrollerFailure(enterMarketResults[0]);
        }

        IERC20Upgradeable uToken = IERC20Upgradeable(ICToken(market).underlying());
        uToken.approve(market, type(uint256).max);
    }

    /**
     * @dev See {ICompoundRelayer-repayBorrowBehalf}.
     */
    function repayBorrowBehalf(
        address market,
        address borrower,
        uint256 repayAmount,
        bool defaulted
    ) external onlyAdmin whenNotPaused {
        ICToken cToken = ICToken(market);
        _repayBorrowBehalf(cToken, cToken.underlying(), borrower, repayAmount, defaulted);
    }

    /**
     * @dev See {ICompoundRelayer-repayBorrowBehalfBatch}.
     */
    function repayBorrowBehalfBatch(
        Repayment[] calldata repayments
    ) external onlyAdmin whenNotPaused {
        uint256 len = repayments.length;
        for (uint256 i = 0; i < len; ++i) {
            ICToken cToken = ICToken(repayments[i].market);
            address uToken = cToken.underlying();

            _repayBorrowBehalf(cToken, uToken, repayments[i].borrower, repayments[i].amount, repayments[i].defaulted);
        }
    }

    /**
     * @dev Repays a borrow on behalf of this compound relayer.
     * @param cToken The address of the market.
     * @param uToken The address of the underlying token.
     * @param borrower The address of the borrower.
     * @param repayAmount The amount of tokens to repay.
     * @param defaulted True if the borrow is defaulted.
     */
    function _repayBorrowBehalf(
        ICToken cToken,
        address uToken,
        address borrower,
        uint256 repayAmount,
        bool defaulted
    ) internal {
        uint256 repaidAmount = _transferFromAndRepay(cToken, IERC20Upgradeable(uToken), borrower, repayAmount);
        if (defaulted) {
            _redeemAndBurn(cToken, IERC20Mintable(uToken), borrower, repaidAmount);
        }
    }

    /**
     * @dev Repays a borrow on behalf of this compound relayer.
     *
     * Emits a {RepayBorrowBehalf} event.
     *
     * @param cToken The address of the market.
     * @param uToken The address of the underlying token.
     * @param borrower The address of the borrower being repaid.
     * @param repayAmount The amount of tokens to repay.
     */
    function _transferFromAndRepay(
        ICToken cToken,
        IERC20Upgradeable uToken,
        address borrower,
        uint256 repayAmount
    ) internal returns (uint256 actualRepayAmount) {
        actualRepayAmount = repayAmount == type(uint256).max
            ? repayAmount = cToken.borrowBalanceCurrent(borrower)
            : repayAmount;

        if (!uToken.transferFrom(_compoundPayer, address(this), actualRepayAmount)) {
            revert TransferFromFailure();
        }

        uint256 repayResult = cToken.repayBorrowBehalf(borrower, actualRepayAmount);
        if (repayResult != 0) {
            revert CompoundMarketFailure(repayResult);
        }

        emit RepayBorrowBehalf(borrower, actualRepayAmount);
    }

    /**
     * @dev Redeems and burns tokens when a defaulted borrow is being repaid.
     *
     * Emits a {RepayDefaultedBorrow} event.
     *
     * @param cToken The address of the market.
     * @param uToken The address of the underlying token.
     * @param borrower The address of the borrower being repaid.
     * @param burnAmount The amount of tokens to burn.
     */
    function _redeemAndBurn(
        ICToken cToken,
        IERC20Mintable uToken,
        address borrower,
        uint256 burnAmount
    ) internal {
        uint256 redeemResult = cToken.redeemUnderlying(burnAmount);
        if (redeemResult != 0) {
            revert CompoundMarketFailure(redeemResult);
        }

        uToken.burn(burnAmount);

        emit RepayDefaultedBorrow(borrower, burnAmount);
    }

    /**
     * @dev Configures an admin.
     *
     * Requirements:
     *
     * - The caller must be an owner.
     * - The new status of the admin must defer from the previously set one.
     *
     * Emits a {ConfigureAdmin} event.
     *
     * @param account The address of the admin account.
     * @param newStatus The new status of the admin account.
     */
    function configureAdmin(address account, bool newStatus) external onlyOwner {
        if (_admins[account] == newStatus) {
            revert AdminAlreadyConfigured();
        }

        _admins[account] = newStatus;

        emit ConfigureAdmin(account, newStatus);
    }

    /**
     * @dev See {ICompoundRelayer-configureCompoundPayer}.
     * Requirements:
     *
     * - The caller must be an owner.
     *
     * Emits a {ConfigureCompoundPayer} event.
     */
    function configureCompoundPayer(address compoundPayer) external onlyOwner {
        address oldCompoundPayer = _compoundPayer;
        if (compoundPayer == address(0)) {
            revert CompoundPayerInvalidAddress();
        }

        if (compoundPayer == oldCompoundPayer) {
            revert CompoundPayerAlreadyConfigured();
        }

        _compoundPayer = compoundPayer;

        emit ConfigureCompoundPayer(oldCompoundPayer, _compoundPayer);
    }

    /**
     * @dev Withdraws ERC20 tokens locked up in the contract.
     *
     * Requirements:
     *
     * - The caller must be the owner
     *
     * @param token The address of the ERC20 token contract.
     * @param to The address of the recipient of tokens.
     * @param amount The amount of tokens to withdraw.
     */
    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) public onlyOwner {
        IERC20Upgradeable(token).safeTransfer(to, amount);
    }

    /**
     * @dev See {ICompoundRelayer-compoundPayer}.
     */
    function compoundPayer() external view returns (address) {
        return _compoundPayer;
    }

    /**
     * @dev See {ICompoundRelayer-isAdmin}.
     */
    function isAdmin(address account) external view returns (bool) {
        return _admins[account];
    }
}
