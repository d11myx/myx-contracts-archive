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
        signature: 'setTokenPriceIds(address[],bytes32[])',
        data: encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenAddresses, pairTokenPriceIds]),
        eta: Duration.seconds(30)
            .add(await latest())
            .toString(),
    });

    await waitForTx(
        await indexPriceFeed.connect(poolAdminSigner).updatePrice(pairTokenAddresses, pairTokenIndexPrices),
    );
    const abiCoder = new ethers.utils.AbiCoder();

    let pairTokenPricesBytes: string[] = [];
    for (let pairTokenPrice of pairTokenPrices) {
        const items = abiCoder.encode(['uint256'], [pairTokenPrice]);
        pairTokenPricesBytes.push(items);
    }

    await waitForTx(
        await oraclePriceFeed
            .connect(poolAdminSigner)
            .updatePrice(pairTokenAddresses, pairTokenPricesBytes, { value: fee }),
    );
};
func.id = `InitOracles`;
func.tags = ['market', 'init-oracles'];
export default func;
