import { Token } from '../../types';
import { BigNumber } from 'ethers';
import { SignerWithAddress, TestEnv } from './make-suite';
import hre, { ethers } from 'hardhat';
import { TradeType, waitForTx } from '../../helpers';
import { ContractReceipt } from '@ethersproject/contracts/src.ts';
import { TradingTypes } from '../../types/contracts/core/Router';

export async function updateBTCPrice(testEnv: TestEnv, btcPrice: string) {
    const { keeper, btc, indexPriceFeed, oraclePriceFeed } = testEnv;

    const updateData = await oraclePriceFeed.getUpdateData([btc.address], [ethers.utils.parseUnits(btcPrice, 8)]);
    const mockPyth = await ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());
    const fee = mockPyth.getUpdateFee(updateData);
    await waitForTx(
        await oraclePriceFeed
            .connect(keeper.signer)
            .updatePrice([btc.address], [ethers.utils.parseUnits(btcPrice, 8)], { value: fee }),
    );

    await waitForTx(
        await indexPriceFeed.connect(keeper.signer).updatePrice([btc.address], [ethers.utils.parseUnits(btcPrice, 8)]),
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
    collateral: BigNumber | string,
    openPrice: BigNumber,
    size: BigNumber,
    tradeType: TradeType,
    isLong: boolean,
) {
    const { keeper, router, executionLogic, orderManager } = testEnv;

    const request: TradingTypes.IncreasePositionRequestStruct = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: tradeType,
        collateral: collateral,
        openPrice: openPrice,
        isLong: isLong,
        sizeAmount: size,
        maxSlippage: 0,
    };

    let orderId;
    let receipt: ContractReceipt;
    if (tradeType == TradeType.MARKET) {
        // create increase order
        orderId = await orderManager.ordersIndex();
        await router.connect(user.signer).createIncreaseOrderWithoutTpSl(request);
        // execute order
        const tx = await executionLogic.connect(keeper.signer).executeIncreaseOrder(orderId, tradeType, 0, 0);
        receipt = await tx.wait();
    } else {
        // create increase order
        orderId = await orderManager.ordersIndex();
        await router.connect(user.signer).createIncreaseOrderWithoutTpSl(request);
        // execute order
        const tx = await executionLogic
            .connect(keeper.signer)
            .executeIncreaseLimitOrders([{ orderId: orderId.toNumber(), level: 0, commissionRatio: 0 }]);
        receipt = await tx.wait();
    }
    return { orderId: orderId, executeReceipt: receipt };
}

export async function decreasePosition(
    testEnv: TestEnv,
    user: SignerWithAddress,
    pairIndex: number,
    collateral: BigNumber,
    size: BigNumber,
    tradeType: TradeType,
    isLong: boolean,
    openPrice?: BigNumber,
) {
    const { keeper, router, executionLogic, orderManager } = testEnv;

    if (!openPrice) {
        openPrice = ethers.utils.parseUnits('30000', 30);
    }
    const request: TradingTypes.DecreasePositionRequestStruct = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: tradeType,
        collateral: collateral,
        triggerPrice: openPrice,
        isLong: isLong,
        sizeAmount: size,
        maxSlippage: 0,
    };

    // create increase order
    const orderId = await orderManager.ordersIndex();
    await router.connect(user.signer).createDecreaseOrder(request);
    // execute order
    const tx = await executionLogic
        .connect(keeper.signer)
        .executeDecreaseOrder(orderId, tradeType, 0, 0, false, 0, tradeType == TradeType.MARKET);
    const receipt = await tx.wait();

    return { orderId: orderId, executeReceipt: receipt };
}

export async function extraHash(hash: string, eventName: string, key: string): Promise<any> {
    const events = (await hre.run('decode-event', { hash: hash })) as any;

    const DistributeTradingFeeEvent = events.find((val: any) => val.name === eventName);
    return DistributeTradingFeeEvent?.events.find((val: any) => val.name === key)?.value as any;
}
