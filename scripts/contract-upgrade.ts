// @ts-ignore
import hre, { deployments, ethers, getNamedAccounts } from 'hardhat';
import {
    COMMON_DEPLOY_PARAMS,
    Duration,
    encodeParameterArray,
    encodeParameters,
    EXECUTION_LOGIC_ID,
    getAddressesProvider,
    getExecutionLogic,
    getExecutor,
    getFeeCollector,
    getFundingRate,
    getOrderManager,
    getPool,
    getPoolTokenFactory,
    getPositionManager,
    getRiskReserve,
    getTokens,
    latest,
    ORACLE_PRICE_FEED_ID,
    ORDER_MANAGER_ID,
    PAIR_INFO_ID,
    POSITION_MANAGER_ID,
    waitForTx,
} from '../helpers';
import { deploy } from '@openzeppelin/hardhat-upgrades/dist/utils';

async function main() {
    const { deployer } = await getNamedAccounts();
    console.log(deployer);

    const addressesProvider = await getAddressesProvider();
    const poolTokenFactory = await getPoolTokenFactory();
    const pool = await getPool();
    const executor = await getExecutor();
    const positionManager = await getPositionManager();
    const orderManager = await getOrderManager();
    const feeCollector = await getFeeCollector();
    const riskReserve = await getRiskReserve();

    const { btc, eth } = await getTokens();

    // await deployments.deploy(`${PAIR_INFO_ID}`, {
    //     from: deployer,
    //     contract: 'Pool',
    //     args: [],
    //     proxy: {
    //         owner: deployer,
    //         proxyContract: 'UUPS',
    //         proxyArgs: [],
    //         execute: {
    //             methodName: 'initialize',
    //             args: [addressesProvider.address, poolTokenFactory.address],
    //         },
    //     },
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    // await deployments.deploy(`${POSITION_MANAGER_ID}`, {
    //     from: deployer,
    //     contract: 'PositionManager',
    //     args: [],
    //     proxy: {
    //         owner: deployer,
    //         proxyContract: 'UUPS',
    //         proxyArgs: [],
    //         execute: {
    //             methodName: 'initialize',
    //             args: [
    //                 addressesProvider.address,
    //                 pool.address,
    //                 usdt.address,
    //                 feeCollector.address,
    //                 riskReserve.address,
    //             ],
    //         },
    //     },
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    // await deployments.deploy(`${ORDER_MANAGER_ID}`, {
    //     from: deployer,
    //     contract: 'OrderManager',
    //     args: [],
    //     proxy: {
    //         owner: deployer,
    //         proxyContract: 'UUPS',
    //         proxyArgs: [],
    //         execute: {
    //             methodName: 'initialize',
    //             args: [addressesProvider.address, pool.address, positionManager.address],
    //         },
    //     },
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    // await deployments.deploy(`${ORACLE_PRICE_FEED_ID}-v2`, {
    //     from: deployer,
    //     contract: 'PythOraclePriceFeed',
    //     args: [addressesProvider.address, '0xdF21D137Aadc95588205586636710ca2890538d5', [], []],
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    // const pythOraclePriceFeed = await ethers.getContractAt(
    //     'PythOraclePriceFeed',
    //     '0x973547A1410B461A1D22513E47957ca68bd8bcdA',
    // );
    // await waitForTx(await pythOraclePriceFeed.updatePriceAge(60));
    //
    // await waitForTx(
    //     await pythOraclePriceFeed.setTokenPriceIds(
    //         [btc.address, eth.address],
    //         [
    //             '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    //             '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    //         ],
    //     ),
    // );

    // await deployments.deploy(`${EXECUTION_LOGIC_ID}-v2`, {
    //     from: deployer,
    //     contract: 'ExecutionLogic',
    //     args: [
    //         addressesProvider.address,
    //         pool.address,
    //         orderManager.address,
    //         positionManager.address,
    //         feeCollector.address,
    //         60 * 5,
    //     ],
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    // await feeCollector.updateExecutionLogicAddress('0x9A2a97a7952dE94Beb4B86B8a2062f5B9a85a55c');

    await hre.run('time-execution', {
        target: addressesProvider.address,
        value: '0',
        signature: 'setExecutionLogic(address)',
        data: encodeParameters(['address'], ['0x535b954b5388b45E650c535b99dD0cc689e4Ea76']),
        eta: Duration.seconds(13)
            .add(await latest())
            .toString(),
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
