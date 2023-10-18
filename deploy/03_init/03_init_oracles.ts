import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    Duration,
    encodeParameterArray,
    getIndexPriceFeed,
    getMockToken,
    getOraclePriceFeed,
    getToken,
    latest,
    loadReserveConfig,
    MARKET_NAME,
    MOCK_INDEX_PRICES,
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

    const priceFeedPairs: string[] = [MARKET_NAME];
    priceFeedPairs.push(...Object.keys(pairConfigs));

    const pairTokenAddresses: string[] = [];
    const pairTokenPrices: string[] = [];
    const pairTokenIndexPrices = [];
    const pairTokenPriceIds = [];
    for (let pair of priceFeedPairs) {
        const pairToken = pair == MARKET_NAME ? await getToken() : await getMockToken(pair);

        pairTokenAddresses.push(pairToken.address);
        pairTokenPrices.push(MOCK_PRICES[pair].toString());
        pairTokenIndexPrices.push(MOCK_INDEX_PRICES[pair]);
        pairTokenPriceIds.push(ethers.utils.formatBytes32String(pair));
    }

    const mockPyth = await hre.ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());

    const updateData = await oraclePriceFeed.getUpdateData(pairTokenAddresses, pairTokenPrices);
    const fee = await mockPyth.getUpdateFee(updateData);

    await hre.run('time-execution', {
        target: oraclePriceFeed.address,
        value: '0',
        signature: 'setAssetPriceIds(address[],bytes32[])',
        data: encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenAddresses, pairTokenPriceIds]),
        eta: Duration.days(1)
            .add(await latest())
            .toString(),
    });

    // await hre.run('time-execution', {
    //     target: addressesProvider.address,
    //     value: 0,
    //     signature: 'setPriceOracle(address)',
    //     data: encodeParameters(['address'], [oraclePriceFeed.address]),
    //     eta: Duration.days(1).add(await latest()),
    // });
    //
    // await hre.run('time-execution', {
    //     target: addressesProvider.address,
    //     value: 0,
    //     signature: 'setIndexPriceOracle(address)',
    //     data: encodeParameters(['address'], [indexPriceFeed.address]),
    //     eta: Duration.days(1).add(await latest()),
    // });

    await waitForTx(
        await indexPriceFeed.connect(poolAdminSigner).updatePrice(pairTokenAddresses, pairTokenIndexPrices),
    );
    await waitForTx(
        await oraclePriceFeed.connect(poolAdminSigner).updatePrice(pairTokenAddresses, pairTokenPrices, { value: fee }),
    );
};
func.id = `InitOracles`;
func.tags = ['market', 'init-oracles'];
export default func;
