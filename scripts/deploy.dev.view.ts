import { ethers } from 'hardhat';
import {
    getExecutor,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
    getPriceOracle,
    getRewardDistributor,
    getRouter,
    ZERO_ADDRESS,
} from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { pool } from '../types/contracts';
import { MerkleTree } from 'merkletreejs';
import { AbiHelpers } from 'hardhat/internal/util/abi-helpers';
import keccak256 = require('keccak256');
import { TradingTypes } from '../types/contracts/core/Router';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer, keeper] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const positionManager = await getPositionManager();
    // const executor = await getExecutor();
    const priceOracle = await getPriceOracle();
    const pool = await getPool();
    // const rewardDistributor = await getRewardDistributor();

    // console.log(`router:`, router.address);
    // console.log(`index:`, await executor.increaseMarketOrderStartIndex());

    // console.log(await pool.getPair(0));
    // console.log(await pool.getPair(1));
    console.log(await pool.getDepositAmount(0, ethers.utils.parseEther('100000')));

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
    const oraclePriceFeed = await getOraclePriceFeed();
    console.log(await oraclePriceFeed.getPrice('0x3fF8C9A44733E54a48170ed3839a80C46C912b00'));
    console.log(await oraclePriceFeed.getPrice('0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc'));
    const indexPriceFeed = await getIndexPriceFeed();
    console.log(await indexPriceFeed.getPrice('0x3fF8C9A44733E54a48170ed3839a80C46C912b00'));
    console.log(await indexPriceFeed.getPrice('0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc'));
    console.log(`btc price:`, btcOraclePrice);
    console.log(`eth price:`, ethOraclePrice);
    console.log(`btc price:`, btcIndexPrice);
    console.log(`eth price:`, ethIndexPrice);

    const fee = await oraclePriceFeed.getUpdateFee(
        [
            '0x3fF8C9A44733E54a48170ed3839a80C46C912b00',
            '0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc',
            '0x87ae754028dAC18f1D1D8EB76B557C280906a6aa',
        ],
        ['2704051500000', '163443750000', '100000000'],
    );
    await oraclePriceFeed.updatePrice(
        [
            '0x3fF8C9A44733E54a48170ed3839a80C46C912b00',
            '0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc',
            '0x87ae754028dAC18f1D1D8EB76B557C280906a6aa',
        ],
        ['2704051500000', '163443750000', '100000000'],
        { value: fee },
    );

    // await indexPriceFeed.updatePrice(
    //     [
    //         '0x3fF8C9A44733E54a48170ed3839a80C46C912b00',
    //         '0xb0AB24c940313f6A1e05d01676Db5a4E4E8c79dc',
    //         '0x87ae754028dAC18f1D1D8EB76B557C280906a6aa',
    //     ],
    //     ['2710031000000', '163709000000', '100000000'],
    // );

    // console.log(await priceOracle.indexPriceFeed());
    // console.log(await priceOracle.oraclePriceFeed());
    // console.log(indexPriceFeed.address);
    // console.log(oraclePriceFeed.address);
    // console.log(await oraclePriceFeed.getPrice('0x87ae754028dAC18f1D1D8EB76B557C280906a6aa'));
    // console.log(await indexPriceFeed.getPrice('0x87ae754028dAC18f1D1D8EB76B557C280906a6aa'));

    // console.log(await orderManager.increaseLimitOrders(40));

    // console.log(await orderManager.increaseLimitOrders(53));
    //
    // const factory = await ethers.getContractFactory('RewardDistributor');
    // const re = await factory.deploy(ZERO_ADDRESS);
    // console.log(
    //     await re.a('0x70997970c51812dc3a010c7d01b50e0d17dc79c8', [
    //         '0x7b0f9ac2cf09c8c622b25929c45aabda97b29b7d624d2958cce653f5a30e0884',
    //     ]),
    // );
    // const map = { address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', amount: '1678179842040000000' };
    // const leaves = [map].map((va) => keccak256(va));
    // new MerkleTree();
    // console.log(await rewardDistributor.round());
    // console.log(await rewardDistributor.merkleRoots(1));
    // keccak256().MerkleTree.verify();
    // ('0xdb65c68c8c1ef0f048eaf4fdd535738b54fd71c3e33cd649db304d1199019bfd');
    // // await rewardDistributor.claim('1678179842040000000', [
    // //     '0x7b0f9ac2cf09c8c622b25929c45aabda97b29b7d624d2958cce653f5a30e0884',
    // // ]);

    // const vault = await pool.getVault(0);
    // // console.log(vault);
    // console.log(
    //     `long:`,
    //     ethers.utils.formatUnits(
    //         vault.indexTotalAmount.sub(vault.indexReservedAmount).mul(btcPrice.split('.')[0]).toString(),
    //     ),
    // );
    // console.log(`short:`, ethers.utils.formatUnits(vault.stableTotalAmount.sub(vault.stableReservedAmount).toString()));

    // long: 499341.159
    // short: 500282.636963365265499999
    // long: 387343.2805
    // short: 500309.516555922725499999

    // long: 387223.0109
    // short: 500309.516555922725499999
    // long: 497240.1594
    // short: 500356.563073816175499999
    //

    // console.log(await orderManager.orderWithTpSl(0));
    // console.log(await executor.executeIncreaseMarketOrders([{ orderId: 4, level: 0, commissionRatio: 0 }]));
    // console.log(
    //     ethers.utils.toUtf8String(
    //         '0x000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000d6f72646572206578706972656400000000000000000000000000000000000000',
    //     ),
    // );

    // console.log(await positionManager.getNextFundingRateUpdateTime(0));
    // console.log(await positionManager.lastFundingRateUpdateTimes(0));

    // console.log(
    //     `btc price:`,
    //     ethers.utils.formatUnits(await oraclePriceFeed.getPrice('0x2572481e069456b87350976b304521D818fd4d45'), 30),
    // );
    // console.log(
    //     `eth price:`,
    //     ethers.utils.formatUnits(await oraclePriceFeed.getPrice('0xA015800A0C690C74A04DAf3002087DbD4D23bE24'), 30),
    // );
    //
    // console.log(
    //     ethers.utils.toUtf8String(
    //         '0x00000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000176e6f742072656163682074726967676572207072696365000000000000000000',
    //     ),
    // );

    // console.log(await orderManager.increaseMarketOrders(25));

    // console.log(await positionManager.getPosition('0x2068f8e9C9e61A330F2F713C998D372C04e3C9Cc', 0, true));

    // console.log(await orderManager.decreaseMarketOrders(9));
    //
    // console.log(await executor.connect(keeper).executeDecreaseOrder(9, TradeType.MARKET));

    // console.log(await orderManager.decreaseMarketOrdersIndex());
    // console.log(await executor.decreaseMarketOrderStartIndex());

    // console.log(await oraclePriceFeed.getPrice('0xB010E4aC01bD4410eA04bdD12d1CB39EA0857950'));
    // console.log(await oraclePriceFeed.getPrice('0x16C72f9b628Df203370b9e504a6815191a22F252'));
    // console.log(await oraclePriceFeed.getPrice('0xf20BadFC3D7b86C45a903f95F6c5E4668E421E9C'));
    // console.log(await orderManager.increaseLimitOrdersIndex());
    // console.log(await orderManager.increaseLimitOrders(4));
    // await executor.connect(deployer).executeIncreaseLimitOrders([4]);
    //
    // console.log(keeper.address);
    // console.log(await positionManager.addressExecutor());
    // await executor.connect(keeper).executeIncreaseMarketOrders(1);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
