import { MockPriceFeed, Token } from '../../types';
import { BigNumber } from 'ethers';
import { SignerWithAddress, TestEnv } from './make-suite';
import { ethers } from 'hardhat';
import { getBlockTimestamp, TradeType, waitForTx } from '../../helpers';
import { TradingTypes } from '../../types/contracts/trading/Router';
import snapshotGasCost from '../shared/snapshotGasCost';

export async function updateBTCPrice(
    testEnv: TestEnv,
    btcPrice: string
) {
    const { keeper, btc, indexPriceFeed, oraclePriceFeed } = testEnv;
    let btcPriceFeed: MockPriceFeed;
    const priceFeedFactory = await ethers.getContractFactory('MockPriceFeed');
    const btcPriceFeedAddress = await oraclePriceFeed.priceFeeds(btc.address);
    btcPriceFeed = priceFeedFactory.attach(btcPriceFeedAddress);
    await waitForTx(
        await btcPriceFeed.connect(keeper.signer).setLatestAnswer(ethers.utils.parseUnits(btcPrice, 8)),
    );
    await waitForTx(await btcPriceFeed.setLatestAnswer(ethers.utils.parseUnits(btcPrice, 8)));
    await waitForTx(
        await indexPriceFeed
            .connect(keeper.signer)
            .setPrices(
                [btc.address],
                [ethers.utils.parseUnits(btcPrice, 30)],
                (await getBlockTimestamp()) + 100,
            ),
    );
}

export async function mintAndApprove(
    testEnv: TestEnv,
    token: Token,
    amount: BigNumber,
    account: SignerWithAddress,
    spender: string,
) {
    const { deployer } = testEnv;
    await token.connect(deployer.signer).mint(account.address, amount);
    await token.connect(account.signer).approve(spender, amount);
}

export async function increasePosition(
    testEnv: TestEnv,
    user: SignerWithAddress,
    pairIndex: number,
    collateral: BigNumber,
    openPrice: BigNumber,
    size: BigNumber,
    tradeType: TradeType,
    isLong: boolean,
) {
    const { keeper, router, executor, orderManager } = testEnv;

    const request: TradingTypes.IncreasePositionRequestStruct = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: tradeType,
        collateral: collateral,
        openPrice: openPrice,
        isLong: isLong,
        sizeAmount: size,
        tpPrice: 0,
        tp: 0,
        slPrice: 0,
        sl: 0,
    };

    if (tradeType == TradeType.MARKET) {
        // create increase order
        const orderId = await orderManager.ordersIndex();
        await router.connect(user.signer).createIncreaseOrder(request);
        // execute order
        await executor.connect(keeper.signer).executeIncreaseOrder(orderId, tradeType);

        return orderId;
    } else {
        // create increase order
        const orderId = await orderManager.ordersIndex()
        await router.connect(user.signer).createIncreaseOrder(request);
        // execute order
        await executor.connect(keeper.signer).executeIncreaseLimitOrders([orderId.toNumber()]);

        return orderId;
    }
}

export async function decreasePosition(
    testEnv: TestEnv,
    user: SignerWithAddress,
    pairIndex: number,
    collateral: BigNumber,
    size: BigNumber,
    tradeType: TradeType,
    isLong: boolean,
) {
    const { keeper, router, executor, orderManager } = testEnv;

    const request: TradingTypes.DecreasePositionRequestStruct = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: tradeType,
        collateral: collateral,
        triggerPrice: ethers.utils.parseUnits('30000', 30),
        isLong: isLong,
        sizeAmount: size,
    };

    // create increase order
    const orderId = await orderManager.ordersIndex();
    await router.connect(user.signer).createDecreaseOrder(request);
    // execute order
    await executor.connect(keeper.signer).executeDecreaseOrder(orderId, tradeType);
}
