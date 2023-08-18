import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    getIndexPriceFeed,
    getMockPriceFeed,
    getMockToken,
    getOraclePriceFeed,
    loadReserveConfig,
    MARKET_NAME,
    MOCK_PRICES,
    getBlockTimestamp,
    waitForTx,
} from '../../helpers';
import { ethers } from 'ethers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { poolAdmin, keeper } = await getNamedAccounts();
    const poolAdminSigner = await hre.ethers.getSigner(poolAdmin);
    const keeperSigner = await hre.ethers.getSigner(keeper);

    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    const oraclePriceFeed = await getOraclePriceFeed();
    const indexPriceFeed = await getIndexPriceFeed();

    const pairTokenAddresses = [];
    const pairTokenPrices = [];
    for (let pair of Object.keys(pairConfigs)) {
        const pairToken = await getMockToken(pair);
        const mockPriceFeed = await getMockPriceFeed(pair);

        await mockPriceFeed.connect(keeperSigner).setLatestAnswer(MOCK_PRICES[pair]);
        await oraclePriceFeed.connect(poolAdminSigner).setTokenConfig(pairToken.address, mockPriceFeed.address, 8);

        pairTokenAddresses.push(pairToken.address);
        pairTokenPrices.push(
            ethers.utils.parseUnits(ethers.utils.formatUnits(MOCK_PRICES[pair].toString(), 8).toString(), 30),
        );
    }
    await waitForTx(await indexPriceFeed.connect(poolAdminSigner).setTokens(pairTokenAddresses, [10, 10]));
    await waitForTx(await indexPriceFeed.connect(poolAdminSigner).setMaxTimeDeviation(10000));
    await waitForTx(
        await indexPriceFeed
            .connect(keeperSigner)
            .setPrices(pairTokenAddresses, pairTokenPrices, (await getBlockTimestamp()) + 100),
    );

    await waitForTx(await oraclePriceFeed.setIndexPriceFeed(indexPriceFeed.address));
};
func.id = `InitOracles`;
func.tags = ['market', 'init-oracles'];
export default func;
