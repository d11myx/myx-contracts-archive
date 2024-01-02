// @ts-ignore
import hre, { deployments, ethers, getNamedAccounts } from 'hardhat';
import {
    COMMON_DEPLOY_PARAMS,
    Duration,
    encodeParameterArray,
    encodeParameters,
    getAddressesProvider,
    getFeeCollector,
    getPool,
    getPoolTokenFactory,
    getPositionManager,
    getRiskReserve,
    getTokens,
    latest,
    PAIR_INFO_ID,
    POSITION_MANAGER_ID,
} from '../helpers';

async function main() {
    const { deployer } = await getNamedAccounts();
    console.log(deployer);

    const addressesProvider = await getAddressesProvider();
    const poolTokenFactory = await getPoolTokenFactory();
    const pool = await getPool();
    const positionManager = await getPositionManager();
    const feeCollector = await getFeeCollector();
    const riskReserve = await getRiskReserve();

    const { usdt } = await getTokens();

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

    await hre.run('time-execution', {
        target: positionManager.address,
        value: '0',
        signature: 'upgradeTo(address)',
        data: encodeParameters(['address'], ['0xF26F796D855c2AE7395C04226B0fB12251694309']),
        eta: Duration.seconds(13)
            .add(await latest())
            .toString(),
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
