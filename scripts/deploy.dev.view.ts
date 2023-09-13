import { ethers } from 'hardhat';
import {
    getExecutor,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPositionManager,
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

    const router = await getRouter('0x2aC6f70392622f060EEa03B6dd72FC0c16C17F27');
    // const orderManager = await getOrderManager();
    const positionManager = await getPositionManager('0xb07fB1a2F76574FD5243C1aA25Bb992cE9490B9C');
    // const executor = await getExecutor();
    // const oraclePriceFeed = await getOraclePriceFeed();
    // const pool = await getPool();
    // const rewardDistributor = await getRewardDistributor();

    // console.log(`router:`, router.address);
    // console.log(`index:`, await executor.increaseMarketOrderStartIndex());

    // console.log(await pool.getPair(0));
    // console.log(await pool.getPair(1));
    //
    // const btcPrice = ethers.utils.formatUnits(
    //     await oraclePriceFeed.getPrice('0xA015800A0C690C74A04DAf3002087DbD4D23bE24'),
    //     30,
    // );
    // const ethPrice = ethers.utils.formatUnits(
    //     await oraclePriceFeed.getPrice('0x437afc3306b2911B39024cafF860A07b43427d83'),
    //     30,
    // );
    // console.log(`btc price:`, btcPrice);
    // console.log(`eth price:`, ethPrice);

    3600;
    0x733f604824feaf688bab4bd8d4571c3c2a0cae84615affb4f02a5c6aab28917e;
    console.log(await positionManager.fundingInterval());
    console.log(await positionManager.getPosition('0x0097e2a5dfD50155Bbf17cdDAe4E52B3B911dbA1', 0, true));

    const order: TradingTypes.DecreasePositionRequestStruct = {
        account: '0x0097e2a5dfd50155bbf17cddae4e52b3b911dba1',
        pairIndex: 0,
        tradeType: 0,
        collateral: '0',
        triggerPrice: '25807520000000000000000000000000000',
        sizeAmount: '3307300000000000000',
        isLong: true,
    };
    const wallet = new ethers.Wallet(
        '8bc175705f87bdce6a819abe782fb9e5702b862ac4231dcbfd7fc84d242bae31',
        deployer.provider,
    );
    await router.connect(wallet).createDecreaseOrder(order);

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
