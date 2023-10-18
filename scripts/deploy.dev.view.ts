import { ethers } from 'hardhat';
import {
    getExecutionLogic,
    getExecutor,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    getRouter,
    getTokens,
    POOL_TOKEN_FACTORY,
    TradeType,
} from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import usdt from '../markets/usdt';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    // const router = await getRouter();
    // const orderManager = await getOrderManager();
    // const positionManager = await getPositionManager();
    // const executor = await getExecutor();
    // const executionLogic = await getExecutionLogic();
    const priceOracle = await getOraclePriceFeed('0x80a595b839e53a68b730e0deeBa52f1e2C87C0fC');
    const pool = await getPool('0x26bcd5ac4a813df6d526B34cAb5F526a1f7042a8');

    // console.log(await pool.getPair(0));
    // console.log(await pool.getPair(1));
    // console.log(await pool.getDepositAmount(0, ethers.utils.parseEther('100000')));
    // console.log(await pool.getMintLpAmount(0, ethers.utils.parseEther('10'), 0));
    // console.log(await pool.getMintLpAmount(0, 0, ethers.utils.parseEther('100000000')));
    // console.log(await pool.lpFairPrice(0));
    // console.log(await pool.lpFairPrice(1));

    // console.log(await pool.getVault(0));

    // const poolToken = await ethers.getContractAt('PoolToken', '0x3E3fbEc25d0864B4b1870Dcdb5e703b34D259271');
    // console.log(`totalSupply:`, await poolToken.totalSupply());

    const { btc, eth, usdt } = await getTokens();
    const btcOraclePrice = ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30);
    const ethOraclePrice = ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30);
    const btcIndexPrice = ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30);
    const ethIndexPrice = ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30);
    console.log(`btc price:`, btcOraclePrice);
    console.log(`eth price:`, ethOraclePrice);
    console.log(`btc price:`, btcIndexPrice);
    console.log(`eth price:`, ethIndexPrice);

    console.log(await pool.getVault(1));
    // 251253798489917280557928;
    // 9.305696240367308;
    // 9.276714;
    //
    // console.log(await pool.getVault(0));
    // console.log(await btc.balanceOf(pool.address));
    // console.log(await usdt.balanceOf(pool.address));
    // console.log(await pool.getReceivedAmount(0, ethers.utils.parseEther('2631.7516')));

    // const wallet = new ethers.Wallet(
    //     '0xa470e816670131554b9dae535a27b63406a07815ae755caa1e0c26a0ab34b93a',
    //     deployer.provider,
    // );
    // await positionManager
    //     .connect(wallet)
    //     .adjustCollateral(0, '0xa6932e7D4262A9E7D9f6982Bf8849199ab631686', true, '-20000000000000000000000');

    // console.log(await orderManager.getDecreaseOrder(474, TradeType.MARKET));
    // console.log(
    //     await positionManager.needADL(0, true, '17849000000000000000', ethers.utils.parseUnits('26868.83500000', 30)),
    // );

    // console.log(await executionLogic.connect(deployer).executeDecreaseOrder(471, TradeType.MARKET, 0, 0, false));
    // console.log(
    //     await executionLogic.connect(deployer).executeADLAndDecreaseOrder(
    //         [
    //             {
    //                 positionKey: '0xdcc5ae6c4b686f6972ea9a4796ca59d922918a00afbc0a7ccb7540299223ab73',
    //                 sizeAmount: ethers.utils.parseEther('666.7829'),
    //                 level: 0,
    //                 commissionRatio: 0,
    //             },
    //         ],
    //         474,
    //         TradeType.MARKET,
    //         0,
    //         0,
    //     ),
    // );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
