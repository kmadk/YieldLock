'use strict';

// Imports.
const hre = require('hardhat');
const ethers = hre.ethers;

// Configuration for this deployment.
const options = { gasLimit: ethers.BigNumber.from(6000000), gasPrice: ethers.utils.parseEther('0.000000005') };


// Log the gas cost of a transaction.
async function logTransactionGas (transaction) {
    let transactionReceipt = await transaction.wait();
    let transactionGasCost = transactionReceipt.gasUsed;
    console.log(` -> Gas cost: ${transactionGasCost.toString()}`);
    return transactionGasCost;
}

// Deploy using an Ethers signer to a network.
async function main () {
    const signers = await ethers.getSigners();
    const addresses = await Promise.all(signers.map(async signer => signer.getAddress()));
    const deployer = { provider: signers[0].provider, signer: signers[0], address: addresses[0] };
    console.log(`Deploying contracts from: ${deployer.address}`);

    // Create a variable to track the total gas cost of deployment.
    let totalGasCost = ethers.utils.parseEther('0');

    // Retrieve contract artifacts and deploy them.
    const yieldLockFactory = await ethers.getContractFactory('Miladys');

    // Deploy the item collection.
    console.log(` -> Deploying the item collection ...`);
    let yieldLock = await yieldLockFactory.connect(deployer.signer)
        .deploy('0xe0fba4fc209b4948668006b2be61711b7f465bae', '0xA61ca04DF33B72b235a8A28CfB535bb7A5271B70',
        '0xd0A1E359811322d97991E03f863a0C30C2cF029C', '0xF82986F574803dfFd9609BE8b9c7B92f63a1410E');
    let yieldLockDeploy = await yieldLock.deployed();
    console.log(`* YieldLock contract deployed to: ${yieldLock.address}`);
    totalGasCost = totalGasCost.add(await logTransactionGas(yieldLockDeploy.deployTransaction));

    // Verify the smart contract on Etherscan.
    console.log(`[$]: npx hardhat verify --network kovan ${yieldLock.address}`);

    
    // Output the final gas cost.
    console.log('');
    console.log(`=> Final gas cost of deployment: ${totalGasCost.toString()}`);
    
} 

// Execute the script and catch errors.
main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
