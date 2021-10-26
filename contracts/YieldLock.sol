// SPDX-License-Identifier:MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {LendingPool} from "@aave/protocol-v2/contracts/protocol/lendingpool/LendingPool.sol";
import {WETHGateway} from "@aave/protocol-v2/contracts/misc/WETHGateway.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BaseRelayRecipient} from "./BaseRelayRecipient.sol";
import {IYieldLock} from "./interfaces/IYieldLock.sol";

/**
 * A contract to lock deposits and generate yield in AAVE that
 * may be later redeemed by a designated recipient
 */

contract YieldLock is BaseRelayRecipient, IYieldLock {

    struct depositInfo {
        uint lockExpiration;
        address pairAddress;
        bool exists;
    }

    // address => (tokenAddress => (token amount => depositInfo))
    mapping(address => mapping(address => mapping(uint => depositInfo[]))) public redeemableBalances;

    // deployed AAVE LendingPool Contract
    LendingPool lendingPool;
    // deployed AAVE WETH Gateway Contract
    WETHGateway wEthGateway;
    // wETH address
    address wETH;

    //constructor
    constructor(address _lendingPool, address payable _wEthGateway, address _wETH, address _trustedForwarder) public {
        lendingPool = LendingPool(_lendingPool);
        wEthGateway = WETHGateway(_wEthGateway);
        wETH = _wETH;
        trustedForwarder = _trustedForwarder;
    }

    /**
     * @dev Locks tokens for a recipient
     * @param tokenAddress address of the token to lock
     * @param amount amount of tokens to lock
     * @param duration duration of lock
     * @param recipient address of the recipient
     */
    function lock(address tokenAddress, uint amount, uint duration, address recipient) external payable override {
        require(recipient != address(0), "recipient cannot be the zero address");
        require(amount > 0, "amount must be greater than 0");
        require(duration >= 0, "duration must be greater than or equal to 0");

        // if token is ERC20, transfer funds to this contract
        if (tokenAddress == address(0)) {
            require(amount == msg.value, "amount must equal msg.value");
        } else {
            // transfers ERC20 token to this contract to lock
            require(IERC20(tokenAddress).transferFrom(_msgSender(), address(this), amount), "transfer failed");
        }

        // adds deposit information to relevant redeemableBalances mappings
        uint unlockTimestamp = now + duration;
        redeemableBalances[_msgSender()][tokenAddress][amount].push(depositInfo(unlockTimestamp, recipient, true));
        redeemableBalances[recipient][tokenAddress][amount].push(depositInfo(unlockTimestamp, _msgSender(), true));
        // if asset is valid, depositing tokens into AAVE & use WETHGateway in case of ETH deposit
        if (lendingPool.getReserveData(tokenAddress).aTokenAddress != address(0)) {
            if (tokenAddress == address(0)) {
                wEthGateway.depositETH{ value: msg.value}(address(this), 0);
            } else {
                IERC20(tokenAddress).approve(address(lendingPool), amount);
                lendingPool.deposit(tokenAddress, amount, address(this), 0);
            }
        }

    }

    /**
     * @dev unlock tokens and interest
     * @param tokenAddress address of the token to redeem
     * @param amount amount of tokens to redeem
     */
    function claim(address tokenAddress, uint amount) external override {
        require(amount > 0, "amount must be greater than 0");
        // loop to find earliest deposit type of this tokenAddress and amount
        uint i = 0;
        for (i = 0; i < redeemableBalances[_msgSender()][tokenAddress][amount].length; i++) {
            if (redeemableBalances[_msgSender()][tokenAddress][amount][i].exists) {
                break;
            }
        }
        require(i != (redeemableBalances[_msgSender()][tokenAddress][amount].length), "no redeemable balance found");
        require(redeemableBalances[_msgSender()][tokenAddress][amount][i].lockExpiration <= now, "lock period has not been completed");
        // get address of either original recipient or locker that both have a right to the funds
        address connectedAddress = redeemableBalances[_msgSender()][tokenAddress][amount][i].pairAddress;
        // delete redeemableBalance for original recipient and locker as one of them is now unlocking
        delete redeemableBalances[_msgSender()][tokenAddress][amount][i];
        delete redeemableBalances[connectedAddress][tokenAddress][amount][i];       

        // if asset is not valid, unlocking funds in contract
        if (lendingPool.getReserveData(tokenAddress).aTokenAddress == address(0)) {
            // if token is O address, transfer funds to _msgSender()
            if (tokenAddress == address(0)) {
                (bool success, bytes memory data) =_msgSender().call{value: amount}("");
                require(success, "ETH transfer failed");
            } else {
            // transfers ERC20 tokens to _msgSender()
            require(IERC20(tokenAddress).transfer(_msgSender(), amount), "transfer from contract failed");

            }
        } else {
            // if asset is valid, withdrawing funds from AAVE
            if (tokenAddress == address(0)) {
                // approve and withdraw ETH
                IERC20(lendingPool.getReserveData(tokenAddress).aTokenAddress).approve(address(wEthGateway), amount);
                wEthGateway.withdrawETH(amount, _msgSender());
            } else {
                // approve and withdraw tokens
                IERC20(lendingPool.getReserveData(tokenAddress).aTokenAddress).approve(address(lendingPool), amount);
                lendingPool.withdraw(tokenAddress, amount, _msgSender());
            }
        }

    }

    function versionRecipient()
        external
        virtual
        override
        view
        returns (string memory)
    {
        return "1";
    }

}