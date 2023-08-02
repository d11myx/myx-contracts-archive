import { Token } from '../../types';
import { BigNumber } from 'ethers';
import { SignerWithAddress, TestEnv } from './make-suite';
import { ethers } from 'hardhat';
import { TradeType } from '../../helpers';
import { TradingTypes } from '../../types/contracts/trading/Router';

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
    const { keeper, router, executor } = testEnv;

    const request: TradingTypes.IncreasePositionRequestStruct = {
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
    const orderId = await router.increaseMarketOrdersIndex();
    await router.connect(user.signer).createIncreaseOrder(request);
    // execute order
    await executor.connect(keeper.signer).executeIncreaseOrder(orderId, tradeType);
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
    const { keeper, router, executor } = testEnv;

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
    const orderId = await router.decreaseMarketOrdersIndex();
    await router.connect(user.signer).createDecreaseOrder(request);
    // execute order
    await executor.connect(keeper.signer).executeDecreaseOrder(orderId, tradeType);
}
