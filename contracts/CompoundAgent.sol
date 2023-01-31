// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import { PausableExtUpgradeable } from "./base/PausableExtUpgradeable.sol";
import { CompoundAgentStorage } from "./CompoundAgentStorage.sol";
import { ICompoundAgent } from "./interfaces/ICompoundAgent.sol";
import { IERC20Mintable } from "./interfaces/IERC20Mintable.sol";
import { IComptroller } from "./interfaces/IComptroller.sol";
import { ICToken } from "./interfaces/ICToken.sol";

/**
 * @title CompoundAgent contract
 * @author CloudWalk Inc.
 * @dev Compound operations wrapper contract.
 */
contract CompoundAgent is
    Initializable,
    OwnableUpgradeable,
    PausableExtUpgradeable,
    CompoundAgentStorage,
    ICompoundAgent
{
    // -------------------- Events -----------------------------------

    /**
     * @dev Emitted when an admin account is configured.
     * @param account The address of the admin account.
     * @param newStatus The new status of the admin account.
     */
    event ConfigureAdmin(address indexed account, bool newStatus);

    /**
     * @dev Emitted when a cap of mint-on-debt-collection operation is configured.
     * @param oldCap The previous value of the mint cap.
     * @param newCap The new value of the mint cap.
     */
    event SetMintOnDebtCollectionCap(uint256 oldCap, uint256 newCap);

    // -------------------- Errors -----------------------------------

    /// @dev An admin account is already configured.
    error AdminAlreadyConfigured();

    /// @dev The transaction sender is not an admin.
    error UnauthorizedAdmin();

    /// @dev The amount to redeem equals zero.
    error ZeroRedeemAmount();

    /// @dev Token minting failed.
    error MintFailure();

    /// @dev The length of the input arrays does not match.
    error InputArraysLengthMismatch();

    /**
     * @dev An error occurred on the Compound market.
     * @param compError The code of the error that occurred.
     */
    error CompoundMarketFailure(uint256 compError);

    /**
     * @dev An error occurred on the Compound comptroller.
     * @param compError The code of the error that occurred.
     */
    error CompoundComptrollerFailure(uint256 compError);

    /// @dev A new owner is the same as previously set one.
    error OwnerUnchanged();

    /// @dev The cap of mint-on-debt-collection operation is exceeded.
    error MintOnDebtCollectionCapExcess();

    /// @dev The cap of mint-on-debt-collection operation is unchanged.
    error MintOnDebtCollectionCapUnchanged();

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
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable .
     *
     * @param market_ The address of the market contract.
     */
    function initialize(address market_) external initializer {
        __CompoundAgent_init(market_);
    }

    /**
     * @dev The internal initializer of the upgradable contract.
     *
     * See {CompoundAgent-initialize}.
     *
     * @param market_ The address of the market contract.
     */
    function __CompoundAgent_init(address market_) internal onlyInitializing {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __Pausable_init_unchained();
        __PausableExt_init_unchained();

        __CompoundAgent_init_unchained(market_);
    }

    /**
     * @dev The unchained internal initializer of the upgradable contract.
     *
     * See {CompoundAgent-initialize}.
     *
     * @param market_ The address of the market contract.
     */
    function __CompoundAgent_init_unchained(address market_) internal onlyInitializing {
        address[] memory cTokens = new address[](1);
        cTokens[0] = market_;
        uint256[] memory enterMarketResults = IComptroller(ICToken(market_).comptroller()).enterMarkets(cTokens);
        if (enterMarketResults[0] != 0) {
            revert CompoundComptrollerFailure(enterMarketResults[0]);
        }

        IERC20Upgradeable uToken = IERC20Upgradeable(ICToken(market_).underlying());
        uToken.approve(owner(), type(uint256).max);
        uToken.approve(market_, type(uint256).max);

        _market = market_;
    }

    /**
     * @dev See {ICompoundAgent-mint}.
     *
     * Requirements:
     *
     * - The caller must be an owner.
     * - The contract must not be paused.
     */
    function mint(uint256 mintAmount) public override onlyOwner {
        uint256 result = ICToken(_market).mint(mintAmount);
        if (result != 0) {
            revert CompoundMarketFailure(result);
        }
    }

    /**
     * @dev See {ICompoundAgent-redeem}.
     *
     * Requirements:
     *
     * - The caller must be an owner.
     * - The contract must not be paused.
     */
    function redeem(uint256 redeemAmount) external override onlyOwner {
        uint256 result = ICToken(_market).redeem(redeemAmount);
        if (result != 0) {
            revert CompoundMarketFailure(result);
        }
    }

    /**
     * @dev See {ICompoundAgent-redeemUnderlying}.
     *
     * Requirements:
     *
     * - The caller must be an owner.
     * - The contract must not be paused.
     */
    function redeemUnderlying(uint256 redeemAmount) public override onlyOwner {
        uint256 result = ICToken(_market).redeemUnderlying(redeemAmount);
        if (result != 0) {
            revert CompoundMarketFailure(result);
        }
    }

    /**
     * @dev See {ICompoundAgent-repayTrustedBorrow}.
     *
     * Requirements:
     *
     * - The caller must be an admin.
     * - The contract must not be paused.
     */
    function mintAndRepayTrustedBorrow(
        address borrower,
        uint256 repayAmount,
        bool defaulted
    ) external onlyAdmin whenNotPaused {
        ICToken cToken = ICToken(_market);
        IERC20Mintable uToken = IERC20Mintable(cToken.underlying());
        _mintAndRepayTrustedBorrow(cToken, uToken, borrower, repayAmount, defaulted);
    }

    /**
     * @dev See {ICompoundAgent-repayTrustedBorrows}.
     *
     * Requirements:
     *
     * - The caller must be an admin.
     * - The contract must not be paused.
     */
    function mintAndRepayTrustedBorrows(
        address[] calldata borrowers,
        uint256[] calldata repayAmounts,
        bool[] calldata defaulted
    ) external onlyAdmin whenNotPaused {
        uint256 len = borrowers.length;
        if (len != repayAmounts.length || len != defaulted.length) {
            revert InputArraysLengthMismatch();
        }

        ICToken cToken = ICToken(_market);
        IERC20Mintable uToken = IERC20Mintable(cToken.underlying());

        for (uint256 i = 0; i < len; ++i) {
            _mintAndRepayTrustedBorrow(cToken, uToken, borrowers[i], repayAmounts[i], defaulted[i]);
        }
    }

    /**
     * @dev See {ICompoundAgent-mintOnDebtCollection}.
     *
     * Requirements:
     *
     * - The caller must be an admin.
     * - The contract must not be paused.
     * - The amount of underlying tokens to mint must not exceed the configured cap.
     */
    function mintOnDebtCollection(address borrower, uint256 mintAmount) external onlyAdmin whenNotPaused {
        if (mintAmount > _mintOnDebtCollectionCap) {
            revert MintOnDebtCollectionCapExcess();
        }

        emit MintOnDebtCollection(borrower, mintAmount);

        ICToken cToken = ICToken(_market);
        IERC20Mintable uToken = IERC20Mintable(cToken.underlying());
        if (!uToken.mint(address(this), mintAmount)) {
            revert MintFailure();
        }

        uint256 result = cToken.mint(mintAmount);
        if (result != 0) {
            revert CompoundMarketFailure(result);
        }
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
     * @dev Configures a new cap of mint-on-debt-collection operation in underlying tokens.
     *
     * Requirements:
     *
     * - The caller must be an owner.
     * - The new mint cap must defer from the previously set one.
     *
     * Emits a {SetMintOnDebtCollectionCap} event.
     *
     * @param newCap The value of the new mint cap.
     */
    function setMintOnDebtCollectionCap(uint256 newCap) external onlyOwner {
        uint256 oldCap = _mintOnDebtCollectionCap;
        if (oldCap == newCap) {
            revert MintOnDebtCollectionCapUnchanged();
        }

        _mintOnDebtCollectionCap = newCap;

        emit SetMintOnDebtCollectionCap(oldCap, newCap);
    }

    /**
     * @dev See {ICompoundAgent-isAdmin}.
     */
    function isAdmin(address account) external view returns (bool) {
        return _admins[account];
    }

    /**
     * @dev See {ICompoundAgent-market}.
     */
    function market() external view returns (address) {
        return _market;
    }

    /**
     * @dev See {ICompoundAgent-mintOnDebtCollectionCap}.
     */
    function mintOnDebtCollectionCap() external view returns (uint256) {
        return _mintOnDebtCollectionCap;
    }

    /**
     * @dev Overrides the {OwnableUpgradeable-transferOwnership} function.
     *
     * Executes the `transferOwnership` function from the base `OwnableUpgradeable` contract
     * and updates the allowance for old and new owners on the underlying token after that.
     *
     * Requirements:
     *
     * - The caller must be an owner.
     *
     * @param newOwner The address of the new contract owner.
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        address oldOwner = owner();
        if (oldOwner == newOwner) {
            revert OwnerUnchanged();
        }

        OwnableUpgradeable.transferOwnership(newOwner);

        IERC20Upgradeable uToken = IERC20Upgradeable(ICToken(_market).underlying());
        uToken.approve(oldOwner, 0);
        uToken.approve(newOwner, type(uint256).max);
    }

    /**
     * @dev Repays a borrow belonging to a trusted borrower.
     *
     * Emits a {RepayTrustedBorrow} event.
     * Emits a {RepayDefaultedBorrow} event in the case of a defaulted borrow.
     *
     * @param cToken The address of the market.
     * @param uToken The address of the underlying token.
     * @param borrower The address of the borrower.
     * @param repayAmount The amount of tokens to repay.
     * @param defaulted True if the borrow is defaulted.
     */
    function _mintAndRepayTrustedBorrow(
        ICToken cToken,
        IERC20Mintable uToken,
        address borrower,
        uint256 repayAmount,
        bool defaulted
    ) internal {
        uint256 repaidAmount = _mintAndRepay(cToken, uToken, borrower, repayAmount);
        if (defaulted) {
            _redeemAndBurn(cToken, uToken, borrower, repaidAmount);
        }
    }

    /**
     * @dev Mints tokens and repays a borrow on behalf of a trusted borrower.
     *
     * Emits a {RepayTrustedBorrow} event.
     *
     * @param cToken The address of the market.
     * @param uToken The address of the underlying token.
     * @param borrower The address of the borrower being repaid.
     * @param repayAmount The amount of tokens to repay.
     */
    function _mintAndRepay(
        ICToken cToken,
        IERC20Mintable uToken,
        address borrower,
        uint256 repayAmount
    ) internal returns (uint256 actualRepayAmount) {
        actualRepayAmount = repayAmount == type(uint256).max
            ? repayAmount = cToken.borrowBalanceCurrent(borrower)
            : repayAmount;

        if (!uToken.mint(address(this), actualRepayAmount)) {
            revert MintFailure();
        }

        uint256 repayResult = cToken.repayBorrowBehalf(borrower, actualRepayAmount);
        if (repayResult != 0) {
            revert CompoundMarketFailure(repayResult);
        }

        emit RepayTrustedBorrow(borrower, actualRepayAmount);
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
}
