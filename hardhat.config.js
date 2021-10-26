/**
 * @type import('hardhat/config').HardhatUserConfig
 */

require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
// Configure environment variables.
require('dotenv').config();

module.exports = {
  networks:{
    hardhat: {
      forking: {
        url: process.env.KOVAN_RPC,
        blockNumber: 27958141
      }
    },
    kovan : {
			url: process.env.KOVAN_RPC || '',
			accounts: process.env.KOVAN_PRIVATE_KEY ? [process.env.KOVAN_PRIVATE_KEY] : [],
		}
  },
  solidity: {
    compilers: [
      {version: "0.8.0", settings: {optimizer: {enabled: true, runs: 200}}},
      {version: "0.6.12", settings: {optimizer: {enabled: true, runs: 200}}},
      {version: "0.6.2", settings: {optimizer: {enabled: true, runs: 200}}},
    ]
  }
};
