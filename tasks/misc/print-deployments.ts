import { task } from 'hardhat/config';
import { getWalletBalances } from '../../helpers';
import { getPool } from '../../helpers';

task(`print-deployments`).setAction(async (_, { deployments, getNamedAccounts, ...hre }) => {
    const allDeployments = await deployments.all();

    let formattedDeployments: { [k: string]: { address: string } } = {};
    let mockedTokens: { [k: string]: { address: string } } = {};

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
        if (key.includes('MockToken')) {
            mockedTokens[key] = {
                address: allDeployments[key].address,
            };
        }
    });
    console.log('');
    console.log('MockedTokens');
    console.table(mockedTokens);

    console.log('');
    const pool = await getPool();
    console.log(`BTC-USDT LP: ${(await pool.pairs(0)).pairToken}`);
    console.log(`ETH-USDT LP: ${(await pool.pairs(1)).pairToken}`);
    console.log('');
});
