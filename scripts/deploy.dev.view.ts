// @ts-ignore
import { ethers } from 'hardhat';
import {
    getFeeCollector,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    getRouter,
    getTokens,
} from '../helpers';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const positionManager = await getPositionManager();
    // const executor = await getExecutor();
    // const executionLogic = await getExecutionLogic();
    const oraclePriceFeed = await getOraclePriceFeed();
    const indexPriceFeed = await getIndexPriceFeed();
    const feeCollector = await getFeeCollector();
    const pool = await getPool();

    const { btc, eth, usdt } = await getTokens();

    const btcOraclePrice = ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30);
    const ethOraclePrice = ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30);
    const btcIndexPrice = ethers.utils.formatUnits(await indexPriceFeed.getPrice(btc.address), 30);
    const ethIndexPrice = ethers.utils.formatUnits(await indexPriceFeed.getPrice(eth.address), 30);
    console.log(`btc price:`, btcOraclePrice);
    console.log(`eth price:`, ethOraclePrice);
    console.log(`btc price:`, btcIndexPrice);
    console.log(`eth price:`, ethIndexPrice);

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

    // console.log(await pool.lpFairPrice(2, '2060738556470000000000000000000000'));
    console.log(await pool.getVault(1));
    console.log(await pool.getProfit(2, usdt.address, '2060738556470000000000000000000000'));

    console.log(await feeCollector.getTradingFeeTier(1, 2));

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
