import { ethers } from 'hardhat';
import {
    getExecutionLogic,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    getPriceOracle,
    getRouter,
    TradeType,
} from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const positionManager = await getPositionManager();
    // const executor = await getExecutor();
    const executionLogic = await getExecutionLogic();
    const priceOracle = await getPriceOracle();
    const pool = await getPool();

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

    const btcOraclePrice = ethers.utils.formatUnits(
        await priceOracle.getOraclePrice('0x3fF8C9A44733E54a48170ed3839a80C46C912b00'),
        30,
    );
    const ethOraclePrice = ethers.utils.formatUnits(
        await priceOracle.getOraclePrice('0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc'),
        30,
    );
    const btcIndexPrice = ethers.utils.formatUnits(
        await priceOracle.getIndexPrice('0x3fF8C9A44733E54a48170ed3839a80C46C912b00'),
        30,
    );
    const ethIndexPrice = ethers.utils.formatUnits(
        await priceOracle.getIndexPrice('0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc'),
        30,
    );
    console.log(`btc price:`, btcOraclePrice);
    console.log(`eth price:`, ethOraclePrice);
    console.log(`btc price:`, btcIndexPrice);
    console.log(`eth price:`, ethIndexPrice);

    // console.log(await orderManager.getDecreaseOrder(36, TradeType.LIMIT));

    const wallet = new ethers.Wallet(
        'f694662d5a2129ec6740a9780a0eb8c8798cf57cfc3524e4ec12f3362eb05132',
        deployer.provider,
    );

    await positionManager
        .connect(wallet)
        .adjustCollateral(1, wallet.address, true, ethers.utils.parseEther('-1000000'));
    console.log(await positionManager.getPosition(wallet.address, 1, true));
    // 59515400;

    // await executionLogic.executeDecreaseOrder();

    // console.log(await orderManager.getDecreaseOrder(1, TradeType.MARKET));

    // const fee = await oraclePriceFeed.getUpdateFee(
    //     [
    //         '0x3fF8C9A44733E54a48170ed3839a80C46C912b00',
    //         '0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc',
    //         '0x87ae754028dAC18f1D1D8EB76B557C280906a6aa',
    //     ],
    //     ['2704051500000', '163443750000', '100000000'],
    // );
    // await oraclePriceFeed.updatePrice(
    //     [
    //         '0x3fF8C9A44733E54a48170ed3839a80C46C912b00',
    //         '0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc',
    //         '0x87ae754028dAC18f1D1D8EB76B557C280906a6aa',
    //     ],
    //     ['2704051500000', '163443750000', '100000000'],
    //     { value: fee },
    // );

    // await indexPriceFeed.updatePrice(
    //     [
    //         '0x3fF8C9A44733E54a48170ed3839a80C46C912b00',
    //         '0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc',
    //         '0x87ae754028dAC18f1D1D8EB76B557C280906a6aa',
    //     ],
    //     ['2710031000000', '163709000000', '100000000'],
    // );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
