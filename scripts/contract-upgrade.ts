// @ts-ignore
import hre, { deployments, ethers, getNamedAccounts } from 'hardhat';
import {
    COMMON_DEPLOY_PARAMS,
    Duration,
    encodeParameterArray,
    encodeParameters,
    getAddressesProvider,
    getPool,
    getPoolTokenFactory,
    latest,
    PAIR_INFO_ID,
} from '../helpers';

async function main() {
    const { deployer } = await getNamedAccounts();
    console.log(deployer);

    const addressesProvider = await getAddressesProvider();
    const poolTokenFactory = await getPoolTokenFactory();
    const pool = await getPool();

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

    await hre.run('time-execution', {
        target: pool.address,
        value: '0',
        signature: 'upgradeTo(address)',
        data: encodeParameters(['address'], ['0x3d16e9bC8ba264af3CE902a2C3d3AD297ec3D594']),
        eta: Duration.seconds(13)
            .add(await latest())
            .toString(),
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
