// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { PausableExtUpgradeable } from "./base/PausableExtUpgradeable.sol";

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

    // -------------------- Modifiers ---------------------------------

    /**
     * @dev Throws if called by any account other than the admin.
     */
    modifier onlyAdmin() {
        if (!_admins[_msgSender()]) {
            revert UnauthorizedAdmin();
        }
        _;
    }

    // -------------------- Constructor ------------------------------

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

    // -------------------- Initializers -----------------------------

    /**
     * @dev The initializer of the upgradable contract.
     */
    function initialize() external initializer {
        __CompoundRelayer_init();
    }

    /**
     * @dev The internal initializer of the upgradable contract.
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
     */
    function __CompoundRelayer_init_unchained() internal onlyInitializing {}

    // -------------------- Functions --------------------------------

    /**
     * @inheritdoc ICompoundRelayer
     *
     * @dev Requirements:
     *
     * - The caller must be an owner.
     *
     */
    function enterMarket(address market) external onlyOwner {
        IERC20Upgradeable uToken = IERC20Upgradeable(ICToken(market).underlying());
        uToken.approve(market, type(uint256).max);
    }

    /**
     * @inheritdoc ICompoundRelayer
     *
     * @dev Requirements:
     *
     * - The caller must be an owner.
     * - The new status of the admin must defer from the previously set one.
     *
     * Emits a {ConfigureAdmin} event.
     */
    function configureAdmin(address account, bool newStatus) external onlyOwner {
        if (_admins[account] == newStatus) {
            revert AdminAlreadyConfigured();
        }

        _admins[account] = newStatus;

        emit ConfigureAdmin(account, newStatus);
    }

    /**
     * @inheritdoc ICompoundRelayer
     *
     * @dev Requirements:
     *
     * - The caller must be an owner.
     *
     * Emits a {ConfigureCompoundPayer} event.
     */
    function configureCompoundPayer(address newCompoundPayer) external onlyOwner {
        if (newCompoundPayer == address(0)) {
            revert CompoundPayerInvalidAddress();
        }

        address oldCompoundPayer = _compoundPayer;
        if (oldCompoundPayer == newCompoundPayer) {
            revert CompoundPayerAlreadyConfigured();
        }

        _compoundPayer = newCompoundPayer;

        emit ConfigureCompoundPayer(oldCompoundPayer, newCompoundPayer);
    }

    /**
     * @inheritdoc ICompoundRelayer
     */
    function repayBorrowBehalf(
        address market,
        address borrower,
        uint256 repayAmount
    ) external onlyAdmin whenNotPaused {
        _repayBorrowBehalf(market, borrower, repayAmount);
    }

    /**
     * @inheritdoc ICompoundRelayer
     */
    function repayBorrowBehalfBatch(
        Repayment[] calldata repayments
    ) external onlyAdmin whenNotPaused {
        for (uint256 i = 0; i < repayments.length; ++i) {
            _repayBorrowBehalf(repayments[i].market, repayments[i].borrower, repayments[i].amount);
        }
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

    // -------------------- View functions ---------------------------

    /**
     * @inheritdoc ICompoundRelayer
     */
    function compoundPayer() external view returns (address) {
        return _compoundPayer;
    }

    /**
     * @inheritdoc ICompoundRelayer
     */
    function isAdmin(address account) external view returns (bool) {
        return _admins[account];
    }

    // -------------------- Internal functions -----------------------

    /**
     * @dev Repays a borrow on behalf of this compound relayer.
     * @param market The address of the market.
     * @param borrower The address of the borrower.
     * @param repayAmount The amount of tokens to repay.
     */
    function _repayBorrowBehalf(
        address market,
        address borrower,
        uint256 repayAmount
    ) internal {
        ICToken cToken = ICToken(market);
        IERC20Upgradeable uToken =  IERC20Upgradeable(cToken.underlying());

        uint256 actualRepayAmount = repayAmount == type(uint256).max
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
}
