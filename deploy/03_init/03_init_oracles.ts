import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    abiCoder,
    Duration,
    encodeParameterArray,
    eNetwork,
    getExecutor,
    getIndexPriceFeed,
    getMockToken,
    getOraclePriceFeed,
    getToken,
    getWETH,
    isLocalNetwork,
    latest,
    loadReserveConfig,
    MARKET_NAME,
    MOCK_INDEX_PRICES,
    MOCK_PRICES,
    SymbolMap,
    waitForTx,
} from '../../helpers';
import { ethers } from 'ethers';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { poolAdmin } = await hre.getNamedAccounts();
    const poolAdminSigner = await hre.ethers.getSigner(poolAdmin);

    const network = hre.network.name as eNetwork;
    const reserveConfig = loadReserveConfig(MARKET_NAME);
    const pairConfigs = reserveConfig?.PairsConfig;

    const executor = await getExecutor();
    const oraclePriceFeed = await getOraclePriceFeed();
    const indexPriceFeed = await getIndexPriceFeed();

    const priceFeedPairs: string[] = [MARKET_NAME];
    priceFeedPairs.push(...Object.keys(pairConfigs));

    const pairTokenAddresses: string[] = [];
    for (let pair of priceFeedPairs) {
        let address = '';
        if (pairConfigs[pair]?.useWrappedNativeToken) {
            address = (await getWETH()).address;
        }

        const pairToken = pair == MARKET_NAME ? await getToken() : await getMockToken(pair, address);
        pairTokenAddresses.push(pairToken.address);
    }

    // setup priceIds
    const priceIds = reserveConfig?.OraclePriceId[network] as SymbolMap<string>;
    const pairTokenPriceIds = [];
    const pairTokenPrices: string[] = [];
    for (let pair of Object.keys(reserveConfig.PairsConfig)) {
        let address = '';
        if (pairConfigs[pair]?.useWrappedNativeToken) {
            address = (await getWETH()).address;
        }
        const pairToken = pair == MARKET_NAME ? await getToken() : await getMockToken(pair, address);
        pairTokenPrices.push(pairToken.address);

        if (isLocalNetwork(hre)) {
            pairTokenPriceIds.push(ethers.utils.formatBytes32String(pair));
        } else {
            const priceId = priceIds[pair];
            pairTokenPriceIds.push(priceId);
        }
    }
    console.log(`[deployment] await for setTokenPriceIds...`);

    await waitForTx(
        await oraclePriceFeed.connect(poolAdminSigner).setTokenPriceIds(pairTokenPrices, pairTokenPriceIds),
    );
    await waitForTx(await indexPriceFeed.connect(poolAdminSigner).updateExecutorAddress(executor.address));
    // await hre.run('time-execution', {
    //     target: oraclePriceFeed.address,
    //     value: '0',
    //     signature: 'setTokenPriceIds(address[],bytes32[])',
    //     data: encodeParameterArray(['address[]', 'bytes32[]'], [pairTokenPrices, pairTokenPriceIds]),
    //     eta: Duration.seconds(30)
    //         .add(await latest())
    //         .toString(),
    // });

    // init index price
    const pairTokenIndexPrices = [];
    for (let pair of priceFeedPairs) {
        pairTokenIndexPrices.push(MOCK_INDEX_PRICES[pair]);
    }
    await waitForTx(
        await indexPriceFeed.connect(poolAdminSigner).updatePrice(pairTokenAddresses, pairTokenIndexPrices),
    );

    // init oracle price
    if (isLocalNetwork(hre)) {
        const pairTokenPrices: string[] = [];
        for (let pair of priceFeedPairs) {
            pairTokenPrices.push(MOCK_PRICES[pair].toString());
        }

        const mockPyth = await hre.ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());
        const updateData = await oraclePriceFeed.getUpdateData(pairTokenAddresses, pairTokenPrices);
        const fee = await mockPyth.getUpdateFee(updateData);

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
    }
};
func.id = `InitOracles`;
func.tags = ['market', 'init-oracles'];
export default func;
