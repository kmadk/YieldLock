const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');
const { ethers } = require('hardhat')
const LendingPoolAddressesProvider = 
    require('@aave/protocol-v2/artifacts/contracts/protocol/configuration/LendingPoolAddressesProvider.sol/LendingPoolAddressesProvider.json')

describe("YieldLock test", () => {
    let addresses
    let forwarder
    let alice, bob, charlie
    let weth, dai, newToken
    let lendingPoolAddressesProvider, lendingPool, wethGateway, yieldLock

    beforeEach(async () => {
        // Get accounts
        const signers = await ethers.getSigners();
		addresses = await Promise.all(signers.map(async signer => signer.getAddress()));
		forwarder = { provider: signers[0].provider, signer: signers[0], address: addresses[0] };
		alice = { provider: signers[1].provider, signer: signers[1], address: addresses[1] };
		bob = { provider: signers[2].provider, signer: signers[2], address: addresses[2] };
		charlie = { provider: signers[3].provider, signer: signers[3], address: addresses[3] };
        console.log((await ethers.provider.getBalance(alice.address)).toString());
          

        // Get kovan deployed weth
        weth = await ethers.getContractAt("TestWETH", '0xd0A1E359811322d97991E03f863a0C30C2cF029C');
        // make new token
        newTokenFactory = await ethers.getContractFactory("TestERC20");
        newToken = await newTokenFactory.deploy('NEW', 'NEW');
        await newToken.deployed();
        // connect to existing AAVE deployments
        lendingPoolAddressesProvider = await ethers.getContractAt(LendingPoolAddressesProvider.abi,'0x88757f2f99175387ab4c6a4b3067c77a695b0349');
        lendingPool = await ethers.getContractAt("LendingPool", '0xe0fba4fc209b4948668006b2be61711b7f465bae');
        wethGateway = await ethers.getContractAt("WETHGateway", '0xA61ca04DF33B72b235a8A28CfB535bb7A5271B70');
        // deploy yieldLock contract
        yieldLockFactory = await ethers.getContractFactory("YieldLock");
        yieldLock = await yieldLockFactory.deploy(lendingPool.address, wethGateway.address, weth.address, forwarder.address);
    })

    it("lock and withdraw tokens that arent valid AAVE asset", async () => {
        // mint and approve tokens
        await newToken.mint(alice.address, 1000);
        await newToken.connect(alice.signer).approve(yieldLock.address, 1000);
        // lock tokens
        const fiveDays = 60 * 60 * 24 * 5
        await yieldLock.connect(alice.signer).lock(newToken.address, 1000, fiveDays, bob.address);
        // both locker and recipient attempt to withdraw before expiration date
        await truffleAssert.reverts(yieldLock.connect(alice.signer).
            claim(newToken.address, 1000),"lock period has not been completed" );
        await truffleAssert.reverts(yieldLock.connect(bob.signer).
            claim(newToken.address, 1000), "lock period has not been completed");
        // charlie without balance fails to unlock
        await truffleAssert.reverts(yieldLock.connect(charlie.signer).
            claim(newToken.address, 1000), "no redeemable balance found");
        // progress time past 5 days so rewards can be withdrawn
        await ethers.provider.send('evm_increaseTime', [fiveDays * 2]); 
		await ethers.provider.send('evm_mine');
		// locker withdraw funds
        await truffleAssert.passes(yieldLock.connect(alice.signer).claim(newToken.address, 1000));
        assert.equal((await newToken.balanceOf(alice.address)).toString(), '1000');
        // should revert if recipient or locker attempts to withdraw already withdrawn funds
        await truffleAssert.reverts(yieldLock.connect(alice.signer).claim(newToken.address, 1000), "no redeemable balance found");
        await truffleAssert.reverts(yieldLock.connect(bob.signer).claim(newToken.address, 1000), "no redeemable balance found");
    })

    it("lock multiple tokens that are later claimable", async () => {
        // mint and approve tokens
        await newToken.mint(alice.address, 2000);
        await newToken.connect(alice.signer).approve(yieldLock.address, '10000000000000000000');
        // lock tokens
        await yieldLock.connect(alice.signer).lock(newToken.address, 1000, 0, bob.address);
        // lock withdraws after expiration date
        await truffleAssert.passes(yieldLock.connect(alice.signer).claim(newToken.address, 1000));
        assert.equal((await newToken.balanceOf(alice.address)).toString(), '2000');
        // should revert if recipient or locker attempts to withdraw already withdrawn funds
        await truffleAssert.reverts(yieldLock.connect(bob.signer).claim(newToken.address, 1000), "no redeemable balance found");
        await truffleAssert.reverts(yieldLock.connect(alice.signer).claim(newToken.address, 1000), "no redeemable balance found");
        // lock tokens
        const fiveDays = 60 * 60 * 24 * 5
        // lock tokens twice
        await yieldLock.connect(alice.signer).lock(newToken.address, 1000, fiveDays, bob.address);
        await yieldLock.connect(alice.signer).lock(newToken.address, 1000, fiveDays * 1.5, bob.address);
        // progress time past 5 days so rewards can be withdrawn
        await ethers.provider.send('evm_increaseTime', [fiveDays * 2]); 
		await ethers.provider.send('evm_mine');
        // withdraw after expiration date
        await truffleAssert.passes(yieldLock.connect(bob.signer).claim(newToken.address, 1000));
        assert.equal((await newToken.balanceOf(bob.address)).toString(), '1000');
        await truffleAssert.passes(yieldLock.connect(alice.signer).claim(newToken.address, 1000));
        assert.equal((await newToken.balanceOf(alice.address)).toString(), '1000');
        // should revert if recipient or locker attempts to withdraw already withdrawn funds
        await truffleAssert.reverts(yieldLock.connect(bob.signer).claim(newToken.address, 1000), "no redeemable balance found");
        await truffleAssert.reverts(yieldLock.connect(alice.signer).claim(newToken.address, 1000), "no redeemable balance found");
        
    })


    it("lock and withdraw tokens that are a valid ERC20 (weth) AAVE asset", async () => {
        let wethAmount = ethers.utils.parseEther("4");
        // mint and approve tokens
        await weth.connect(alice.signer).deposit({ value: wethAmount });
        await weth.connect(alice.signer).approve(yieldLock.address, wethAmount);
        // lock tokens
        const fourDays = 60 * 60 * 24 * 4
        await yieldLock.connect(alice.signer).lock(weth.address, wethAmount, fourDays, bob.address);
        // both locker and recipient attempt to withdraw before expiration date
        await truffleAssert.reverts(yieldLock.connect(alice.signer).
            claim(weth.address, wethAmount),"lock period has not been completed" );
        await truffleAssert.reverts(yieldLock.connect(bob.signer).
            claim(weth.address, wethAmount), "lock period has not been completed");
        // charlie without balance fails to unlock
        await truffleAssert.reverts(yieldLock.connect(charlie.signer).
            claim(weth.address, wethAmount), "no redeemable balance found");
        // progress time past 5 days so rewards can be withdrawn
        await ethers.provider.send('evm_increaseTime', [fourDays * 2]); 
        await ethers.provider.send('evm_mine');
        // lock withdraws after expiration date
        await truffleAssert.passes(yieldLock.connect(bob.signer).claim(weth.address, wethAmount));
        assert.equal((await weth.balanceOf(bob.address)).toString(), wethAmount.toString());
        // should revert if recipient or locker attempts to withdraw already withdrawn funds
        await truffleAssert.reverts(yieldLock.connect(bob.signer).claim(weth.address, wethAmount), "no redeemable balance found");
        await truffleAssert.reverts(yieldLock.connect(alice.signer).claim(weth.address, wethAmount), "no redeemable balance found");    
    })

    it("lock and withdraw ETH", async () => {
        let ethAmount = ethers.utils.parseEther("4");
        // lock tokens
        const fourDays = 60 * 60 * 24 * 4
        await yieldLock.connect(alice.signer).lock('0x0000000000000000000000000000000000000000', ethAmount, fourDays, bob.address, {value: ethAmount});
        // both locker and recipient attempt to withdraw before expiration date
        await truffleAssert.reverts(yieldLock.connect(alice.signer).
            claim('0x0000000000000000000000000000000000000000', ethAmount),"lock period has not been completed" );
        await truffleAssert.reverts(yieldLock.connect(bob.signer).
            claim('0x0000000000000000000000000000000000000000', ethAmount), "lock period has not been completed");
        // charlie without balance fails to unlock
        await truffleAssert.reverts(yieldLock.connect(charlie.signer).
            claim('0x0000000000000000000000000000000000000000', ethAmount), "no redeemable balance found");
        // progress time past 5 days so rewards can be withdrawn
        await ethers.provider.send('evm_increaseTime', [fourDays * 2]); 
        await ethers.provider.send('evm_mine');
        let bobBalBefore = await ethers.provider.getBalance(bob.address);
        // lock withdraws after expiration date
        await truffleAssert.passes(yieldLock.connect(bob.signer).claim('0x0000000000000000000000000000000000000000', ethAmount));
        let bobBalAfter = await ethers.provider.getBalance(bob.address);
        // subtract balance and leave room for gas
        assert(bobBalAfter - bobBalBefore > ethAmount.toString() - '100000000000000000');
        // should revert if recipient or locker attempts to withdraw already withdrawn funds
        await truffleAssert.reverts(yieldLock.connect(bob.signer).claim('0x0000000000000000000000000000000000000000', ethAmount), "no redeemable balance found");
        await truffleAssert.reverts(yieldLock.connect(alice.signer).claim('0x0000000000000000000000000000000000000000', ethAmount), "no redeemable balance found");    
    })

})