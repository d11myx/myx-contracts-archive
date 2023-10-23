import { newTestEnv, SignerWithAddress, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers, waffle } from 'hardhat';
import { decreasePosition, extraHash, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { BigNumber } from 'ethers';
import { encodePath, FeeAmount, getWETH, linkLibraries, sortedTokens, TradeType } from '../helpers';

import UniswapV3Factory from './mock/UniswapV3Factory.json';
import SwapRouter from './mock/SwapRouter.json';
import V3NFTDescriptor from './mock/V3NFTDescriptor.json';
import V3NonfungiblePositionManager from './mock/V3NonfungiblePositionManager.json';
import type { Contract, providers, Signer } from 'ethers';
import Decimal from 'decimal.js';
import { INonfungiblePositionManager, IUniswapV3Factory, IUniSwapV3Router } from '../types';
import { deployContract } from 'ethereum-waffle';

const v3Core = async (
    wallet: SignerWithAddress,
): Promise<{
    factory: IUniswapV3Factory;
    positionManager: INonfungiblePositionManager;
    swapRouter: IUniSwapV3Router;
}> => {
    const factory = (await waffle.deployContract(
        wallet.signer,
        {
            bytecode: UniswapV3Factory.bytecode,
            abi: UniswapV3Factory.abi,
        },
        [],
    )) as unknown as IUniswapV3Factory;

    let uniswapV3FactoryArtifact = (await deployContract(
        wallet.signer,
        {
            abi: UniswapV3Factory.abi,
            bytecode: UniswapV3Factory.bytecode,
        },
        [],
    )) as IUniswapV3Factory;

    const uniswapV3Factory = (
        (await ethers.getContractAt(UniswapV3Factory.abi, uniswapV3FactoryArtifact.address)) as Contract
    ).connect(wallet.signer);

    let NFTDescriptorArtifact = await deployContract(
        wallet.signer,
        {
            abi: V3NFTDescriptor.abi,
            bytecode: V3NFTDescriptor.bytecode,
        },
        [],
    );

    let weth = await getWETH();
    let positionManagerArtifact = await deployContract(
        wallet.signer,
        {
            abi: V3NonfungiblePositionManager.abi,
            bytecode: V3NonfungiblePositionManager.bytecode,
        },
        [uniswapV3FactoryArtifact.address, weth.address, NFTDescriptorArtifact.address],
    );

    const positionManager = (
        (await ethers.getContractAt(V3NonfungiblePositionManager.abi, positionManagerArtifact.address)) as Contract
    ).connect(wallet.signer) as INonfungiblePositionManager;
    const swapRouter = (await waffle.deployContract(
        wallet.signer,
        {
            bytecode: SwapRouter.bytecode,
            abi: SwapRouter.abi,
        },
        [factory.address, weth.address],
    )) as unknown as IUniSwapV3Router;

    return { factory, positionManager, swapRouter };
};

describe('Trade: profit & Loss', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before('add liquidity', async () => {
        testEnv = await newTestEnv();
        const {
            poolAdmin,
            users: [depositor],
            usdt,
            btc,
            pool,
            router,
            spotSwap,
        } = testEnv;

        // add liquidity
        const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
        const stableAmount = ethers.utils.parseUnits('30000000', await usdt.decimals());
        const pair = await pool.getPair(pairIndex);
        await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
        await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);
        let tokenAddresses = [btc.address, usdt.address];
        const { factory,positionManager, swapRouter } = await v3Core(poolAdmin);
        const [token0, token1] = sortedTokens(
            { address: poolTokens[0].address, decimal: await poolTokens[0].decimals() },
            { address: poolTokens[1].address, decimal: await poolTokens[1].decimals() }
        );

        await positionManager.createAndInitializePoolIfNecessary(
            token0.address,
            token1.address,
            params.fee,
            encodePriceSqrt(1, 1)
        );
        let fees = [FeeAmount.MEDIUM];
        await spotSwap.setSwapRouter(swapRouter.address);
        await spotSwap.updateTokenPath(btc.address, usdt.address, encodePath(tokenAddresses, fees));

        await router
            .connect(depositor.signer)
            .addLiquidity(pair.indexToken, pair.stableToken, indexAmount, stableAmount);
    });

    describe('user profit > 0', () => {
        it('price goes up, user profit > vault balance', async () => {
            const {
                users: [trader],
                usdt,
                btc,
                pool,
                router,
                positionManager,
            } = testEnv;

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPosition = await positionManager.getPosition(trader.address, pairIndex, true);

            const poolBalance = await usdt.balanceOf(pool.address);
            const positionBalance = await usdt.balanceOf(positionManager.address);

            const btcPrice = '50000';
            await updateBTCPrice(testEnv, btcPrice);

            const userPnl = BigNumber.from(btcPrice).sub('30000').mul(userPosition.positionAmount);

            // positionBalance < userPnl < poolBalance
            expect(userPnl).to.be.gt(positionBalance);
            expect(userPnl).to.be.lt(poolBalance);

            await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                BigNumber.from(0),
                size,
                TradeType.MARKET,
                true,
                ethers.utils.parseUnits(btcPrice, 30),
            );
        });

        it('user has profit, decrease position', async () => {
            const {
                users: [, trader],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            let btcPrice = '30000';
            await updateBTCPrice(testEnv, btcPrice);

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

            btcPrice = '50000';
            await updateBTCPrice(testEnv, btcPrice);

            const userPnl = BigNumber.from(btcPrice).sub('30000').mul(userPositionBefore.positionAmount);
            expect(userPnl).to.be.gt(0);

            const decreasingCollateral = BigNumber.from(0).sub(userPositionBefore.collateral.mul(99).div(100));
            const decreasingSize = userPositionBefore.positionAmount.mul(99).div(100);
            const { executeReceipt } = await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                decreasingCollateral,
                decreasingSize, // decrease 99%
                TradeType.MARKET,
                true,
                ethers.utils.parseUnits(btcPrice, 30),
            );
            const pnl = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'pnl');
            const tradingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'tradingFee');
            const fundingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'fundingFee');

            const userPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(userPositionAfter.positionAmount).to.be.eq(userPositionBefore.positionAmount.sub(decreasingSize));
            expect(userPositionAfter.collateral).to.be.eq(
                userPositionBefore.collateral
                    .add(pnl)
                    .sub(BigNumber.from(tradingFee).abs())
                    .add(BigNumber.from(fundingFee))
                    .sub(decreasingCollateral.abs()),
            );
        });
    });

    describe('user profit < 0', () => {
        it('user has loss, decrease position', async () => {
            const {
                users: [, , trader],
                usdt,
                btc,
                router,
                positionManager,
            } = testEnv;

            let btcPrice = '30000';
            await updateBTCPrice(testEnv, btcPrice);

            const collateral = ethers.utils.parseUnits('30000', await usdt.decimals());
            const size = ethers.utils.parseUnits('9', await btc.decimals());
            let openPrice = ethers.utils.parseUnits('30000', 30);

            await mintAndApprove(testEnv, usdt, collateral, trader, router.address);
            await increasePosition(testEnv, trader, pairIndex, collateral, openPrice, size, TradeType.MARKET, true);

            const userPositionBefore = await positionManager.getPosition(trader.address, pairIndex, true);

            btcPrice = '28000';
            await updateBTCPrice(testEnv, btcPrice);

            const userPnlBef = BigNumber.from(btcPrice).sub('30000').mul(userPositionBefore.positionAmount);
            expect(userPnlBef).to.be.lt(0);

            const riskBefore = new Decimal(9)
                .mul(new Decimal(30000))
                .mul(1)
                .div(100)
                .div(new Decimal(30000).add(new Decimal(userPnlBef.toString()).div(1e18)));
            expect(riskBefore.toString()).to.be.eq('0.225');

            let decreasingCollateral = BigNumber.from(0).sub(userPositionBefore.collateral.mul(99).div(100));
            let decreasingSize = userPositionBefore.positionAmount.mul(99).div(100);
            await expect(
                decreasePosition(
                    testEnv,
                    trader,
                    pairIndex,
                    decreasingCollateral,
                    decreasingSize, // decrease 99%
                    TradeType.MARKET,
                    true,
                    ethers.utils.parseUnits(btcPrice, 30),
                ),
            ).to.be.revertedWith('collateral not enough');

            decreasingSize = userPositionBefore.positionAmount.mul(99).div(100);
            const availableCollateral = userPositionBefore.collateral
                .add(userPnlBef)
                .sub(await positionManager.getTradingFee(pairIndex, true, decreasingSize.abs()));
            decreasingCollateral = BigNumber.from(0).sub(availableCollateral.mul(99).div(100));
            const { executeReceipt } = await decreasePosition(
                testEnv,
                trader,
                pairIndex,
                decreasingCollateral,
                decreasingSize, // decrease 99%
                TradeType.MARKET,
                true,
                ethers.utils.parseUnits(btcPrice, 30),
            );
            const pnl = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'pnl');
            const tradingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'tradingFee');
            const fundingFee = await extraHash(executeReceipt?.transactionHash, 'ExecuteDecreaseOrder', 'fundingFee');

            const userPositionAfter = await positionManager.getPosition(trader.address, pairIndex, true);

            expect(userPositionAfter.positionAmount).to.be.eq(userPositionBefore.positionAmount.sub(decreasingSize));
            expect(userPositionAfter.collateral).to.be.eq(
                userPositionBefore.collateral.add(pnl).sub(tradingFee).add(fundingFee).sub(decreasingCollateral.abs()),
            );

            const sizeAfter = new Decimal(userPositionAfter.positionAmount.toString()).div(1e18);
            const avgPriceAfter = new Decimal(userPositionAfter.averagePrice.toString()).div(1e30);
            const collateralAfter = new Decimal(userPositionAfter.collateral.toString()).div(1e18);
            const userPnlAft = BigNumber.from(btcPrice)
                .sub(avgPriceAfter.toString())
                .mul(userPositionAfter.positionAmount);

            const riskAfter = new Decimal(sizeAfter)
                .mul(new Decimal(avgPriceAfter))
                .mul(1)
                .div(100)
                .div(new Decimal(collateralAfter).add(new Decimal(userPnlAft.toString()).div(1e18)));
            expect(riskAfter.toFixed(2)).to.be.eq('0.23');
        });
    });
});
