import { ITradingRouter, Token } from '../../types';
import { BigNumber } from 'ethers';
import { SignerWithAddress, TestEnv } from './make-suite';
import { ethers } from 'hardhat';
import { TradeType } from '../../helpers';

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
    size: BigNumber,
    tradeType: TradeType,
    isLong: boolean,
) {
    const { keeper, tradingRouter, executeRouter } = testEnv;

    const request: ITradingRouter.IncreasePositionRequestStruct = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: tradeType,
        collateral: collateral,
        openPrice: ethers.utils.parseUnits('30000', 30),
        isLong: isLong,
        sizeAmount: size,
        tpPrice: 0,
        tp: 0,
        slPrice: 0,
        sl: 0,
    };

    // create increase order
    const orderId = await tradingRouter.increaseMarketOrdersIndex();
    await tradingRouter.connect(user.signer).createIncreaseOrder(request);
    // execute order
    await executeRouter.connect(keeper.signer).executeIncreaseOrder(orderId, tradeType);
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
    const { keeper, tradingRouter, executeRouter } = testEnv;

    const request: ITradingRouter.DecreasePositionRequestStruct = {
        account: user.address,
        pairIndex: pairIndex,
        tradeType: tradeType,
        collateral: collateral,
        triggerPrice: ethers.utils.parseUnits('30000', 30),
        isLong: isLong,
        sizeAmount: size,
    };

    // create increase order
    const orderId = await tradingRouter.decreaseMarketOrdersIndex();
    await tradingRouter.connect(user.signer).createDecreaseOrder(request);
    // execute order
    await executeRouter.connect(keeper.signer).executeDecreaseOrder(orderId, tradeType);
}
