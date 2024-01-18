// @ts-ignore
import hre, { deployments, ethers, getNamedAccounts } from 'hardhat';
import {
    COMMON_DEPLOY_PARAMS,
    Duration,
    encodeParameterArray,
    encodeParameters,
    getAddressesProvider,
    getFeeCollector,
    getOrderManager,
    getPool,
    getPoolTokenFactory,
    getPositionManager,
    getRiskReserve,
    getTokens,
    latest,
    ORDER_MANAGER_ID,
    PAIR_INFO_ID,
    POSITION_MANAGER_ID,
} from '../helpers';
import { deploy } from '@openzeppelin/hardhat-upgrades/dist/utils';

async function main() {
    const { deployer } = await getNamedAccounts();
    console.log(deployer);

    const addressesProvider = await getAddressesProvider();
    const poolTokenFactory = await getPoolTokenFactory();
    const pool = await getPool();
    const positionManager = await getPositionManager();
    const orderManager = await getOrderManager();
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

    await hre.run('time-execution', {
        target: orderManager.address,
        value: '0',
        signature: 'upgradeTo(address)',
        data: encodeParameters(['address'], ['0xFe1afE64349199fC432a3871944478A9e8c62767']),
        eta: Duration.seconds(13)
            .add(await latest())
            .toString(),
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
