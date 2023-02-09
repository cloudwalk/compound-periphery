// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20Mintable } from "../interfaces/IERC20Mintable.sol";

/**
 * @title ERC20MintableMock contract
 * @author CloudWalk Inc.
 * @dev An implementation of the {ERC20} contract with minting and burning possibilities for test purposes.
 */
contract ERC20MintableMock is ERC20, IERC20Mintable {
    /// @dev The disable state of the `mint()` function.
    bool private _mintDisabled;

    /// @dev The disable state of the `transferFrom()` function.
    bool private _transferFromDisabled;

    /// @dev Emitted when the `mint()` function is executed. Contains the arguments of the function.
    event ERC20MockMint(address account, uint256 amount);

    /// @dev Emitted when the `burn()` function is executed. Contains the argument of the function.
    event ERC20MockBurn(uint256 amount);

    /// @dev Emitted when the `transferFrom()` function is executed. Contains the argument of the function.
    event ERC20MockTransferFrom(address sender, address recipient, uint256 amount);

    /// @dev Initializes the contract with the provided name and symbol of the token.
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /**
     * @dev Simulates the call of the {IERC20Mintable-mint} function with emitting the corresponding event.
     * @param amount The amount of tokens to mint.
     * @return True if the `mint()` function is not disabled.
     */
    function mint(address account, uint256 amount) external returns (bool) {
        emit ERC20MockMint(account, amount);
        return _mintDisabled ? false : true;
    }

    /**
     * @dev Simulates the call of the {IERC20Mintable-burn} function with emitting the corresponding event.
     * @param amount The amount of tokens to burn.
     */
    function burn(uint256 amount) external {
        emit ERC20MockBurn(amount);
    }

    /**
     * @dev Simulates the call of the {ERC20-transferFrom} function with emitting the corresponding event.
     * @param sender The account whose tokens are transferred.
     * @param recipient The account who receives tokens.
     * @param amount The amount of tokens to transfer.
     * @return True if the `transferFrom()` function is not disabled.
     */
    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        emit ERC20MockTransferFrom(sender, recipient, amount);
        return _transferFromDisabled ? false : true;
    }

    /// @dev Disables the `mint()` function.
    function disableMint() external {
        _mintDisabled = true;
    }

    /// @dev Disables the `transferFrom()` function.
    function disableTransferFrom() external {
        _transferFromDisabled = true;
    }
}
