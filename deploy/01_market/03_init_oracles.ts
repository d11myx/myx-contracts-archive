import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    Duration,
    getIndexPriceFeed,
    getMockToken,
    getOraclePriceFeed,
    getTimelock,
    getToken,
    increase,
    latest,
    loadReserveConfig,
    MARKET_NAME,
    MOCK_PRICES,
    waitForTx,
} from '../../helpers';
import { ethers } from 'ethers';
import { encodeParameterArray, encodeParameters } from '../../test/helpers/misc';

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
    const pairTokenPriceIds = [];
    for (let pair of priceFeedPairs) {
        const pairToken = pair == MARKET_NAME ? await getToken() : await getMockToken(pair);

        pairTokenAddresses.push(pairToken.address);
        pairTokenPrices.push(MOCK_PRICES[pair].toString());
        pairTokenPriceIds.push(ethers.utils.formatBytes32String(pair));
    }
    let timelock = await getTimelock();

    let timestamp = await latest();
    let eta = Duration.days(1);
    await timelock.queueTransaction(
        indexPriceFeed.address,
        '0',
        'updatePrice(address[],uint256[])',
        encodeParameterArray(['address[]', 'uint256[]'], [pairTokenAddresses, pairTokenPrices]),
        eta.add(timestamp),
    );
    const mockPyth = await hre.ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());

    const updateData = await oraclePriceFeed.getUpdateData(pairTokenAddresses, pairTokenPrices);
    const fee = await mockPyth.getUpdateFee(updateData);
    await timelock.queueTransaction(
        oraclePriceFeed.address,
        fee,
        'setAssetPriceIds(address[],bytes32[])',
        encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenAddresses, pairTokenPriceIds]),
        eta.add(timestamp),
    );
    await increase(Duration.days(1));
    //  getTimelock();
    await waitForTx(
        await timelock.executeTransaction(
            indexPriceFeed.address,
            '0',
            'updatePrice(address[],uint256[])',
            encodeParameterArray(['address[]', 'uint256[]'], [pairTokenAddresses, pairTokenPrices]),
            eta.add(timestamp),
        ),
    );

    await waitForTx(
        await timelock.executeTransaction(
            oraclePriceFeed.address,
            fee,
            'setAssetPriceIds(address[],bytes32[])',
            encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenAddresses, pairTokenPriceIds]),
            eta.add(timestamp),
        ),
    );
};
func.id = `InitOracles`;
func.tags = ['market', 'init-oracles'];
export default func;
