import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    Duration,
    encodeParameterArray,
    encodeParameters,
    getAddressesProvider,
    getIndexPriceFeed,
    getMockToken,
    getOraclePriceFeed,
    getTimelock,
    getToken,
    increase,
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
    const addressesProvider = await getAddressesProvider();

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
    let timelock = await getTimelock();

    let timestamp = await latest();
    let eta = Duration.days(1);
    // await timelock.queueTransaction(
    //     indexPriceFeed.address,
    //     '0',
    //     'updatePrice(address[],uint256[])',
    //     encodeParameterArray(['address[]', 'uint256[]'], [pairTokenAddresses, pairTokenPrices]),
    //     eta.add(timestamp),
    // );
    const mockPyth = await hre.ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());

    const updateData = await oraclePriceFeed.getUpdateData(pairTokenAddresses, pairTokenPrices);
    const fee = await mockPyth.getUpdateFee(updateData);
    await timelock.queueTransaction(
        oraclePriceFeed.address,
        0,
        'setAssetPriceIds(address[],bytes32[])',
        encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenAddresses, pairTokenPriceIds]),
        eta.add(timestamp),
    );
    await timelock.queueTransaction(
        addressesProvider.address,
        0,
        'setPriceOracle(address)',
        encodeParameters(['address'], [oraclePriceFeed.address]),
        eta.add(timestamp),
    );
    await timelock.queueTransaction(
        addressesProvider.address,
        0,
        'setIndexPriceOracle(address)',
        encodeParameters(['address'], [indexPriceFeed.address]),
        eta.add(timestamp),
    );
    // await timelock.queueTransaction(
    //     oraclePriceFeed.address,
    //     fee,
    //     'updatePrice(address[],uint256[])',
    //     encodeParameterArray(['address[]', 'uint256[]'], [pairTokenAddresses, pairTokenPrices]),
    //     eta.add(timestamp),
    // );
    await increase(Duration.days(1));
    //  getTimelock();
    // await waitForTx(
    //     await timelock.executeTransaction(
    //         indexPriceFeed.address,
    //         '0',
    //         'updatePrice(address[],uint256[])',
    //         encodeParameterArray(['address[]', 'uint256[]'], [pairTokenAddresses, pairTokenPrices]),
    //         eta.add(timestamp),
    //     ),
    // );

    await waitForTx(
        await timelock.executeTransaction(
            oraclePriceFeed.address,
            0,
            'setAssetPriceIds(address[],bytes32[])',
            encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenAddresses, pairTokenPriceIds]),
            eta.add(timestamp),
        ),
    );

    await waitForTx(
        await timelock.executeTransaction(
            addressesProvider.address,
            0,
            'setPriceOracle(address)',
            encodeParameters(['address'], [oraclePriceFeed.address]),
            eta.add(timestamp),
        ),
    );

    await waitForTx(
        await timelock.executeTransaction(
            addressesProvider.address,
            0,
            'setIndexPriceOracle(address)',
            encodeParameters(['address'], [indexPriceFeed.address]),
            eta.add(timestamp),
        ),
    );

    await waitForTx(
        await indexPriceFeed.connect(poolAdminSigner).updatePrice(pairTokenAddresses, pairTokenIndexPrices),
    );
    await waitForTx(
        await oraclePriceFeed.connect(poolAdminSigner).updatePrice(pairTokenAddresses, pairTokenPrices, { value: fee }),
    );

    // await waitForTx(
    //     await timelock.executeTransaction(
    //         oraclePriceFeed.address,
    //         fee,
    //         'updatePrice(address[],uint256[])',
    //         encodeParameterArray(['address[]', 'uint256[]'], [pairTokenAddresses, pairTokenPrices]),
    //         eta.add(timestamp),
    //     ),
    // );
};
func.id = `InitOracles`;
func.tags = ['market', 'init-oracles'];
export default func;
