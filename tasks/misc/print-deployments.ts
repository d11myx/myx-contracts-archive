import { task } from 'hardhat/config';
import { getWalletBalances, MARKET_NAME } from '../../helpers';
import { getPool } from '../../helpers';
import { address } from 'hardhat/internal/core/config/config-validation';

task(`print-deployments`).setAction(async (_, { deployments, getNamedAccounts, ...hre }) => {
    const allDeployments = await deployments.all();

    let formattedDeployments: { [k: string]: { address: string } } = {};
    let mockedTokens: { [k: string]: { address: string } } = {};
    let LPs: { [k: string]: { address: string } } = {};

    console.log('');
    console.log('Accounts after deployment');
    console.table(await getWalletBalances());

    // Print deployed contracts
    console.log('');
    console.log('Deployments');
    Object.keys(allDeployments).forEach((key) => {
        if (!key.includes('MockToken')) {
            formattedDeployments[key] = {
                address: allDeployments[key].address,
            };
        }
    });
    console.table(formattedDeployments);

    Object.keys(allDeployments).forEach((key) => {
        if (key.includes('MockToken') || key == MARKET_NAME || key == 'WETH') {
            mockedTokens[key] = {
                address: allDeployments[key].address,
            };
        }
    });
    console.log('');
    console.log('MockedTokens');
    console.table(mockedTokens);

    const pool = await getPool();
    LPs['WBTC-USDT-LP'] = { address: (await pool.pairs(1)).pairToken };
    LPs['WETH-USDT-LP'] = { address: (await pool.pairs(2)).pairToken };

    console.log('');
    console.log('LPs');
    console.table(LPs);

    console.log('');
});
