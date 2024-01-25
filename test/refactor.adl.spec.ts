import { newTestEnv, SignerWithAddress, TestEnv } from './helpers/make-suite';
import hre, { ethers } from 'hardhat';
import { MAX_UINT_AMOUNT, TradeType, waitForTx, ZERO_ADDRESS } from '../helpers';
import { getUpdateData, increasePosition, mintAndApprove, updateBTCPrice } from './helpers/misc';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { pool } from '../types/contracts';

describe('Router: NetworkFee cases', () => {
    const pairIndex = 1;
    let testEnv: TestEnv;

    before(async () => {
        testEnv = await newTestEnv();
        const {
            btc,
            usdt,
            deployer,
            users: [depositor],
            router,
            pool,
            oraclePriceFeed,
        } = testEnv;

        await updateBTCPrice(testEnv, '30000');

        const btcAmount = ethers.utils.parseUnits('100', await btc.decimals());
        const usdtAmount = ethers.utils.parseUnits('3000000', await usdt.decimals());
        await waitForTx(await btc.connect(deployer.signer).mint(depositor.address, btcAmount));
        await waitForTx(await usdt.connect(deployer.signer).mint(depositor.address, usdtAmount));
        const pair = await pool.getPair(pairIndex);

        await btc.connect(depositor.signer).approve(router.address, MAX_UINT_AMOUNT);
        await usdt.connect(depositor.signer).approve(router.address, MAX_UINT_AMOUNT);
        await router
            .connect(depositor.signer)
            .addLiquidity(
                pair.indexToken,
                pair.stableToken,
                btcAmount,
                usdtAmount,
                [btc.address],
                [
                    new ethers.utils.AbiCoder().encode(
                        ['uint256'],
                        [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
                    ),
                ],
                { value: 1 },
            );
    });

    it('should ', async () => {
        const {
            btc,
            usdt,
            keeper,
            indexPriceFeed,
            pool,
            executor,
            positionManager,
            users: [longTrader, shortTrader, trader],
        } = testEnv;

        await updateBTCPrice(testEnv, '30000');

        let collateral = ethers.utils.parseUnits('50000', await usdt.decimals());
        let size = ethers.utils.parseUnits('10', await btc.decimals());
        let openPrice = ethers.utils.parseUnits('30000', 30);
        await openPosition(longTrader, true, collateral, size, openPrice);

        collateral = ethers.utils.parseUnits('50000', await usdt.decimals());
        size = ethers.utils.parseUnits('10', await btc.decimals());
        openPrice = ethers.utils.parseUnits('30000', 30);
        await openPosition(shortTrader, false, collateral, size, openPrice);

        // console.log(await positionManager.getPosition(longTrader.address, pairIndex, true));
        // console.log(await positionManager.getPosition(shortTrader.address, pairIndex, false));

        const positionKey = await positionManager.getPositionKey(longTrader.address, pairIndex, true);
        console.log(positionKey);

        await updateBTCPrice(testEnv, '300');

        const ret = await executor.connect(keeper.signer).setPricesAndLiquidatePositions(
            [btc.address],
            [await indexPriceFeed.getPrice(btc.address)],
            [
                {
                    token: btc.address,
                    updateData: await getUpdateData(testEnv, btc),
                    updateFee: 1,
                    backtrackRound: 0,
                    positionKey: positionKey,
                    sizeAmount: 0,
                    tier: 0,
                    referralsRatio: 0,
                    referralUserRatio: 0,
                    referralOwner: ZERO_ADDRESS,
                },
            ],
            { value: 1 },
        );
        await hre.run('decode-event', { hash: ret.hash, log: true });
    });

    async function openPosition(
        user: SignerWithAddress,
        isLong: boolean,
        collateral: BigNumber,
        size: BigNumber,
        openPrice: BigNumber,
    ) {
        const { router, usdt, positionManager } = testEnv;

        await mintAndApprove(testEnv, usdt, collateral, user, router.address);
        await increasePosition(testEnv, user, pairIndex, collateral, openPrice, size, TradeType.MARKET, isLong);
        const position = await positionManager.getPosition(user.address, pairIndex, isLong);
        expect(position.positionAmount).to.be.eq(size);
    }
});
