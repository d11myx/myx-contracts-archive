import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import hre, { ethers } from 'hardhat';
import { mintAndApprove } from './helpers/misc';
import { BigNumber } from 'ethers';
import { getMockToken, ZERO_ADDRESS } from '../helpers';
import { TestAmmUtils, AmountMath } from '../types';
import Decimal from 'decimal.js';
import { convertIndexAmount, convertIndexAmountToStable, convertStableAmountToIndex } from '../helpers/token-decimals';

describe('lp-mlp: Test cases', () => {
    const pairIndex = 1;
    const _1e30 = '1000000000000000000000000000000';
    let amm: TestAmmUtils;
    let testEnv: TestEnv;

    async function refreshEnv() {
        testEnv = await newTestEnv();
    }

    before(async () => {
        testEnv = await newTestEnv();
        const contractFactory = await ethers.getContractFactory('TestAmmUtils');
        amm = await contractFactory.deploy();
    });

    describe('Liquidity operation of pool', () => {
        describe('Liquidity of Common Token', () => {
            it('should add common liquidity success', async () => {
                await refreshEnv();
                const {
                    router,
                    users: [depositor],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    oraclePriceFeed,
                } = testEnv;

                const indexPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const lpPrice = await poolView.lpFairPrice(1, await oraclePriceFeed.getPrice(btc.address));
                // console.log(pairPrice);

                // value 1:100
                const addIndexAmount = ethers.utils.parseUnits('1', await btc.decimals()); // per 30000U
                const addStableAmount = ethers.utils.parseUnits('30000', await usdt.decimals()); // per 1U
                const pair = await pool.getPair(pairIndex);
                // mint test coin
                await mintAndApprove(testEnv, btc, addIndexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, addStableAmount, depositor, router.address);

                const lpAmountStrut = await poolView.getMintLpAmount(
                    pairIndex,
                    addIndexAmount,
                    addStableAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                // console.log(lpAmountStrut.mintAmount);

                await router.connect(depositor.signer).addLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    addIndexAmount,
                    addStableAmount,
                    [btc.address], // the token need update price
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [ethers.utils.parseUnits(indexPrice.toString(), 8)],
                        ),
                    ], // update data(price)
                    { value: 1 },
                );

                // common token transfer check
                expect(await btc.balanceOf(depositor.address)).to.be.eq(ethers.utils.parseUnits('0'));
                expect(await usdt.balanceOf(depositor.address)).to.be.eq(ethers.utils.parseUnits('0'));
                expect(await btc.balanceOf(pool.address)).to.be.eq(addIndexAmount);
                expect(await usdt.balanceOf(pool.address)).to.be.eq(addStableAmount);

                // lp token transfer check
                const lpToken = await getMockToken('', pair.pairToken);
                // console.log(ethers.utils.formatUnits(await lpToken.balanceOf(depositor.address)));
                expect(await lpToken.balanceOf(depositor.address)).to.be.eq(lpAmountStrut.mintAmount);

                // pool states check value = 1:100
                const poolVault = await pool.getVault(pairIndex);
                expect(poolVault.indexTotalAmount.mul(indexPrice)).to.be.eq(
                    await convertStableAmountToIndex(btc, usdt, poolVault.stableTotalAmount),
                );

                // fee check
                const btcFee = await pool.feeTokenAmounts(btc.address);
                const stableFee = await pool.feeTokenAmounts(usdt.address);
                const feeRate = pair.addLpFeeP;

                expect(btcFee).to.be.eq(addIndexAmount.mul(feeRate).div(1e8));
                expect(stableFee).to.be.eq(addStableAmount.mul(feeRate).div(1e8));

                // total amount check
                expect(addIndexAmount).to.be.eq(poolVault.indexTotalAmount.add(btcFee));
                expect(addStableAmount).to.be.eq(poolVault.stableTotalAmount.add(stableFee));
            });

            it('should remove common liquidity success', async () => {
                const {
                    router,
                    users: [depositor],
                    usdt,
                    btc,
                    pairTokens,
                    pool,
                    poolView,
                    oraclePriceFeed,
                } = testEnv;

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmount = await lpToken.balanceOf(depositor.address);

                const indexPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                await lpToken.connect(depositor.signer).approve(router.address, lpAmount);

                const receivedAmounts = await poolView.getReceivedAmount(
                    pairIndex,
                    lpAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                const btcAmountBefore = await btc.balanceOf(depositor.address);
                const usdtAmountBefore = await usdt.balanceOf(depositor.address);

                const btcFeeBefore = await pool.feeTokenAmounts(btc.address);
                const stableFeeBefore = await pool.feeTokenAmounts(usdt.address);
                const lpPrice = await poolView.lpFairPrice(pairIndex, indexPrice);

                await router.connect(depositor.signer).removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    await lpToken.balanceOf(depositor.address),
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [ethers.utils.parseUnits(indexPrice.toString(), 8)],
                        ),
                    ], // update data(price)
                    { value: 1 },
                );

                // received amount check
                expect(receivedAmounts.receiveIndexTokenAmount).to.be.eq(
                    btcAmountBefore.add(await btc.balanceOf(depositor.address)),
                );
                expect(receivedAmounts.receiveStableTokenAmount).to.be.eq(
                    usdtAmountBefore.add(await usdt.balanceOf(depositor.address)),
                );

                // pool resever asset(fee) check
                const btcFee = await pool.feeTokenAmounts(btc.address);
                const stableFee = await pool.feeTokenAmounts(usdt.address);

                expect(btcFee).to.be.eq(receivedAmounts.feeIndexTokenAmount.add(btcFeeBefore));

                expect(stableFee).to.be.eq(receivedAmounts.feeStableTokenAmount.add(stableFeeBefore));
            });
        });

        describe('Liquidity of ETH', () => {
            it('should add eth liquidity success', async () => {
                await refreshEnv();
                const pairIndex2 = 2;
                const {
                    router,
                    users: [depositor],
                    usdt,
                    eth,
                    pool,
                    poolView,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30).replace('.0', ''),
                );

                expect(await poolView.lpFairPrice(pairIndex2, await oraclePriceFeed.getPrice(eth.address))).to.be.eq(
                    ethers.utils.parseUnits('1000000000000'),
                );

                const pair = await pool.getPair(pairIndex2);
                const addIndexAmount = ethers.utils.parseUnits('1', await eth.decimals()); // 2000
                const addStableAmount = ethers.utils.parseUnits('2000', await usdt.decimals()); // 1
                const sendEth = ethers.utils.parseUnits('1000000000000000001', 'wei');

                await eth.connect(depositor.signer).approve(router.address, addIndexAmount);
                await mintAndApprove(testEnv, usdt, addStableAmount, depositor, router.address);

                const lpToken = await getMockToken('', pair.pairToken);
                const mintAmounts = await poolView.getMintLpAmount(
                    pairIndex2,
                    addIndexAmount,
                    addStableAmount,
                    await oraclePriceFeed.getPrice(eth.address),
                );

                // console.log(await eth.balanceOf(depositor.address))

                await router
                    .connect(depositor.signer)
                    .addLiquidityETH(
                        pair.indexToken,
                        pair.stableToken,
                        addIndexAmount,
                        addStableAmount,
                        [eth.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        1,
                        { value: sendEth },
                    );

                // erc20 token check
                expect(await eth.balanceOf(depositor.address)).to.be.eq(0);
                expect(await usdt.balanceOf(depositor.address)).to.be.eq(0);
                expect(await eth.balanceOf(pool.address)).to.be.eq(addIndexAmount);
                expect(await usdt.balanceOf(pool.address)).to.be.eq(addStableAmount);

                // lp token check
                expect(await lpToken.balanceOf(depositor.address)).to.be.eq(mintAmounts.mintAmount);
            });

            it('should remove eth liquidity success', async () => {
                const pairIndex2 = 2;
                const {
                    router,
                    users: [depositor],
                    usdt,
                    eth,
                    pool,
                    poolView,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30).replace('.0', ''),
                );

                const pair = await pool.getPair(pairIndex2);

                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmount = await lpToken.balanceOf(depositor.address);
                await lpToken.connect(depositor.signer).approve(router.address, lpAmount);
                const ethAmountBefore = await depositor.signer.getBalance();

                const receivedAmounts = await poolView.getReceivedAmount(
                    pairIndex2,
                    lpAmount,
                    await oraclePriceFeed.getPrice(eth.address),
                );

                await router
                    .connect(depositor.signer)
                    .removeLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        lpAmount,
                        true,
                        [eth.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                // receive token check
                expect(await eth.balanceOf(depositor.address)).to.be.eq(0);
                expect(await usdt.balanceOf(depositor.address)).to.be.eq(receivedAmounts.receiveStableTokenAmount);
                expect(receivedAmounts.receiveIndexTokenAmount).to.be.gt(
                    (await depositor.signer.getBalance()).sub(ethAmountBefore),
                );

                // lp token check
                expect(await lpToken.balanceOf(depositor.address)).to.be.eq(0);
            });
        });

        describe('Liquidity for another account', () => {
            it('should add liquidity for account success', async () => {
                await refreshEnv();

                const {
                    router,
                    users: [depositor, receiver],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const pair = await pool.getPair(pairIndex);
                const addIndexAmount = ethers.utils.parseUnits('1', await btc.decimals()); // per 30000
                const addStableAmount = ethers.utils.parseUnits('30000', await usdt.decimals()); // per 1

                await mintAndApprove(testEnv, btc, addIndexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, addStableAmount, depositor, router.address);

                const lpToken = await getMockToken('', pair.pairToken);
                const receiverBefore = await lpToken.balanceOf(receiver.address);

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    addIndexAmount,
                    addStableAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                await router
                    .connect(depositor.signer)
                    .addLiquidityForAccount(
                        pair.indexToken,
                        pair.stableToken,
                        receiver.address,
                        addIndexAmount,
                        addStableAmount,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                // lpToken check
                expect(await lpToken.balanceOf(depositor.address)).to.be.eq(0);
                expect(await lpToken.balanceOf(receiver.address)).to.be.eq(receiverBefore.add(lpAmounts.mintAmount));
            });

            it('should remove liquidity for account success', async () => {
                const {
                    router,
                    users: [depositor, receiver],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);

                const lpAmount = await lpToken.balanceOf(receiver.address);
                await lpToken.connect(receiver.signer).approve(router.address, lpAmount);

                const receiveAmounts = await poolView.getReceivedAmount(
                    pairIndex,
                    lpAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                const indexTokenBefore = await btc.balanceOf(depositor.address);
                const stableTokenBefore = await usdt.balanceOf(depositor.address);

                await router
                    .connect(receiver.signer)
                    .removeLiquidityForAccount(
                        pair.indexToken,
                        pair.stableToken,
                        depositor.address,
                        lpAmount,
                        false,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                // lp token check
                expect(await lpToken.balanceOf(receiver.address)).to.be.eq(0);

                // receive token check
                expect(receiveAmounts.receiveIndexTokenAmount).to.be.eq(
                    (await btc.balanceOf(depositor.address)).sub(indexTokenBefore),
                );
                expect(receiveAmounts.receiveStableTokenAmount).to.be.eq(
                    (await usdt.balanceOf(depositor.address)).sub(stableTokenBefore),
                );
            });
        });
    });

    describe('MLP bug or sell', () => {
        describe('MLP Operation in balanced', () => {
            // pre-operation: add liquidity with balance
            before(async () => {
                const {
                    users: [depositor],
                    btc,
                    usdt,
                    pool,
                    poolView,
                    router,
                } = testEnv;
                // add liquidity
                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                await router
                    .connect(depositor.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        stableAmount,
                        [btc.address],
                        [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                        { value: 1 },
                    );
            });

            it('Use btc to buy MLP when the pool is balanced', async () => {
                const {
                    users: [, depositor2],
                    btc,
                    pool,
                    poolView,
                    router,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor2, router.address);

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    indexAmount,
                    0,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmountBefore = await lpToken.balanceOf(depositor2.address);

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        0,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor2.address)).sub(lpAmountBefore),
                );
            });

            it('sell MLP when the pool is unbalanced, btc > usdt', async () => {
                const {
                    users: [, depositor2],
                    btc,
                    usdt,
                    pool,
                    poolView,
                    router,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmount = await lpToken.balanceOf(depositor2.address);

                const btcAmountBefore = await btc.balanceOf(depositor2.address);
                await lpToken.connect(depositor2.signer).approve(router.address, lpAmount);
                const receiveAmounts = await poolView.getReceivedAmount(
                    pairIndex,
                    lpAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                await router
                    .connect(depositor2.signer)
                    .removeLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        lpAmount,
                        false,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                expect(receiveAmounts.receiveStableTokenAmount).to.be.eq(0);
                expect(receiveAmounts.receiveIndexTokenAmount).to.be.eq(
                    (await btc.balanceOf(depositor2.address)).sub(btcAmountBefore),
                );

                const poolVault = await pool.getVault(pairIndex);
                expect(poolVault.stableTotalAmount).to.be.eq(
                    (await convertIndexAmountToStable(btc, usdt, poolVault.indexTotalAmount)).mul(pairPrice),
                ); // the pool is balance again
            });

            it('Use usdt to buy MLP when the pool is balanced', async () => {
                const {
                    users: [, depositor2],
                    btc,
                    usdt,
                    pool,
                    poolView,
                    router,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                const addStableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                await mintAndApprove(testEnv, usdt, addStableAmount, depositor2, router.address);

                const lpAmountBefore = await lpToken.balanceOf(depositor2.address);
                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    0,
                    addStableAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        0,
                        addStableAmount,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor2.address)).sub(lpAmountBefore),
                );
            });

            it('sell MLP when the pool is unbalanced, btc < usdt', async () => {
                const {
                    users: [, depositor2],
                    btc,
                    usdt,
                    pool,
                    poolView,
                    router,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmount = await lpToken.balanceOf(depositor2.address);

                const usdtAmountBefore = await usdt.balanceOf(depositor2.address);
                await lpToken.connect(depositor2.signer).approve(router.address, lpAmount);
                const receiveAmounts = await poolView.getReceivedAmount(
                    pairIndex,
                    lpAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                await router
                    .connect(depositor2.signer)
                    .removeLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        lpAmount,
                        false,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                expect(receiveAmounts.receiveIndexTokenAmount).to.be.eq(0);
                expect(receiveAmounts.receiveStableTokenAmount).to.be.eq(
                    (await usdt.balanceOf(depositor2.address)).sub(usdtAmountBefore),
                );

                const poolVault = await pool.getVault(pairIndex);
                expect(await convertIndexAmountToStable(btc, usdt, poolVault.indexTotalAmount)).to.be.eq(
                    await convertIndexAmountToStable(
                        btc,
                        usdt,
                        (await convertStableAmountToIndex(btc, usdt, poolVault.stableTotalAmount)).div(pairPrice),
                    ),
                ); // the pool is balance again
            });

            it('Use usdt, btc to buy MLP when the pool is balanced, btc = usdt', async () => {
                const {
                    users: [, depositor2],
                    btc,
                    usdt,
                    pool,
                    poolView,
                    router,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                // add liquidity
                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor2, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor2, router.address);

                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmountBefore = await lpToken.balanceOf(depositor2.address);

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    indexAmount,
                    stableAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        stableAmount,
                        [btc.address],
                        [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                        { value: 1 },
                    );

                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor2.address)).sub(lpAmountBefore),
                );

                const poolVault = await pool.getVault(pairIndex);
                expect(await convertIndexAmountToStable(btc, usdt, poolVault.indexTotalAmount)).to.be.eq(
                    await convertIndexAmountToStable(
                        btc,
                        usdt,
                        (await convertStableAmountToIndex(btc, usdt, poolVault.stableTotalAmount)).div(pairPrice),
                    ),
                ); // the pool is balance again
            });
        });

        describe('MLP Operation in unbalanced', () => {
            // pre-operation: add liquidity with unbalance
            before(async () => {
                const {
                    users: [depositor, depositor2],
                    btc,
                    usdt,
                    pool,
                    router,
                } = testEnv;
                // add liquidity init
                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                await router
                    .connect(depositor.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        stableAmount,
                        [btc.address],
                        [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                        { value: 1 },
                    );

                // add liquidity make unbalanced
                const indexAmount2 = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount2 = ethers.utils.parseUnits('50000000', await usdt.decimals());
                await mintAndApprove(testEnv, btc, indexAmount2, depositor2, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount2, depositor2, router.address);

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount2,
                        stableAmount2,
                        [btc.address],
                        [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                        { value: 1 },
                    );
            });

            it('Use btc to buy MLP when the pool is unbalanced', async () => {
                const {
                    users: [, , depositor3],
                    btc,
                    pool,
                    poolView,
                    router,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor3, router.address);

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    indexAmount,
                    0,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmountBefore = await lpToken.balanceOf(depositor3.address);

                await router
                    .connect(depositor3.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        0,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor3.address)).sub(lpAmountBefore),
                );
                await lpToken
                    .connect(depositor3.signer)
                    .approve(router.address, await lpToken.balanceOf(depositor3.address));
                // console.log(await lpToken.balanceOf(depositor3.address))

                await router
                    .connect(depositor3.signer)
                    .removeLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        await lpToken.balanceOf(depositor3.address),
                        false,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );
                // console.log(await lpToken.balanceOf(depositor3.address))
            });

            it('Use usdt to buy MLP when the pool is unbalanced', async () => {
                const {
                    users: [, , depositor3],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    router,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor3, router.address);

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    0,
                    stableAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmountBefore = await lpToken.balanceOf(depositor3.address);

                await router
                    .connect(depositor3.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        0,
                        stableAmount,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor3.address)).sub(lpAmountBefore),
                );

                await lpToken
                    .connect(depositor3.signer)
                    .approve(router.address, await lpToken.balanceOf(depositor3.address));
                // console.log(await lpToken.balanceOf(depositor3.address))

                await router
                    .connect(depositor3.signer)
                    .removeLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        await lpToken.balanceOf(depositor3.address),
                        false,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );
                // console.log(await lpToken.balanceOf(depositor3.address))
            });

            it('Use usdt, btc to buy MLP when the pool is unbalanced', async () => {
                const {
                    users: [, , depositor3],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    router,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor3, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor3, router.address);

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    indexAmount,
                    stableAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmountBefore = await lpToken.balanceOf(depositor3.address);

                await router
                    .connect(depositor3.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        stableAmount,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );
                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor3.address)).sub(lpAmountBefore),
                );
                // console.log(await lpToken.balanceOf(depositor3.address))
            });
        });
    });

    describe('Liquidity Fee And Slippage', async () => {
        describe('Check Fee And Slippage in balanced', () => {
            // pre-operation: add liquidity with balance
            beforeEach(async () => {
                await refreshEnv();
                const {
                    users: [depositor],
                    btc,
                    usdt,
                    pool,
                    router,
                } = testEnv;
                // add liquidity
                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                // const lpToken = await getMockToken('', (await pool.getPair(pairIndex)).pairToken);
                // console.log(await btc.balanceOf(pool.address))

                await router
                    .connect(depositor.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        stableAmount,
                        [btc.address],
                        [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                        { value: 1 },
                    );
                // console.log(new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)]))
            });

            it('Only use btc add liquidity', async () => {
                const {
                    router,
                    users: [, depositor2],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                await mintAndApprove(testEnv, btc, indexAmount, depositor2, router.address);

                // const mathMethod: any = pair.kOfSwap.mul(_1e30).div(await oraclePriceFeed.getPrice(btc.address));
                // const reserveADec = new Decimal(Math.sqrt(mathMethod));
                // const reserveBDec = (new Decimal(pair.kOfSwap.toString())).div(reserveADec);

                // const reserveA = BigNumber.from(reserveADec.toFixed(0));
                // const reserveB = BigNumber.from(reserveBDec.toFixed(0));

                const reserveAmount = await amm.getReserve(
                    pair.kOfSwap,
                    await oraclePriceFeed.getPrice(btc.address),
                    _1e30,
                );
                // console.log(reserveA, reserveB)
                // console.log(reserveAmount.reserveA, reserveAmount.reserveB)

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    indexAmount,
                    0,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                const afterFeeIndexAmount = indexAmount.sub(lpAmounts.indexFeeAmount);
                // const afterFeeStableAmount = stableAmount.sub(lpAmounts.stableFeeAmount);

                const poolVault = await pool.getVault(pairIndex);
                const indexProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.indexToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let indexTotalAmount: any;
                if (indexProfit.lt(0)) {
                    indexTotalAmount =
                        poolVault.indexTotalAmount > indexProfit.abs()
                            ? poolVault.indexTotalAmount.sub(indexProfit.abs())
                            : 0;
                } else {
                    indexTotalAmount = poolVault.indexTotalAmount.add(indexProfit.abs());
                }
                // console.log(indexProfit)

                const stableProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.stableToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let stableTotalAmount: any;
                if (stableProfit.lt(0)) {
                    stableTotalAmount =
                        poolVault.stableTotalAmount > stableProfit.abs()
                            ? poolVault.indexTotalAmount.sub(stableProfit.abs())
                            : 0;
                } else {
                    stableTotalAmount = poolVault.stableTotalAmount.add(stableProfit.abs());
                }
                // console.log(stableProfit)

                const indexTotalDeltaWad = (await convertIndexAmount(btc, indexTotalAmount, 18)).mul(pairPrice);
                const stableTotalDeltaWad = await convertIndexAmount(usdt, stableTotalAmount, 18);

                const indexDepositDeltaWad = (await convertIndexAmount(btc, afterFeeIndexAmount, 18)).mul(pairPrice);
                const stableDepositDeltaWad = await convertIndexAmount(usdt, BigNumber.from('0'), 18);

                const totalIndexTotalDeltaWad = indexTotalDeltaWad.add(indexDepositDeltaWad);
                const totalStableTotalDeltaWad = stableTotalDeltaWad.add(stableDepositDeltaWad);

                // console.log(totalIndexTotalDeltaWad)
                // console.log(totalStableTotalDeltaWad)

                const totalDelta = totalIndexTotalDeltaWad.add(totalStableTotalDeltaWad);
                const expectIndexDeltaWad = totalDelta.mul(pair.expectIndexTokenP).div(1e8);
                const expectStbleDeltaWad = totalDelta.sub(expectIndexDeltaWad);

                // console.log(totalDelta)
                // console.log(expectIndexDeltaWad)
                // console.log(totalDelta, totalIndexTotalDeltaWad, totalStableTotalDeltaWad);

                // get discount
                // const ratio = indexTotalDelta.div(totalDelta);
                // const expectP = pair.expectIndexTokenP;
                // const unbalanceP = ratio.div(expectP).sub(1e8)
                // let rate;
                // let amount;
                // if (unbalanceP.lt(0) && unbalanceP.abs().gt(pair.maxUnbalancedP)) {
                //     rate = pair.unbalancedDiscountRate;
                //     amount = expectIndexDelta.sub(indexTotalDelta);
                // }

                const needSawpInIndexDelta = totalIndexTotalDeltaWad.sub(expectIndexDeltaWad);
                const swapIndexDeltaWad = indexDepositDeltaWad.lt(needSawpInIndexDelta)
                    ? indexDepositDeltaWad
                    : needSawpInIndexDelta;

                // console.log(needSawpInIndexDelta, totalIndexTotalDeltaWad, expectIndexDeltaWad)
                // console.log(swapIndexDeltaWad, indexDepositDeltaWad, needSawpInIndexDelta)

                const amountIn = BigNumber.from(
                    new Decimal(swapIndexDeltaWad.toString())
                        .mul(1e30)
                        .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                        .toFixed(0),
                );

                const totalAmountIn = amountIn.add(reserveAmount.reserveA);
                const swapAmountOut = amountIn.mul(reserveAmount.reserveB).div(totalAmountIn);

                const slipDeltaWad: BigNumber = swapIndexDeltaWad.sub(swapAmountOut);

                // console.log(slipDeltaWad)

                const slipAmount = BigNumber.from(
                    new Decimal(slipDeltaWad.toString())
                        .mul(1e30)
                        .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                        .div(10 ** (18 - (await btc.decimals())))
                        .floor()
                        .toString(),
                );

                // console.log('slipAmount   : ' + slipAmount)
                // console.log('actslipAmount: ' + lpAmounts.slipAmount)

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        0,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                // check Fee Amount
                expect(lpAmounts.indexFeeAmount).to.be.eq(indexAmount.mul(pair.addLpFeeP).div(10 ** 8));

                expect(lpAmounts.slipAmount.add(lpAmounts.indexFeeAmount)).to.be.eq(
                    indexAmount.sub(lpAmounts.afterFeeIndexAmount),
                );

                // check slippage
                expect(lpAmounts.slipToken).to.be.eq(btc.address);
                expect(lpAmounts.slipAmount).to.be.eq(slipAmount);

                // check Lp Amount
                expect(lpAmounts.mintAmount).to.be.eq(await lpToken.balanceOf(depositor2.address));
            });

            it('Only usd usdt add liquidity', async () => {
                const {
                    router,
                    users: [, depositor2],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );
                const stableAmount = ethers.utils.parseUnits('1000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor2, router.address);

                // const mathMethod: any = pair.kOfSwap.mul(_1e30).div(await oraclePriceFeed.getPrice(btc.address));
                // const reserveADec = new Decimal(Math.sqrt(mathMethod));
                // const reserveBDec = (new Decimal(pair.kOfSwap.toString())).div(reserveADec);

                // const reserveA = BigNumber.from(reserveADec.toFixed(0));
                // const reserveB = BigNumber.from(reserveBDec.toFixed(0));

                const reserveAmount = await amm.getReserve(
                    pair.kOfSwap,
                    await oraclePriceFeed.getPrice(btc.address),
                    _1e30,
                );
                // console.log(reserveA, reserveB)
                // console.log(reserveAmount.reserveA, reserveAmount.reserveB)

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    0,
                    stableAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                // const afterFeeIndexAmount = indexAmount.sub(lpAmounts.indexFeeAmount);
                const afterFeeStableAmount = stableAmount.sub(lpAmounts.stableFeeAmount);
                // console.log(afterFeeStableAmount)

                const poolVault = await pool.getVault(pairIndex);
                const indexProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.indexToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let indexTotalAmount: any;
                if (indexProfit.lt(0)) {
                    indexTotalAmount =
                        poolVault.indexTotalAmount > indexProfit.abs()
                            ? poolVault.indexTotalAmount.sub(indexProfit.abs())
                            : 0;
                } else {
                    indexTotalAmount = poolVault.indexTotalAmount.add(indexProfit.abs());
                }
                // console.log(indexProfit)

                const stableProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.stableToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let stableTotalAmount: any;
                if (stableProfit.lt(0)) {
                    stableTotalAmount =
                        poolVault.stableTotalAmount > stableProfit.abs()
                            ? poolVault.stableTotalAmount.sub(stableProfit.abs())
                            : 0;
                } else {
                    stableTotalAmount = poolVault.stableTotalAmount.add(stableProfit.abs());
                }
                // console.log(stableProfit)

                const indexTotalDeltaWad = (await convertIndexAmount(btc, indexTotalAmount, 18)).mul(pairPrice);
                const stableTotalDeltaWad = await convertIndexAmount(usdt, stableTotalAmount, 18);

                const indexDepositDeltaWad = (await convertIndexAmount(btc, BigNumber.from('0'), 18)).mul(pairPrice);
                const stableDepositDeltaWad = await convertIndexAmount(usdt, afterFeeStableAmount, 18);

                const totalIndexTotalDeltaWad = indexTotalDeltaWad.add(indexDepositDeltaWad);
                const totalStableTotalDeltaWad = stableTotalDeltaWad.add(stableDepositDeltaWad);

                // console.log(totalIndexTotalDeltaWad)
                // console.log(totalStableTotalDeltaWad)

                const totalDelta = totalIndexTotalDeltaWad.add(totalStableTotalDeltaWad);
                const expectIndexDeltaWad = totalDelta.mul(pair.expectIndexTokenP).div(1e8);
                const expectStbleDeltaWad = totalDelta.sub(expectIndexDeltaWad);

                // console.log(totalDelta)
                // console.log(expectIndexDeltaWad)
                // console.log(expectStbleDeltaWad)
                // console.log(totalDelta, totalIndexTotalDeltaWad, totalStableTotalDeltaWad);

                // get discount
                // const ratio = indexTotalDelta.div(totalDelta);
                // const expectP = pair.expectIndexTokenP;
                // const unbalanceP = ratio.div(expectP).sub(1e8)
                // let rate;
                // let amount;
                // if (unbalanceP.lt(0) && unbalanceP.abs().gt(pair.maxUnbalancedP)) {
                //     rate = pair.unbalancedDiscountRate;
                //     amount = expectIndexDelta.sub(indexTotalDelta);
                // }

                // const needSawpInIndexDelta = totalIndexTotalDeltaWad.sub(expectIndexDeltaWad);
                // const swapIndexDeltaWad = indexDepositDeltaWad.lt(needSawpInIndexDelta)? indexDepositDeltaWad : needSawpInIndexDelta;

                const needSawpInStableDelta = totalStableTotalDeltaWad.sub(expectStbleDeltaWad);
                const swapStableDeltaWad = stableDepositDeltaWad.lt(needSawpInStableDelta)
                    ? stableDepositDeltaWad
                    : needSawpInStableDelta;

                // console.log(stableDepositDeltaWad, needSawpInStableDelta)
                // const amountIn =  BigNumber.from(new Decimal(swapIndexDeltaWad.toString())
                //                     .mul(1e30)
                //                     .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                //                     .toFixed(0));

                const totalAmountIn = swapStableDeltaWad.add(reserveAmount.reserveB);
                const swapAmountOut = swapStableDeltaWad.mul(reserveAmount.reserveA).div(totalAmountIn).mul(pairPrice);

                // console.log(swapAmountOut)
                const slipDeltaWad: BigNumber = swapStableDeltaWad.sub(swapAmountOut);

                const slipAmount = BigNumber.from(
                    new Decimal(slipDeltaWad.toString())
                        .div(10 ** (18 - (await usdt.decimals())))
                        .floor()
                        .toString(),
                );

                // console.log('slipAmount   : ' + slipAmount)
                // console.log('actslipAmount: ' + lpAmounts.slipAmount)

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        0,
                        stableAmount,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                // check Fee Amount
                expect(lpAmounts.stableFeeAmount).to.be.eq(stableAmount.mul(pair.addLpFeeP).div(10 ** 8));

                expect(lpAmounts.slipAmount.add(lpAmounts.stableFeeAmount)).to.be.eq(
                    stableAmount.sub(lpAmounts.afterFeeStableAmount),
                );

                // check slippage
                expect(lpAmounts.slipToken).to.be.eq(usdt.address);
                expect(lpAmounts.slipAmount).to.be.eq(slipAmount);

                // check Lp Amount
                expect(lpAmounts.mintAmount).to.be.eq(await lpToken.balanceOf(depositor2.address));
            });
        });

        describe('Check Fee And Slippage in unbalanced, btc > usdt', () => {
            // pre-operation: add liquidity with balance
            beforeEach(async () => {
                await refreshEnv();
                const {
                    users: [depositor],
                    btc,
                    usdt,
                    pool,
                    router,
                } = testEnv;
                // add liquidity
                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                // const lpToken = await getMockToken('', (await pool.getPair(pairIndex)).pairToken);
                // console.log(await btc.balanceOf(pool.address))

                await router
                    .connect(depositor.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        stableAmount,
                        [btc.address],
                        [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                        { value: 1 },
                    );

                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await router
                    .connect(depositor.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        0,
                        [btc.address],
                        [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                        { value: 1 },
                    );
            });

            it('Only use btc add liquidity', async () => {
                const {
                    router,
                    users: [, depositor2],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                await mintAndApprove(testEnv, btc, indexAmount, depositor2, router.address);

                // const mathMethod: any = pair.kOfSwap.mul(_1e30).div(await oraclePriceFeed.getPrice(btc.address));
                // const reserveADec = new Decimal(Math.sqrt(mathMethod));
                // const reserveBDec = (new Decimal(pair.kOfSwap.toString())).div(reserveADec);

                // const reserveA = BigNumber.from(reserveADec.toFixed(0));
                // const reserveB = BigNumber.from(reserveBDec.toFixed(0));

                const reserveAmount = await amm.getReserve(
                    pair.kOfSwap,
                    await oraclePriceFeed.getPrice(btc.address),
                    _1e30,
                );
                // console.log(reserveA, reserveB)
                // console.log(reserveAmount.reserveA, reserveAmount.reserveB)

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    indexAmount,
                    0,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                const afterFeeIndexAmount = indexAmount.sub(lpAmounts.indexFeeAmount);
                // const afterFeeStableAmount = stableAmount.sub(lpAmounts.stableFeeAmount);

                const poolVault = await pool.getVault(pairIndex);
                const indexProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.indexToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let indexTotalAmount: any;
                if (indexProfit.lt(0)) {
                    indexTotalAmount =
                        poolVault.indexTotalAmount > indexProfit.abs()
                            ? poolVault.indexTotalAmount.sub(indexProfit.abs())
                            : 0;
                } else {
                    indexTotalAmount = poolVault.indexTotalAmount.add(indexProfit.abs());
                }
                // console.log(indexProfit)

                const stableProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.stableToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let stableTotalAmount: any;
                if (stableProfit.lt(0)) {
                    stableTotalAmount =
                        poolVault.stableTotalAmount > stableProfit.abs()
                            ? poolVault.indexTotalAmount.sub(stableProfit.abs())
                            : 0;
                } else {
                    stableTotalAmount = poolVault.stableTotalAmount.add(stableProfit.abs());
                }
                // console.log(stableProfit)

                const indexTotalDeltaWad = (await convertIndexAmount(btc, indexTotalAmount, 18)).mul(pairPrice);
                const stableTotalDeltaWad = await convertIndexAmount(usdt, stableTotalAmount, 18);

                const indexDepositDeltaWad = (await convertIndexAmount(btc, afterFeeIndexAmount, 18)).mul(pairPrice);
                const stableDepositDeltaWad = await convertIndexAmount(usdt, BigNumber.from('0'), 18);

                const totalIndexTotalDeltaWad = indexTotalDeltaWad.add(indexDepositDeltaWad);
                const totalStableTotalDeltaWad = stableTotalDeltaWad.add(stableDepositDeltaWad);

                // console.log(totalIndexTotalDeltaWad)
                // console.log(totalStableTotalDeltaWad)

                const totalDelta = totalIndexTotalDeltaWad.add(totalStableTotalDeltaWad);
                const expectIndexDeltaWad = totalDelta.mul(pair.expectIndexTokenP).div(1e8);
                const expectStbleDeltaWad = totalDelta.sub(expectIndexDeltaWad);

                // console.log(totalDelta)
                // console.log(expectIndexDeltaWad)
                // console.log(totalDelta, totalIndexTotalDeltaWad, totalStableTotalDeltaWad);

                // pair, true, totalIndexTotalDeltaWad, expectIndexDeltaWad, totalDelta
                // get discount
                // const ratio = totalIndexTotalDeltaWad.div(totalDelta);
                // const expectP = pair.expectIndexTokenP;
                // const unbalanceP = ratio.div(expectP).sub(1e8)
                // let rate;
                // let amount;
                // if (unbalanceP.lt(0) && unbalanceP.abs().gt(pair.maxUnbalancedP)) {
                //     rate = pair.unbalancedDiscountRate;
                //     amount = expectIndexDeltaWad.sub(totalIndexTotalDeltaWad);
                // }

                // console.log(amount)

                const needSawpInIndexDelta = totalIndexTotalDeltaWad.sub(expectIndexDeltaWad);
                const swapIndexDeltaWad = indexDepositDeltaWad.lt(needSawpInIndexDelta)
                    ? indexDepositDeltaWad
                    : needSawpInIndexDelta;

                // console.log(needSawpInIndexDelta, totalIndexTotalDeltaWad, expectIndexDeltaWad)
                // console.log(swapIndexDeltaWad, indexDepositDeltaWad, needSawpInIndexDelta)

                const amountIn = BigNumber.from(
                    new Decimal(swapIndexDeltaWad.toString())
                        .mul(1e30)
                        .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                        .toFixed(0),
                );

                const totalAmountIn = amountIn.add(reserveAmount.reserveA);
                const swapAmountOut = amountIn.mul(reserveAmount.reserveB).div(totalAmountIn);

                const slipDeltaWad: BigNumber = swapIndexDeltaWad.sub(swapAmountOut);

                // console.log(slipDeltaWad)

                const slipAmount = BigNumber.from(
                    new Decimal(slipDeltaWad.toString())
                        .mul(1e30)
                        .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                        .div(10 ** (18 - (await btc.decimals())))
                        .floor()
                        .toString(),
                );

                // console.log('slipAmount   : ' + slipAmount)
                // console.log('actslipAmount: ' + lpAmounts.slipAmount)

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        0,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                // check Fee Amount
                expect(lpAmounts.indexFeeAmount).to.be.eq(indexAmount.mul(pair.addLpFeeP).div(10 ** 8));

                expect(lpAmounts.slipAmount.add(lpAmounts.indexFeeAmount)).to.be.eq(
                    indexAmount.sub(lpAmounts.afterFeeIndexAmount),
                );

                // check slippage
                expect(lpAmounts.slipToken).to.be.eq(btc.address);
                expect(lpAmounts.slipAmount).to.be.eq(slipAmount);

                // check Lp Amount
                expect(lpAmounts.mintAmount).to.be.eq(await lpToken.balanceOf(depositor2.address));
            });

            it('Only use usdt add liquidity', async () => {
                const {
                    router,
                    users: [, depositor2],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const stableAmount = ethers.utils.parseUnits('1000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor2, router.address);

                // const mathMethod: any = pair.kOfSwap.mul(_1e30).div(await oraclePriceFeed.getPrice(btc.address));
                // const reserveADec = new Decimal(Math.sqrt(mathMethod));
                // const reserveBDec = (new Decimal(pair.kOfSwap.toString())).div(reserveADec);

                // const reserveA = BigNumber.from(reserveADec.toFixed(0));
                // const reserveB = BigNumber.from(reserveBDec.toFixed(0));

                const reserveAmount = await amm.getReserve(
                    pair.kOfSwap,
                    await oraclePriceFeed.getPrice(btc.address),
                    _1e30,
                );
                // console.log(reserveA, reserveB)
                // console.log(reserveAmount.reserveA, reserveAmount.reserveB)

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    0,
                    stableAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                // const afterFeeIndexAmount = indexAmount.sub(lpAmounts.indexFeeAmount);
                const afterFeeStableAmount = stableAmount.sub(lpAmounts.stableFeeAmount);
                // console.log(afterFeeStableAmount)

                const poolVault = await pool.getVault(pairIndex);
                const indexProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.indexToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let indexTotalAmount: any;
                if (indexProfit.lt(0)) {
                    indexTotalAmount =
                        poolVault.indexTotalAmount > indexProfit.abs()
                            ? poolVault.indexTotalAmount.sub(indexProfit.abs())
                            : 0;
                } else {
                    indexTotalAmount = poolVault.indexTotalAmount.add(indexProfit.abs());
                }
                // console.log(indexProfit)

                const stableProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.stableToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let stableTotalAmount: any;
                if (stableProfit.lt(0)) {
                    stableTotalAmount =
                        poolVault.stableTotalAmount > stableProfit.abs()
                            ? poolVault.stableTotalAmount.sub(stableProfit.abs())
                            : 0;
                } else {
                    stableTotalAmount = poolVault.stableTotalAmount.add(stableProfit.abs());
                }
                // console.log(stableProfit)

                const indexTotalDeltaWad = (await convertIndexAmount(btc, indexTotalAmount, 18)).mul(pairPrice);
                const stableTotalDeltaWad = await convertIndexAmount(usdt, stableTotalAmount, 18);

                const indexDepositDeltaWad = (await convertIndexAmount(btc, BigNumber.from('0'), 18)).mul(pairPrice);
                const stableDepositDeltaWad = await convertIndexAmount(usdt, afterFeeStableAmount, 18);

                const totalIndexTotalDeltaWad = indexTotalDeltaWad.add(indexDepositDeltaWad);
                const totalStableTotalDeltaWad = stableTotalDeltaWad.add(stableDepositDeltaWad);

                // console.log(totalIndexTotalDeltaWad)
                // console.log(totalStableTotalDeltaWad)

                const totalDelta = totalIndexTotalDeltaWad.add(totalStableTotalDeltaWad);
                const expectIndexDeltaWad = totalDelta.mul(pair.expectIndexTokenP).div(1e8);
                const expectStbleDeltaWad = totalDelta.sub(expectIndexDeltaWad);

                // console.log(totalDelta)
                // console.log(expectIndexDeltaWad)
                // console.log(expectStbleDeltaWad)
                // console.log(totalDelta, totalIndexTotalDeltaWad, totalStableTotalDeltaWad);

                // get discount
                const ratio = totalStableTotalDeltaWad.mul(1e8).div(totalDelta);
                const expectP = BigNumber.from(1e8).sub(pair.expectIndexTokenP);
                const unbalanceP = ratio.mul(1e8).div(expectP).sub(1e8);
                let discountRate = BigNumber.from('0');
                let discountAmount = BigNumber.from('0');
                if (unbalanceP.lt(0) && unbalanceP.abs().gt(pair.maxUnbalancedP)) {
                    discountRate = pair.unbalancedDiscountRate;
                    discountAmount = expectStbleDeltaWad.sub(totalStableTotalDeltaWad);
                }

                // console.log(discountRate, discountAmount)

                // const needSawpInIndexDelta = totalIndexTotalDeltaWad.sub(expectIndexDeltaWad);
                // const swapIndexDeltaWad = indexDepositDeltaWad.lt(needSawpInIndexDelta)? indexDepositDeltaWad : needSawpInIndexDelta;

                const needSawpInStableDelta = totalStableTotalDeltaWad.sub(expectStbleDeltaWad);
                let swapStableDeltaWad = stableDepositDeltaWad.lt(needSawpInStableDelta)
                    ? stableDepositDeltaWad
                    : needSawpInStableDelta;

                if (swapStableDeltaWad.lt(0)) {
                    swapStableDeltaWad = BigNumber.from('0');
                }
                // console.log(stableDepositDeltaWad, needSawpInStableDelta)
                // const amountIn =  BigNumber.from(new Decimal(swapIndexDeltaWad.toString())
                //                     .mul(1e30)
                //                     .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                //                     .toFixed(0));

                const totalAmountIn = swapStableDeltaWad.add(reserveAmount.reserveB);
                const swapAmountOut = swapStableDeltaWad.mul(reserveAmount.reserveA).div(totalAmountIn).mul(pairPrice);

                // console.log(swapAmountOut)
                const slipDeltaWad: BigNumber = swapStableDeltaWad.sub(swapAmountOut);

                const slipAmount = BigNumber.from(
                    new Decimal(slipDeltaWad.toString())
                        .div(10 ** (18 - (await usdt.decimals())))
                        .floor()
                        .toString(),
                );

                // console.log('slipAmount   : ' + slipAmount)
                // console.log('actslipAmount: ' + lpAmounts.slipAmount)

                let mintDeltaWad = indexDepositDeltaWad.add(stableDepositDeltaWad).sub(slipDeltaWad);

                const lpPrice = await poolView.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address));
                let dicountAmountAct = BigNumber.from('0');
                if (discountRate.gt(0)) {
                    // console.log(discountAmount, mintDeltaWad)
                    if (mintDeltaWad.gt(discountAmount)) {
                        dicountAmountAct = discountAmount
                            .mul(_1e30)
                            .div(lpPrice.mul(BigNumber.from('100000000').sub(discountRate.toNumber())).div(1e8));
                        mintDeltaWad = mintDeltaWad.sub(discountAmount);
                    } else {
                        dicountAmountAct = mintDeltaWad
                            .mul(_1e30)
                            .div(lpPrice.mul(BigNumber.from('100000000').sub(discountRate.toNumber())).div(1e8));
                        mintDeltaWad = BigNumber.from('0');
                    }
                }

                // console.log(mintDeltaWad)

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        0,
                        stableAmount,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                // check Fee Amount
                expect(lpAmounts.stableFeeAmount).to.be.eq(stableAmount.mul(pair.addLpFeeP).div(10 ** 8));

                expect(lpAmounts.slipAmount.add(lpAmounts.stableFeeAmount)).to.be.eq(
                    stableAmount.sub(lpAmounts.afterFeeStableAmount),
                );

                // check slippage
                expect(lpAmounts.slipToken).to.be.eq(ZERO_ADDRESS);
                expect(lpAmounts.slipAmount).to.be.eq(slipAmount);

                // check dicount
                expect(lpAmounts.mintAmount).to.eq(dicountAmountAct);

                // check Lp Amount
                expect(lpAmounts.mintAmount).to.be.eq(await lpToken.balanceOf(depositor2.address));
            });
        });

        describe('Check Fee And Slippage in unbalanced, btc < usdt', () => {
            // pre-operation: add liquidity with balance
            beforeEach(async () => {
                await refreshEnv();
                const {
                    users: [depositor],
                    btc,
                    usdt,
                    pool,
                    router,
                } = testEnv;
                // add liquidity
                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);

                // const lpToken = await getMockToken('', (await pool.getPair(pairIndex)).pairToken);
                // console.log(await btc.balanceOf(pool.address))

                await router
                    .connect(depositor.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        stableAmount,
                        [btc.address],
                        [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                        { value: 1 },
                    );

                await mintAndApprove(testEnv, usdt, stableAmount, depositor, router.address);
                await router
                    .connect(depositor.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        0,
                        stableAmount,
                        [btc.address],
                        [new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)])],
                        { value: 1 },
                    );
            });

            it('Only use btc add liquidity', async () => {
                const {
                    router,
                    users: [, depositor2],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );

                const indexAmount = ethers.utils.parseUnits('1000', await btc.decimals());
                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                await mintAndApprove(testEnv, btc, indexAmount, depositor2, router.address);

                // const mathMethod: any = pair.kOfSwap.mul(_1e30).div(await oraclePriceFeed.getPrice(btc.address));
                // const reserveADec = new Decimal(Math.sqrt(mathMethod));
                // const reserveBDec = (new Decimal(pair.kOfSwap.toString())).div(reserveADec);

                // const reserveA = BigNumber.from(reserveADec.toFixed(0));
                // const reserveB = BigNumber.from(reserveBDec.toFixed(0));

                const reserveAmount = await amm.getReserve(
                    pair.kOfSwap,
                    await oraclePriceFeed.getPrice(btc.address),
                    _1e30,
                );
                // console.log(reserveA, reserveB)
                // console.log(reserveAmount.reserveA, reserveAmount.reserveB)

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    indexAmount,
                    0,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                const afterFeeIndexAmount = indexAmount.sub(lpAmounts.indexFeeAmount);
                // const afterFeeStableAmount = stableAmount.sub(lpAmounts.stableFeeAmount);

                const poolVault = await pool.getVault(pairIndex);
                const indexProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.indexToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let indexTotalAmount: any;
                if (indexProfit.lt(0)) {
                    indexTotalAmount =
                        poolVault.indexTotalAmount > indexProfit.abs()
                            ? poolVault.indexTotalAmount.sub(indexProfit.abs())
                            : 0;
                } else {
                    indexTotalAmount = poolVault.indexTotalAmount.add(indexProfit.abs());
                }
                // console.log(indexProfit)

                const stableProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.stableToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let stableTotalAmount: any;
                if (stableProfit.lt(0)) {
                    stableTotalAmount =
                        poolVault.stableTotalAmount > stableProfit.abs()
                            ? poolVault.indexTotalAmount.sub(stableProfit.abs())
                            : 0;
                } else {
                    stableTotalAmount = poolVault.stableTotalAmount.add(stableProfit.abs());
                }
                // console.log(stableProfit)

                const indexTotalDeltaWad = (await convertIndexAmount(btc, indexTotalAmount, 18)).mul(pairPrice);
                const stableTotalDeltaWad = await convertIndexAmount(usdt, stableTotalAmount, 18);

                const indexDepositDeltaWad = (await convertIndexAmount(btc, afterFeeIndexAmount, 18)).mul(pairPrice);
                const stableDepositDeltaWad = await convertIndexAmount(usdt, BigNumber.from('0'), 18);

                const totalIndexTotalDeltaWad = indexTotalDeltaWad.add(indexDepositDeltaWad);
                const totalStableTotalDeltaWad = stableTotalDeltaWad.add(stableDepositDeltaWad);

                // console.log(totalIndexTotalDeltaWad)
                // console.log(totalStableTotalDeltaWad)

                const totalDelta = totalIndexTotalDeltaWad.add(totalStableTotalDeltaWad);
                const expectIndexDeltaWad = totalDelta.mul(pair.expectIndexTokenP).div(1e8);
                const expectStbleDeltaWad = totalDelta.sub(expectIndexDeltaWad);

                // console.log(totalDelta)
                // console.log(expectIndexDeltaWad)
                // console.log(totalDelta, totalIndexTotalDeltaWad, totalStableTotalDeltaWad);

                // pair, true, totalIndexTotalDeltaWad, expectIndexDeltaWad, totalDelta
                const ratio = totalIndexTotalDeltaWad.mul(1e8).div(totalDelta);
                const expectP = pair.expectIndexTokenP;
                const unbalanceP = ratio.mul(1e8).div(expectP).sub(1e8);
                let discountRate = BigNumber.from('0');
                let discountAmount = BigNumber.from('0');
                if (unbalanceP.lt(0) && unbalanceP.abs().gt(pair.maxUnbalancedP)) {
                    discountRate = pair.unbalancedDiscountRate;
                    discountAmount = expectIndexDeltaWad.sub(totalIndexTotalDeltaWad);
                }

                // console.log(amount)

                const needSawpInIndexDelta = totalIndexTotalDeltaWad.sub(expectIndexDeltaWad);
                let swapIndexDeltaWad = indexDepositDeltaWad.lt(needSawpInIndexDelta)
                    ? indexDepositDeltaWad
                    : needSawpInIndexDelta;

                // console.log(needSawpInIndexDelta, totalIndexTotalDeltaWad, expectIndexDeltaWad)
                // console.log(swapIndexDeltaWad, indexDepositDeltaWad, needSawpInIndexDelta)
                if (swapIndexDeltaWad.lt(0)) {
                    swapIndexDeltaWad = BigNumber.from('0');
                }

                const amountIn = BigNumber.from(
                    new Decimal(swapIndexDeltaWad.toString())
                        .mul(1e30)
                        .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                        .toFixed(0),
                );

                const totalAmountIn = amountIn.add(reserveAmount.reserveA);
                const swapAmountOut = amountIn.mul(reserveAmount.reserveB).div(totalAmountIn);

                const slipDeltaWad: BigNumber = swapIndexDeltaWad.sub(swapAmountOut);

                // console.log(slipDeltaWad)

                const slipAmount = BigNumber.from(
                    new Decimal(slipDeltaWad.toString())
                        .mul(1e30)
                        .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                        .div(10 ** (18 - (await btc.decimals())))
                        .floor()
                        .toString(),
                );

                // console.log('slipAmount   : ' + slipAmount)
                // console.log('actslipAmount: ' + lpAmounts.slipAmount)

                let mintDeltaWad = indexDepositDeltaWad.add(stableDepositDeltaWad).sub(slipDeltaWad);

                const lpPrice = await poolView.lpFairPrice(pairIndex, await oraclePriceFeed.getPrice(btc.address));
                let dicountAmountAct = BigNumber.from('0');
                if (discountRate.gt(0)) {
                    if (mintDeltaWad.gt(discountAmount)) {
                        dicountAmountAct = discountAmount
                            .mul(_1e30)
                            .div(lpPrice.mul(BigNumber.from('100000000').sub(discountRate.toNumber())).div(1e8));
                        mintDeltaWad = mintDeltaWad.sub(discountAmount);
                    } else {
                        dicountAmountAct = mintDeltaWad
                            .mul(_1e30)
                            .div(lpPrice.mul(BigNumber.from('100000000').sub(discountRate.toNumber())).div(1e8));
                        mintDeltaWad = BigNumber.from('0');
                    }
                }

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        indexAmount,
                        0,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                // check Fee Amount
                expect(lpAmounts.indexFeeAmount).to.be.eq(indexAmount.mul(pair.addLpFeeP).div(10 ** 8));

                expect(lpAmounts.slipAmount.add(lpAmounts.indexFeeAmount)).to.be.eq(
                    indexAmount.sub(lpAmounts.afterFeeIndexAmount),
                );

                // check slippage
                expect(lpAmounts.slipToken).to.be.eq(ZERO_ADDRESS);
                expect(lpAmounts.slipAmount).to.be.eq(slipAmount);

                // check dicount
                expect(lpAmounts.mintAmount).to.eq(dicountAmountAct);

                // check Lp Amount
                expect(lpAmounts.mintAmount).to.be.eq(await lpToken.balanceOf(depositor2.address));
            });

            it('Only usd usdt add liquidity', async () => {
                const {
                    router,
                    users: [, depositor2],
                    usdt,
                    btc,
                    pool,
                    poolView,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', ''),
                );
                const stableAmount = ethers.utils.parseUnits('1000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor2, router.address);

                // const mathMethod: any = pair.kOfSwap.mul(_1e30).div(await oraclePriceFeed.getPrice(btc.address));
                // const reserveADec = new Decimal(Math.sqrt(mathMethod));
                // const reserveBDec = (new Decimal(pair.kOfSwap.toString())).div(reserveADec);

                // const reserveA = BigNumber.from(reserveADec.toFixed(0));
                // const reserveB = BigNumber.from(reserveBDec.toFixed(0));

                const reserveAmount = await amm.getReserve(
                    pair.kOfSwap,
                    await oraclePriceFeed.getPrice(btc.address),
                    _1e30,
                );
                // console.log(reserveA, reserveB)
                // console.log(reserveAmount.reserveA, reserveAmount.reserveB)

                const lpAmounts = await poolView.getMintLpAmount(
                    pairIndex,
                    0,
                    stableAmount,
                    await oraclePriceFeed.getPrice(btc.address),
                );

                // const afterFeeIndexAmount = indexAmount.sub(lpAmounts.indexFeeAmount);
                const afterFeeStableAmount = stableAmount.sub(lpAmounts.stableFeeAmount);
                // console.log(afterFeeStableAmount)

                const poolVault = await pool.getVault(pairIndex);
                const indexProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.indexToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let indexTotalAmount: any;
                if (indexProfit.lt(0)) {
                    indexTotalAmount =
                        poolVault.indexTotalAmount > indexProfit.abs()
                            ? poolVault.indexTotalAmount.sub(indexProfit.abs())
                            : 0;
                } else {
                    indexTotalAmount = poolVault.indexTotalAmount.add(indexProfit.abs());
                }
                // console.log(indexProfit)

                const stableProfit = await positionManager.lpProfit(
                    pairIndex,
                    pair.stableToken,
                    await oraclePriceFeed.getPrice(btc.address),
                );
                let stableTotalAmount: any;
                if (stableProfit.lt(0)) {
                    stableTotalAmount =
                        poolVault.stableTotalAmount > stableProfit.abs()
                            ? poolVault.stableTotalAmount.sub(stableProfit.abs())
                            : 0;
                } else {
                    stableTotalAmount = poolVault.stableTotalAmount.add(stableProfit.abs());
                }
                // console.log(stableProfit)

                const indexTotalDeltaWad = (await convertIndexAmount(btc, indexTotalAmount, 18)).mul(pairPrice);
                const stableTotalDeltaWad = await convertIndexAmount(usdt, stableTotalAmount, 18);

                const indexDepositDeltaWad = (await convertIndexAmount(btc, BigNumber.from('0'), 18)).mul(pairPrice);
                const stableDepositDeltaWad = await convertIndexAmount(usdt, afterFeeStableAmount, 18);

                const totalIndexTotalDeltaWad = indexTotalDeltaWad.add(indexDepositDeltaWad);
                const totalStableTotalDeltaWad = stableTotalDeltaWad.add(stableDepositDeltaWad);

                // console.log(totalIndexTotalDeltaWad)
                // console.log(totalStableTotalDeltaWad)

                const totalDelta = totalIndexTotalDeltaWad.add(totalStableTotalDeltaWad);
                const expectIndexDeltaWad = totalDelta.mul(pair.expectIndexTokenP).div(1e8);
                const expectStbleDeltaWad = totalDelta.sub(expectIndexDeltaWad);

                // console.log(totalDelta)
                // console.log(expectIndexDeltaWad)
                // console.log(expectStbleDeltaWad)
                // console.log(totalDelta, totalIndexTotalDeltaWad, totalStableTotalDeltaWad);

                // get discount
                // const ratio = indexTotalDelta.div(totalDelta);
                // const expectP = pair.expectIndexTokenP;
                // const unbalanceP = ratio.div(expectP).sub(1e8)
                // let rate;
                // let amount;
                // if (unbalanceP.lt(0) && unbalanceP.abs().gt(pair.maxUnbalancedP)) {
                //     rate = pair.unbalancedDiscountRate;
                //     amount = expectIndexDelta.sub(indexTotalDelta);
                // }

                // const needSawpInIndexDelta = totalIndexTotalDeltaWad.sub(expectIndexDeltaWad);
                // const swapIndexDeltaWad = indexDepositDeltaWad.lt(needSawpInIndexDelta)? indexDepositDeltaWad : needSawpInIndexDelta;

                const needSawpInStableDelta = totalStableTotalDeltaWad.sub(expectStbleDeltaWad);
                const swapStableDeltaWad = stableDepositDeltaWad.lt(needSawpInStableDelta)
                    ? stableDepositDeltaWad
                    : needSawpInStableDelta;

                // console.log(stableDepositDeltaWad, needSawpInStableDelta)
                // const amountIn =  BigNumber.from(new Decimal(swapIndexDeltaWad.toString())
                //                     .mul(1e30)
                //                     .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                //                     .toFixed(0));

                const totalAmountIn = swapStableDeltaWad.add(reserveAmount.reserveB);
                const swapAmountOut = swapStableDeltaWad.mul(reserveAmount.reserveA).div(totalAmountIn).mul(pairPrice);

                // console.log(swapAmountOut)
                const slipDeltaWad: BigNumber = swapStableDeltaWad.sub(swapAmountOut);

                const slipAmount = BigNumber.from(
                    new Decimal(slipDeltaWad.toString())
                        .div(10 ** (18 - (await usdt.decimals())))
                        .floor()
                        .toString(),
                );

                // console.log('slipAmount   : ' + slipAmount)
                // console.log('actslipAmount: ' + lpAmounts.slipAmount)

                await router
                    .connect(depositor2.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        0,
                        stableAmount,
                        [btc.address],
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)],
                            ),
                        ],
                        { value: 1 },
                    );

                // check Fee Amount
                expect(lpAmounts.stableFeeAmount).to.be.eq(stableAmount.mul(pair.addLpFeeP).div(10 ** 8));

                expect(lpAmounts.slipAmount.add(lpAmounts.stableFeeAmount)).to.be.eq(
                    stableAmount.sub(lpAmounts.afterFeeStableAmount),
                );

                // check slippage
                expect(lpAmounts.slipToken).to.be.eq(usdt.address);
                expect(lpAmounts.slipAmount).to.be.eq(slipAmount);

                // check Lp Amount
                expect(lpAmounts.mintAmount).to.be.eq(await lpToken.balanceOf(depositor2.address));
            });
        });
    });
});
