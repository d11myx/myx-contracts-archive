// @ts-ignore
import hre, { deployments, ethers } from 'hardhat';
import {
    COMMON_DEPLOY_PARAMS,
    Duration,
    encodeParameters,
    EXECUTION_LOGIC_ID,
    getAddressesProvider,
    getExecutionLogic,
    getExecutor,
    getFeeCollector,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    getRiskReserve,
    getRouter,
    getTokens,
    latest,
    POSITION_CALLER,
    POSITION_MANAGER_ID,
    ZERO_ADDRESS,
    ZERO_HASH,
} from '../helpers';
import { deploy } from '@openzeppelin/hardhat-upgrades/dist/utils';
import { getContractAt } from '@nomiclabs/hardhat-ethers/internal/helpers';
import { sleep } from '@nomicfoundation/hardhat-verify/internal/utilities';
import Decimal from 'decimal.js';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const positionManager = await getPositionManager();
    const executor = await getExecutor();
    const executionLogic = await getExecutionLogic();
    const oraclePriceFeed = await getOraclePriceFeed();
    const indexPriceFeed = await getIndexPriceFeed();
    const feeCollector = await getFeeCollector();
    const pool = await getPool();
    const riskReserve = await getRiskReserve();
    const addressesProvider = await getAddressesProvider();

    const { btc, eth, usdt } = await getTokens();

    // const btcOraclePrice = ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30);
    // const ethOraclePrice = ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30);
    // const btcIndexPrice = ethers.utils.formatUnits(await indexPriceFeed.getPrice(btc.address), 30);
    // const ethIndexPrice = ethers.utils.formatUnits(await indexPriceFeed.getPrice(eth.address), 30);
    // console.log(`btc price:`, btcOraclePrice);
    // console.log(`eth price:`, ethOraclePrice);
    // console.log(`btc price:`, btcIndexPrice);
    // console.log(`eth price:`, ethIndexPrice);

    // const key = await positionManager.getPositionKey('0x180D310656bc630295Ef5Fd30bB94EE59f3e2905', 1, true);
    // console.log(await orderManager.getPositionOrders(key));

    // console.log(await pool.getVault(2));
    // const poolToken = await ethers.getContractAt('PoolToken', '0xb76d66C2fe6b4ed0694AD71B99c5466db2dA4C79');
    // console.log(await poolToken.totalSupply());
    // console.log(await pool.lpFairPrice(2, await oraclePriceFeed.getPrice(eth.address)));

    // let index = 1;
    // setInterval(async () => {
    //     console.log(`index: ${index}  ${await pool.getVault(1)}`);
    //     index++;
    // }, 2000);

    // console.log(
    //     await positionManager.getPositionByKey(
    //         '0x' + 'dff4cfe4d659f7296941cbe543f6766ae9aa3e0c5ee922d6a9a638de954c0ba0',
    //     ),
    // );

    // await deployments.deploy(`MultipleTransfer`, {
    //     from: deployer.address,
    //     contract: 'MultipleTransfer',
    //     args: [],
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    // await deployer.sendTransaction({
    //     to: '0x44C140E06D710Df2727AD7c13618869ec34364Ea',
    //     value: ethers.utils.parseEther('100000'),
    // });
    // console.log(
    //     await usdt.mint('0x83cea7468B2e9B4c2ec62818eb4d37196b256f88', ethers.utils.parseUnits('100000000000000', 6)),
    // );
    // console.log(btc.address);
    // console.log(await btc.owner());
    // console.log(await btc.mint('0xed2339eec9e42b4CF7518a4ecdc57BA251e63C74', ethers.utils.parseUnits('1000000', 8)));

    // console.log(await pool.getVault(1));
    // console.log(await pool.getVault(2));
    // console.log(await riskReserve.getReservedAmount(usdt.address));
    //
    // console.log(await pool.feeTokenAmounts(usdt.address));

    // 用户保证金：153343994
    // btc交易对U：39375073
    // eth交易对U：10704332
    // 风险准备金：10704332

    console.log(await positionManager.longTracker(1));

    // for (let i = 0; i < 10000; i++) {
    //     console.log(
    //         `当前价格: `,
    //         new Decimal(ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30)).toFixed(5),
    //     );
    //     // @ts-ignore
    //     console.log(`LP持仓方向: `, (await positionManager.getExposedPositions(1)) < 0 ? '多' : '空');
    //     console.log(
    //         `LP持仓价格: `,
    //         new Decimal(ethers.utils.formatUnits((await pool.getVault(1)).averagePrice, 30)).toFixed(5),
    //     );
    //     console.log(
    //         `LP盈亏: `,
    //         new Decimal(
    //             ethers.utils.formatUnits(
    //                 await positionManager.lpProfit(1, usdt.address, await oraclePriceFeed.getPrice(btc.address)),
    //                 6,
    //             ),
    //         ).toFixed(5),
    //     );
    //     console.log('------------------------------------------');
    //     await sleep(1000);
    // }

    // console.log(await oraclePriceFeed.getPrice(btc.address));
    // console.log(await positionManager.lpProfit(1, usdt.address, await oraclePriceFeed.getPrice(btc.address)));

    // await deployments.deploy(`${EXECUTION_LOGIC_ID}-V2`, {
    //     from: deployer.address,
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

    // var executionLogic1 = await getExecutionLogic('0xc85D5e8Dfa43fC31Bf12bF517E02e0d2381C0058');
    // await executionLogic1.updateExecutor(executor.address);
    //
    // await hre.run('time-execution', {
    //     target: addressesProvider.address,
    //     value: '0',
    //     signature: 'setExecutionLogic(address)',
    //     data: encodeParameters(['address'], ['0xc85D5e8Dfa43fC31Bf12bF517E02e0d2381C0058']),
    //     eta: Duration.seconds(10)
    //         .add(await latest())
    //         .toString(),
    // });

    // console.log(await executionLogic.maxTimeDelay());
    // console.log(await executionLogic.updateMaxTimeDelay(20 * 60));

    // console.log(await pool.lpFairPrice(2, '2060738556470000000000000000000000'));

    // const pythOraclePriceFeed = await getOraclePriceFeed();
    // console.log(`pythOraclePriceFeed:`, pythOraclePriceFeed.address);
    // const priceFeed = await ethers.getContractAt('PythOraclePriceFeed', pythOraclePriceFeed.address);
    // console.log(await priceFeed.pyth());
    //
    // console.log(await priceFeed.tokenPriceIds(btc.address));
    // console.log(await priceFeed.tokenPriceIds(eth.address));

    // console.log(await priceFeed.getPrice(btc.address));
    // console.log(await priceFeed.getPrice(eth.address));
    // await waitForTx(await priceFeed.updatePythAddress('0xdF21D137Aadc95588205586636710ca2890538d5'));
    //
    // await waitForTx(
    //     await priceFeed.setTokenPriceIds(
    //         [btc.address, eth.address],
    //         [
    //             '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    //             '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    //         ],
    //     ),
    // );

    //
    // const poolToken = await ethers.getContractAt('PoolToken', '0xB220A53E4E1b5B99BCFc8a6CF300a3276976f4a8');
    // await hre.run('time-execution', {
    //     target: poolToken.address,
    //     value: '0',
    //     signature: 'setMiner(address, bool)',
    //     data: encodeParameters(['address', 'bool'], [deployer.address, true]),
    //     eta: Duration.hours(13)
    //         .add(await latest())
    //         .toString(),
    // });

    // curl -X POST --data '{"jsonrpc":"2.0","method":"hardhat_setBalance","params":["0x2068f8e9C9e61A330F2F713C998D372C04e3C9Cc","0xde0b6b3a7640000"],"id":1}' https://pre-rpc.myx.cash
    // const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    // for (let signer of signers) {
    //     // await hre.network.provider.send('hardhat_setBalance', [signer.address, '0xde0b6b3a7640000']);
    //     // console.log(
    //     //     `curl -X POST --data '{"jsonrpc":"2.0","method":"hardhat_setBalance","params":["${signer.address}","0xde0b6b3a7640000"],"id":1}' https://pre-rpc.myx.cash`,
    //     // );
    //     console.log(
    //         signer.address + '_' + ethers.utils.formatEther(await deployer.provider.getBalance(signer.address)),
    //     );
    // }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
