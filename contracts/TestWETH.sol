// SPDX-License-Identifier: MIT
pragma solidity 0.6.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TestWETH
 *
 * @dev WETH token for testing.
 */
contract TestWETH is ERC20 {

    /**
     * @dev Tokens are always created with 18 decimals
     * @param _name The name of the token
     * @param _symbol The symbol of the token
     */
    constructor (string memory _name, string memory _symbol) public ERC20(_name, _symbol) {}

    /**
     * @dev Deposits ETH and mints WETH
     */
    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    /**
     * @dev Withdraws ETH and burns WETH
     */
    function withdraw(uint amount) external {
        require(balanceOf(msg.sender) >= amount, "withdraw: not enough balance");
        _burn(msg.sender, amount);
        msg.sender.transfer(amount);
    }
}