// SPDX-License-Identifier: MIT

pragma solidity 0.8.16;

import { IComptroller } from "../interfaces/IComptroller.sol";

/**
 * @title ComptrollerMock contract
 * @author CloudWalk Inc.
 * @dev An implementation of the {IComptroller} interface for test purposes.
 */
contract ComptrollerMock is IComptroller {
    /// @dev The result of the `enterMarkets()` function.
    uint256 private _enterMarketsResult;

    /**
     * @dev Emitted when the `enterMarkets()` function is executed.
     * @param firstMarket The address of the first market in the input array of the `enterMarkets()` function.
     * @param marketCount The number of markets in the input array of the `enterMarkets()` function.
     */
    event EnterMarkets(address firstMarket, uint256 marketCount);

    /**
     * @dev Simulates the call of the {IComptroller-enterMarkets} function with emitting the corresponding event.
     * @param cTokens The list of market addresses.
     * @return The array of copies of the corresponding storage variable.
     */
    function enterMarkets(address[] memory cTokens) external returns (uint256[] memory) {
        uint256 len = cTokens.length;
        uint256 result = _enterMarketsResult;
        uint256[] memory results = new uint256[](len);

        emit EnterMarkets(cTokens[0], len);

        for (uint256 i = 0; i < len; ++i) {
            results[i] = result;
        }

        return results;
    }

    /// @dev Sets the result of the `enterMarkets()` function in the corresponding storage variable.
    function setEnterMarketsResult(uint256 result) external {
        _enterMarketsResult = result;
    }
}
