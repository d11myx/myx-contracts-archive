import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    getIndexPriceFeed,
    getMockToken,
    getOraclePriceFeed,
    getPriceOracle,
    getToken,
    loadReserveConfig,
    MARKET_NAME,
    MOCK_PRICES,
    waitForTx,
} from '../../helpers';
import { ethers } from 'ethers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { poolAdmin } = await getNamedAccounts();
    const poolAdminSigner = await hre.ethers.getSigner(poolAdmin);

    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    const oraclePriceFeed = await getOraclePriceFeed();
    const indexPriceFeed = await getIndexPriceFeed();
    const priceOracle = await getPriceOracle();

    const priceFeedPairs: string[] = [MARKET_NAME];
    priceFeedPairs.push(...Object.keys(pairConfigs));

    const pairTokenAddresses = [];
    const pairTokenPrices = [];
    const pairTokenPriceIds = [];
    for (let pair of priceFeedPairs) {
        const pairToken = pair == MARKET_NAME ? await getToken() : await getMockToken(pair);

        pairTokenAddresses.push(pairToken.address);
        pairTokenPrices.push(MOCK_PRICES[pair]);
        pairTokenPriceIds.push(ethers.utils.formatBytes32String(pair));
    }

    await waitForTx(await indexPriceFeed.connect(poolAdminSigner).updatePrice(pairTokenAddresses, pairTokenPrices));

    await waitForTx(
        await oraclePriceFeed.connect(poolAdminSigner).setAssetPriceIds(pairTokenAddresses, pairTokenPriceIds),
    );

    const mockPyth = await hre.ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());

    const updateData = await oraclePriceFeed.getUpdateData(pairTokenAddresses, pairTokenPrices);
    const fee = await mockPyth.getUpdateFee(updateData);
    await waitForTx(
        await oraclePriceFeed.connect(poolAdminSigner).updatePrice(pairTokenAddresses, pairTokenPrices, { value: fee }),
    );

    // for (let pair of priceFeedPairs) {
    //     const pairToken = pair == MARKET_NAME ? await getToken() : await getMockToken(pair);
    //
    //     console.log(`getOraclePrice: ${pair} :`, await priceOracle.getOraclePrice(pairToken.address));
    //     console.log(`getIndexPrice: ${pair} :`, await priceOracle.getIndexPrice(pairToken.address));
    // }
};
func.id = `InitOracles`;
func.tags = ['market', 'init-oracles'];
export default func;
