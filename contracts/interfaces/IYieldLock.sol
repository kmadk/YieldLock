// SPDX-License-Identifier:MIT
pragma solidity 0.6.12;

/**
 * Interface for YieldLock Contract
 */

interface IYieldLock {

    // locks and stakes tokens in AAVE for a given duration
    function lock(address tokenAddress, uint amount, uint duration, address recipient) external payable;
    
    // unlocks tokens and accrued yield
    function claim(address token, uint amount) external;
 }