import { MockERC20Token } from '../../types';
import { BigNumber, BigNumberish } from 'ethers';
import { SignerWithAddress, TestEnv } from './make-suite';
import hre, { ethers } from 'hardhat';
import { abiCoder, TradeType, waitForTx, ZERO_ADDRESS } from '../../helpers';
import { ContractReceipt } from '@ethersproject/contracts/src.ts';
import { TradingTypes } from '../../types/contracts/core/Router';
import { IExecution } from '../../types/contracts/core/Executor';

export async function updateBTCPrice(testEnv: TestEnv, btcPrice: string) {
    const { keeper, btc, indexPriceFeed, oraclePriceFeed } = testEnv;

    const updateData = await oraclePriceFeed.getUpdateData([btc.address], [ethers.utils.parseUnits(btcPrice, 8)]);
    const mockPyth = await ethers.getContractAt('MockPyth', await oraclePriceFeed.pyth());
    const fee = mockPyth.getUpdateFee(updateData);

    await waitForTx(
        await oraclePriceFeed
            .connect(keeper.signer)
            .updatePrice([btc.address], [abiCoder.encode(['uint256'], [ethers.utils.parseUnits(btcPrice, 8)])], {
                value: fee,
            }),
    );

    await waitForTx(
        await indexPriceFeed.connect(keeper.signer).updatePrice([btc.address], [ethers.utils.parseUnits(btcPrice, 30)]),
    );
}

export async function mintAndApprove(
    testEnv: TestEnv,
    token: MockERC20Token,
    amount: BigNumberish,
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
    openPrice: BigNumber | string,
    size: BigNumber | string,
    tradeType: TradeType,
    isLong: boolean,
) {
    const { keeper, router, executor, orderManager, indexPriceFeed, oraclePriceFeed, pool } = testEnv;

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

    const pair = await pool.getPair(pairIndex);

    let orderId;
    let receipt: ContractReceipt;
    if (tradeType == TradeType.MARKET) {
        // create increase order
        orderId = await orderManager.ordersIndex();
        await router.connect(user.signer).createIncreaseOrder(request);
        // execute order
        const tx = await executor
            .connect(keeper.signer)
            .setPricesAndExecuteIncreaseMarketOrders(
                [pair.indexToken],
                [indexPriceFeed.getPrice(pair.indexToken)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(pair.indexToken)).div('10000000000000000000000')],
                    ),
                ],
                [{ orderId: orderId, tier: 0, referralsRatio: 0, referralUserRatio: 0, referralOwner: ZERO_ADDRESS }],
                { value: 1 },
            );
        receipt = await tx.wait();
    } else {
        // create increase order
        orderId = await orderManager.ordersIndex();
        await router.connect(user.signer).createIncreaseOrder(request);
        // execute order
        const tx = await executor.connect(keeper.signer).setPricesAndExecuteIncreaseLimitOrders(
            [pair.indexToken],
            [indexPriceFeed.getPrice(pair.indexToken)],
            [
                new ethers.utils.AbiCoder().encode(
                    ['uint256'],
                    [(await oraclePriceFeed.getPrice(pair.indexToken)).div('10000000000000000000000')],
                ),
            ],
            [
                {
                    orderId: orderId.toNumber(),
                    tier: 0,
                    referralsRatio: 0,
                    referralUserRatio: 0,
                    referralOwner: ZERO_ADDRESS,
                },
            ],
            { value: 1 },
        );
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
    const { keeper, router, executor, orderManager, indexPriceFeed, oraclePriceFeed, pool } = testEnv;

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

    const pair = await pool.getPair(pairIndex);

    // create increase order
    const orderId = await orderManager.ordersIndex();
    await router.connect(user.signer).createDecreaseOrder(request);
    // execute order
    let receipt: ContractReceipt;
    if (tradeType == TradeType.MARKET) {
        const tx = await executor
            .connect(keeper.signer)
            .setPricesAndExecuteDecreaseMarketOrders(
                [pair.indexToken],
                [indexPriceFeed.getPrice(pair.indexToken)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(pair.indexToken)).div('10000000000000000000000')],
                    ),
                ],
                [{ orderId: orderId, tier: 0, referralsRatio: 0, referralUserRatio: 0, referralOwner: ZERO_ADDRESS }],
                { value: 1 },
            );
        receipt = await tx.wait();
    } else {
        const tx = await executor
            .connect(keeper.signer)
            .setPricesAndExecuteDecreaseLimitOrders(
                [pair.indexToken],
                [indexPriceFeed.getPrice(pair.indexToken)],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(pair.indexToken)).div('10000000000000000000000')],
                    ),
                ],
                [{ orderId: orderId, tier: 0, referralsRatio: 0, referralUserRatio: 0, referralOwner: ZERO_ADDRESS }],
                { value: 1 },
            );
        receipt = await tx.wait();
    }

    return { orderId: orderId, executeReceipt: receipt };
}

export async function adlPosition(
    testEnv: TestEnv,
    user: SignerWithAddress,
    pairIndex: number,
    collateral: BigNumber,
    size: BigNumber,
    triggerPrice: BigNumber,
    tradeType: TradeType,
    isLong: boolean,
    adlPositions: IExecution.ExecutePositionStruct[],
) {
    const { keeper, router, executor, btc, indexPriceFeed, oraclePriceFeed, orderManager } = testEnv;

    const request: TradingTypes.DecreasePositionRequestStruct = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: tradeType,
        collateral: collateral,
        triggerPrice: triggerPrice,
        isLong: isLong,
        sizeAmount: size,
        maxSlippage: 0,
    };

    // create increase order
    const orderId = await orderManager.ordersIndex();
    await router.connect(user.signer).createDecreaseOrder(request);
    const tx = await executor
        .connect(keeper.signer)
        .setPricesAndExecuteADL(
            [btc.address],
            [await indexPriceFeed.getPrice(btc.address)],
            [
                new ethers.utils.AbiCoder().encode(
                    ['uint256'],
                    [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                ),
            ],
            adlPositions,
            orderId,
            tradeType,
            0,
            0,
            0,
            ZERO_ADDRESS,
            { value: 1 },
        );
    const receipt = await tx.wait();

    return { orderId: orderId, executeReceipt: receipt };
}

export async function extraHash(hash: string, eventName: string, key: string): Promise<any> {
    const logs = (await hre.run('decode-event', { hash: hash })) as any;

    const event = logs.find((val: any) => val.name === eventName);
    return event?.events.find((val: any) => val.name === key)?.value as any;
}
