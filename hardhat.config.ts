import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'dotenv/config';
import 'solidity-coverage';

const config: HardhatUserConfig = {
	defaultNetwork: 'hardhat',
	networks: {
		hardhat: {
			gas: 'auto',
			gasPrice: 10e9,
			blockGasLimit: 10000000,
		},
		ganache: {
			url: `http://127.0.0.1:8545`,
			gas: 'auto',
			gasPrice: 10e9,
			blockGasLimit: 200000,
		},
	},
	gasReporter: {
		enabled: true,
		currency: 'USD',
		outputFile: 'gas-report.txt',
		noColors: true,
	},
	solidity: {
		version: '0.8.20',
		settings: {
			optimizer: {
				enabled: true,
				runs: 1000000,
			},
			metadata: {
				bytecodeHash: 'none',
			},
		},
	},
	paths: {
		sources: './contracts',
		tests: './test',
		cache: './cache',
		artifacts: './artifacts',
	},
	mocha: {
		timeout: 100000000,
		retries: 3,
	},
};

export default config;
