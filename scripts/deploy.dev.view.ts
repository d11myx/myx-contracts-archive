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
    const positionManager = await getPositionManager();
    // const executor = await getExecutor();
    // const executionLogic = await getExecutionLogic();
    const priceOracle = await getOraclePriceFeed();
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

    const { btc, eth, usdt } = await getTokens();
    const btcOraclePrice = ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30);
    const ethOraclePrice = ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30);
    const btcIndexPrice = ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30);
    const ethIndexPrice = ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30);
    console.log(`btc price:`, btcOraclePrice);
    console.log(`eth price:`, ethOraclePrice);
    console.log(`btc price:`, btcIndexPrice);
    console.log(`eth price:`, ethIndexPrice);

    const adl = await positionManager.needADL(
        0,
        true,
        ethers.utils.parseEther('37.15'),
        ethers.utils.parseUnits('27000', 30),
    );
    console.log(adl);

    console.log(
        await positionManager.needADL(
            0,
            true,
            ethers.utils.parseEther('37.15').sub(adl.needADLAmount),
            ethers.utils.parseUnits('27000', 30),
        ),
    );
    console.log(await pool.getVault(0));
    console.log(`getExposedPositions:`, await positionManager.getExposedPositions(0));
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
