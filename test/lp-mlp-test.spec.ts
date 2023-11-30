import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import hre, { ethers } from 'hardhat';
import { mintAndApprove } from './helpers/misc';
import { BigNumber } from 'ethers';
import { getMockToken } from '../helpers';
// import { TestAmmUtils, AmountMath } from '../types';
import Decimal from 'decimal.js';
import {
    convertIndexAmount,
    convertIndexAmountToStable,
    convertStableAmountToIndex,
} from '../helpers/token-decimals';



describe('lp-mlp: Test cases', () => {
    const pairIndex = 1;
    const _1e30 = '1000000000000000000000000000000';
    let testEnv: TestEnv; 

    async function refreshEnv() {
        testEnv = await newTestEnv();
    }

    before(async () => { 
        testEnv = await newTestEnv();
    })

    describe('Liquidity operation of pool', () => {
        describe('Liquidity of Common Token', () => {
            it('should add common liquidity success', async () => {
                await refreshEnv();
                const {
                    router,
                    users:[depositor], 
                    usdt,
                    btc,
                    pool,
                    oraclePriceFeed,
                } = testEnv;
        
                const indexPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                )

                const lpPrice = await pool.lpFairPrice(1, await oraclePriceFeed.getPrice(btc.address));
                // console.log(pairPrice);
                
                // value 1:100
                const addIndexAmount = ethers.utils.parseUnits('1', await btc.decimals()); // per 30000U
                const addStableAmount = ethers.utils.parseUnits('30000', await usdt.decimals()); // per 1U
                const pair = await pool.getPair(pairIndex);
                // mint test coin
                await mintAndApprove(testEnv, btc, addIndexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, addStableAmount, depositor, router.address);

                const lpAmountStrut = await pool.getMintLpAmount(
                    pairIndex, 
                    addIndexAmount, 
                    addStableAmount, 
                    await oraclePriceFeed.getPrice(btc.address)
                );

                // console.log(lpAmountStrut.mintAmount);

                await router
                    .connect(depositor.signer)
                    .addLiquidity(
                        pair.indexToken,
                        pair.stableToken,
                        addIndexAmount,
                        addStableAmount,
                        [btc.address], // the token need update price
                        [
                            new ethers.utils.AbiCoder().encode(
                                ['uint256'],
                                [ethers.utils.parseUnits(indexPrice.toString(), 8)]
                            )
                        ],  // update data(price)
                        {value: 1},
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
                    await convertStableAmountToIndex(btc, usdt, poolVault.stableTotalAmount)
                );

                // fee check
                const btcFee = await pool.feeTokenAmounts(btc.address);
                const stableFee = await pool.feeTokenAmounts(usdt.address);
                const feeRate = pair.addLpFeeP;

                expect(btcFee).to.be.eq(addIndexAmount.mul(feeRate).div(1e8));
                expect(stableFee).to.be.eq(addStableAmount.mul(feeRate).div(1e8));

                // total amount check
                expect(addIndexAmount).to.be.eq(poolVault.indexTotalAmount.add(btcFee))
                expect(addStableAmount).to.be.eq(poolVault.stableTotalAmount.add(stableFee))

            }); 

            it('should remove common liquidity success', async () => {
                const {
                    router,
                    users:[depositor], 
                    usdt,
                    btc,
                    pairTokens,
                    pool,
                    oraclePriceFeed,
                } = testEnv;

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmount = await lpToken.balanceOf(depositor.address);

                const indexPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                );

                await lpToken.connect(depositor.signer).approve(router.address, lpAmount)

                const receivedAmounts = await pool.getReceivedAmount(pairIndex, lpAmount, await oraclePriceFeed.getPrice(btc.address));
                const btcAmountBefore = await btc.balanceOf(depositor.address);
                const usdtAmountBefore = await usdt.balanceOf(depositor.address);

                const btcFeeBefore = await pool.feeTokenAmounts(btc.address);
                const stableFeeBefore = await pool.feeTokenAmounts(usdt.address);
                const lpPrice = await pool.lpFairPrice(pairIndex, indexPrice);

                await router.connect(depositor.signer).removeLiquidity(
                    pair.indexToken,
                    pair.stableToken, 
                    await lpToken.balanceOf(depositor.address),
                    false,
                    [btc.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [ethers.utils.parseUnits(indexPrice.toString(), 8)]
                        )
                    ],  // update data(price)
                    {value: 1},
                );

                // received amount check
                expect(receivedAmounts.receiveIndexTokenAmount).to.be.eq(
                    btcAmountBefore.add(await btc.balanceOf(depositor.address))
                )
                expect(receivedAmounts.receiveStableTokenAmount).to.be.eq(
                    usdtAmountBefore.add(await usdt.balanceOf(depositor.address))
                )
                
                // pool resever asset(fee) check
                const btcFee = await pool.feeTokenAmounts(btc.address);
                const stableFee = await pool.feeTokenAmounts(usdt.address);

                expect(btcFee).to.be.eq(
                    receivedAmounts.feeIndexTokenAmount.add(btcFeeBefore)
                );

                expect(stableFee).to.be.eq(
                    receivedAmounts.feeStableTokenAmount.add(stableFeeBefore)
                );

            });
        })

        describe('Liquidity of ETH', () => {

            it('should add eth liquidity success', async() => {
                await refreshEnv();
                const pairIndex2 = 2;
                const {
                    router,
                    users:[depositor], 
                    usdt,
                    eth,
                    pool,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30).replace('.0', '')
                )

                expect(await pool.lpFairPrice(pairIndex2, await oraclePriceFeed.getPrice(eth.address))).to.be.eq(
                    ethers.utils.parseUnits('1000000000000'),
                );

                const pair = await pool.getPair(pairIndex2);
                const addIndexAmount = ethers.utils.parseUnits('1', await eth.decimals()); // 2000  
                const addStableAmount = ethers.utils.parseUnits('2000', await usdt.decimals()); // 1
                const sendEth = ethers.utils.parseUnits('1000000000000000001', 'wei');

                await eth.connect(depositor.signer).approve(router.address, addIndexAmount);
                await mintAndApprove(testEnv, usdt, addStableAmount, depositor, router.address);

                const lpToken = await getMockToken('', pair.pairToken);
                const mintAmounts = await pool.getMintLpAmount(
                    pairIndex2, 
                    addIndexAmount, 
                    addStableAmount, 
                    await oraclePriceFeed.getPrice(eth.address)
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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        1,
                        {value: sendEth}
                    );

                // erc20 token check
                expect(await eth.balanceOf(depositor.address)).to.be.eq(0);
                expect(await usdt.balanceOf(depositor.address)).to.be.eq(0);
                expect(await eth.balanceOf(pool.address)).to.be.eq(addIndexAmount);
                expect(await usdt.balanceOf(pool.address)).to.be.eq(addStableAmount);

                // lp token check
                expect(await lpToken.balanceOf(depositor.address)).to.be.eq(mintAmounts.mintAmount);
            });

            it('should remove eth liquidity success', async() => {
                const pairIndex2 = 2;
                const {
                    router,
                    users:[depositor], 
                    usdt,
                    eth,
                    pool,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30).replace('.0', '')
                )

                const pair = await pool.getPair(pairIndex2);

                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmount = await lpToken.balanceOf(depositor.address);
                await lpToken.connect(depositor.signer).approve(router.address, lpAmount)
                const ethAmountBefore = await depositor.signer.getBalance();

                const receivedAmounts = await pool.getReceivedAmount(
                    pairIndex2, 
                    lpAmount, 
                    await oraclePriceFeed.getPrice(eth.address)
                );

                await router.connect(depositor.signer)
                .removeLiquidity(
                    pair.indexToken,
                    pair.stableToken,
                    lpAmount,
                    true,
                    [eth.address],
                    [
                        new ethers.utils.AbiCoder().encode(
                            ['uint256'],
                            [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                        )
                    ],
                    {value: 1}
                )

                // receive token check 
                expect(await eth.balanceOf(depositor.address)).to.be.eq(0);
                expect(await usdt.balanceOf(depositor.address)).to.be.eq(receivedAmounts.receiveStableTokenAmount);
                expect(receivedAmounts.receiveIndexTokenAmount).to.be.gt(
                    (await depositor.signer.getBalance()).sub(ethAmountBefore)
                );

                // lp token check
                expect(await lpToken.balanceOf(depositor.address)).to.be.eq(0);
            });

        })

        describe('Liquidity for another account', () => {

            it('should add liquidity for account success', async() => {
                await refreshEnv();

                const {
                    router,
                    users:[depositor, receiver], 
                    usdt,
                    btc,
                    pool,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                )

                const pair = await pool.getPair(pairIndex);
                const addIndexAmount = ethers.utils.parseUnits('1', await btc.decimals());  // per 30000
                const addStableAmount = ethers.utils.parseUnits('30000', await usdt.decimals()); // per 1

                await mintAndApprove(testEnv, btc, addIndexAmount, depositor, router.address);
                await mintAndApprove(testEnv, usdt, addStableAmount, depositor, router.address);

                const lpToken = await getMockToken('', pair.pairToken);
                const receiverBefore = await lpToken.balanceOf(receiver.address);

                const lpAmounts = await pool.getMintLpAmount(
                    pairIndex, 
                    addIndexAmount, 
                    addStableAmount, 
                    await oraclePriceFeed.getPrice(btc.address)
                );

                await router.connect(depositor.signer)
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
                            [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                        )
                    ],
                    {value: 1}
                );
                
                // lpToken check
                expect(await lpToken.balanceOf(depositor.address)).to.be.eq(0);
                expect(await lpToken.balanceOf(receiver.address)).to.be.eq(
                    receiverBefore.add(lpAmounts.mintAmount)
                )
            });

            it('should remove liquidity for account success', async() => {
                const {
                    router,
                    users:[depositor, receiver], 
                    usdt,
                    btc,
                    pool,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                )

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);

                const lpAmount = await lpToken.balanceOf(receiver.address);
                await lpToken.connect(receiver.signer).approve(router.address, lpAmount);

                const receiveAmounts = await pool.getReceivedAmount(pairIndex, lpAmount, await oraclePriceFeed.getPrice(btc.address));
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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    )

                // lp token check
                expect(await lpToken.balanceOf(receiver.address)).to.be.eq(0);

                // receive token check
                expect(receiveAmounts.receiveIndexTokenAmount).to.be.eq(
                    (await btc.balanceOf(depositor.address)).sub(indexTokenBefore)
                )
                expect(receiveAmounts.receiveStableTokenAmount).to.be.eq(
                    (await usdt.balanceOf(depositor.address)).sub(stableTokenBefore)
                )


            });

        })
    })

    describe('MLP bug or sell', () => {
        describe('MLP Operation in balanced', () => {
            // pre-operation: add liquidity with balance
            before(async () => {
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
                    router,
                    oraclePriceFeed
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                );

                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor2, router.address);

                const lpAmounts = await pool.getMintLpAmount(pairIndex, indexAmount, 0, await oraclePriceFeed.getPrice(btc.address));
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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    )

                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor2.address)).sub(lpAmountBefore)
                )
            });


            it('sell MLP when the pool is unbalanced, btc > usdt', async() => {
                const {
                    users: [, depositor2],
                    btc,
                    usdt,
                    pool,
                    router,
                    oraclePriceFeed
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                );

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmount = await lpToken.balanceOf(depositor2.address);

                const btcAmountBefore = await btc.balanceOf(depositor2.address);
                await lpToken.connect(depositor2.signer).approve(router.address, lpAmount);
                const receiveAmounts = await pool.getReceivedAmount(pairIndex, lpAmount, await oraclePriceFeed.getPrice(btc.address));

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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    );

                expect(receiveAmounts.receiveStableTokenAmount).to.be.eq(0);
                expect(receiveAmounts.receiveIndexTokenAmount).to.be.eq(
                    (await btc.balanceOf(depositor2.address)).sub(btcAmountBefore)
                )

                const poolVault = await pool.getVault(pairIndex);
                expect(poolVault.stableTotalAmount).to.be.eq(
                    (await convertIndexAmountToStable(btc, usdt, poolVault.indexTotalAmount)).mul(pairPrice)
                ) // the pool is balance again
            });

            it('Use usdt to buy MLP when the pool is balanced', async() => {
                const {
                    users: [, depositor2],
                    btc,
                    usdt,
                    pool,
                    router,
                    oraclePriceFeed
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                );

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                const addStableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                await mintAndApprove(testEnv, usdt, addStableAmount, depositor2, router.address);

                const lpAmountBefore = await lpToken.balanceOf(depositor2.address);
                const lpAmounts = await pool.getMintLpAmount(pairIndex, 0, addStableAmount, await oraclePriceFeed.getPrice(btc.address));

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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    )

                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor2.address)).sub(lpAmountBefore)
                )
            });

            it('sell MLP when the pool is unbalanced, btc < usdt', async() => {
                const {
                    users: [, depositor2],
                    btc,
                    usdt,
                    pool,
                    router,
                    oraclePriceFeed
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                );

                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmount = await lpToken.balanceOf(depositor2.address);

                const usdtAmountBefore = await usdt.balanceOf(depositor2.address);
                await lpToken.connect(depositor2.signer).approve(router.address, lpAmount);
                const receiveAmounts = await pool.getReceivedAmount(pairIndex, lpAmount, await oraclePriceFeed.getPrice(btc.address));

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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    );

                expect(receiveAmounts.receiveIndexTokenAmount).to.be.eq(0);
                expect(receiveAmounts.receiveStableTokenAmount).to.be.eq(
                    (await usdt.balanceOf(depositor2.address)).sub(usdtAmountBefore)
                )

                const poolVault = await pool.getVault(pairIndex);
                expect(await convertIndexAmountToStable(btc, usdt, poolVault.indexTotalAmount)).to.be.eq(
                    (await convertIndexAmountToStable(btc, usdt, (await convertStableAmountToIndex(btc, usdt, poolVault.stableTotalAmount)).div(pairPrice)))
                ) // the pool is balance again

                
            });

            it('Use usdt, btc to buy MLP when the pool is balanced, btc = usdt', async() => {
                const {
                    users: [, depositor2],
                    btc,
                    usdt,
                    pool,
                    router,
                    oraclePriceFeed,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                )
                
                // add liquidity
                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor2, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor2, router.address);
                
                const lpToken = await getMockToken('', pair.pairToken);
                const lpAmountBefore = await lpToken.balanceOf(depositor2.address);

                const lpAmounts = await pool.getMintLpAmount(pairIndex, indexAmount, stableAmount, await oraclePriceFeed.getPrice(btc.address))
                
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
                    (await lpToken.balanceOf(depositor2.address)).sub(lpAmountBefore)
                )

                const poolVault = await pool.getVault(pairIndex);
                expect(await convertIndexAmountToStable(btc, usdt, poolVault.indexTotalAmount)).to.be.eq(
                    (await convertIndexAmountToStable(btc, usdt, (await convertStableAmountToIndex(btc, usdt, poolVault.stableTotalAmount)).div(pairPrice)))
                ) // the pool is balance again


            })
            

            
        })

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

            it('Use btc to buy MLP when the pool is unbalanced', async() => {
                const {
                    users: [, , depositor3],
                    btc,
                    pool,
                    router,
                    oraclePriceFeed
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                );

                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor3, router.address);

                const lpAmounts = await pool.getMintLpAmount(pairIndex, indexAmount, 0, await oraclePriceFeed.getPrice(btc.address));
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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    )

                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor3.address)).sub(lpAmountBefore)
                )
                await lpToken.connect(depositor3.signer).approve(router.address, await lpToken.balanceOf(depositor3.address));
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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    )
                // console.log(await lpToken.balanceOf(depositor3.address))
            });

            it('Use usdt to buy MLP when the pool is unbalanced', async() => {
                const {
                    users: [, , depositor3],
                    usdt,
                    btc,
                    pool,
                    router,
                    oraclePriceFeed
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                );

                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor3, router.address);

                const lpAmounts = await pool.getMintLpAmount(pairIndex, 0, stableAmount, await oraclePriceFeed.getPrice(btc.address));
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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    )

                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor3.address)).sub(lpAmountBefore)
                )

                await lpToken.connect(depositor3.signer).approve(router.address, await lpToken.balanceOf(depositor3.address));
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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    )
                // console.log(await lpToken.balanceOf(depositor3.address))
            });

            it('Use usdt, btc to buy MLP when the pool is unbalanced', async() => {
                const {
                    users: [, , depositor3],
                    usdt,
                    btc,
                    pool,
                    router,
                    oraclePriceFeed
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                );

                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const stableAmount = ethers.utils.parseUnits('300000000', await usdt.decimals());
                const pair = await pool.getPair(pairIndex);
                await mintAndApprove(testEnv, btc, indexAmount, depositor3, router.address);
                await mintAndApprove(testEnv, usdt, stableAmount, depositor3, router.address);

                const lpAmounts = await pool.getMintLpAmount(pairIndex, indexAmount, stableAmount, await oraclePriceFeed.getPrice(btc.address));
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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    )
                expect(lpAmounts.mintAmount).to.be.eq(
                    (await lpToken.balanceOf(depositor3.address)).sub(lpAmountBefore)
                )
                // console.log(await lpToken.balanceOf(depositor3.address))
            });
        })
    })

    describe('Liquidity Fee And Slippage', async() => {
        // pre-operation: add liquidity with balance
        before(async () => {
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
            console.log(new ethers.utils.AbiCoder().encode(['uint256'], [ethers.utils.parseUnits('30000', 8)]))
        });

        describe('Check Fee And Slippage in balanced', () =>{
            it('Only use btc add liquidity', async() => {
                const {
                    router,
                    users:[, depositor2], 
                    usdt,
                    btc,
                    pool,
                    oraclePriceFeed,
                    positionManager,
                } = testEnv;

                const pairPrice = BigNumber.from(
                    ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30).replace('.0', '')
                );

                const indexAmount = ethers.utils.parseUnits('10000', await btc.decimals());
                const pair = await pool.getPair(pairIndex);
                const lpToken = await getMockToken('', pair.pairToken);
                await mintAndApprove(testEnv, btc, indexAmount, depositor2, router.address);
                
                // uint256 k,
                // uint256 price,
                // uint256 pricePrecision

                // require(price > 0, "Invalid price");
                // require(k > 0, "Invalid k");

                // reserveA = Math.sqrt(Math.mulDiv(k, pricePrecision, price));
                // reserveB = k / reserveA;
                // return (reserveA, reserveB);

                const mathMethod: any = pair.kOfSwap.mul(_1e30).div(await oraclePriceFeed.getPrice(btc.address));
                const reserveADec = new Decimal(Math.sqrt(mathMethod));
                const reserveBDec = (new Decimal(pair.kOfSwap.toString())).div(reserveADec);

                const reserveA = BigNumber.from(reserveADec.toFixed(0));
                const reserveB = BigNumber.from(reserveBDec.toFixed(0));


                // const reserveAmount = await amm.getReserve(pair.kOfSwap, await oraclePriceFeed.getPrice(btc.address), _1e30);
                // console.log(reserveAmount.reserveA, reserveAmount.reserveB)

                const lpAmounts = await pool.getMintLpAmount(pairIndex, indexAmount, 0, await oraclePriceFeed.getPrice(btc.address));

                const afterFeeIndexAmount = indexAmount.sub(lpAmounts.indexFeeAmount);

                const poolVault = await pool.getVault(pairIndex);
                const indexProfit = await positionManager.lpProfit(pairIndex, pair.indexToken, await oraclePriceFeed.getPrice(btc.address))
                let indexTotalAmount: any;
                if (indexProfit.lt(0)) {
                    indexTotalAmount = poolVault.indexTotalAmount > indexProfit.abs() ? poolVault.indexTotalAmount.sub(indexProfit.abs()) : 0;
                } else {
                    indexTotalAmount = poolVault.indexTotalAmount.add(indexProfit.abs())
                }

                const stableProfit = await positionManager.lpProfit(pairIndex, pair.stableToken, await oraclePriceFeed.getPrice(btc.address))
                let stableTotalAmount: any;
                if (stableProfit.lt(0)) {
                    stableTotalAmount = poolVault.stableTotalAmount > stableProfit.abs() ? poolVault.indexTotalAmount.sub(stableProfit.abs()) : 0;
                } else {
                    stableTotalAmount = poolVault.stableTotalAmount.add(stableProfit.abs())
                }

                // address token
                // int256 tokenAmount
                // uint8 targetDecimals
                // uint256 price

                // indexTotalAmount * 1e10 * price / 1e0 / 1e30
                // (tokenAmount * int256(tokenWad)) * int256(price) / int256(targetTokenWad) / int256(PrecisionUtils.PRICE_PRECISION);

                // indexToken: MockERC20Token,
                // indexAmount: BigNumber,
                // decimals: number,

                // indexTotalAmount * 1e10 / 1e0 * price

                // BigNumber.from(
                //     new Decimal(indexAmount.toString())
                //         .mul((10 ** (18 - stableDec)).toString())
                //         .div((10 ** (18 - decimals)).toString())
                //         .toFixed(0),

                const indexTotalDeltaWad = (await convertIndexAmount(btc, indexTotalAmount, 18)).mul(pairPrice);
                const stableTotalDeltaWad = await convertIndexAmount(btc, stableTotalAmount, 18);
                
            
                const indexDepositDeltaWad = (await convertIndexAmount(btc, afterFeeIndexAmount, 18)).mul(pairPrice);
                const stableDepositDeltaWad = (await convertIndexAmount(usdt, BigNumber.from('0'), 18));

                const totalIndexTotalDeltaWad = indexTotalDeltaWad.add(indexDepositDeltaWad);
                const totalStableTotalDeltaWad = stableTotalDeltaWad.add(stableDepositDeltaWad);

                const totalDelta = totalIndexTotalDeltaWad.add(totalStableTotalDeltaWad);
                const expectIndexDeltaWad = totalDelta.mul(pair.expectIndexTokenP).div(1e8);

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
                const swapIndexDeltaWad = indexDepositDeltaWad.lt(needSawpInIndexDelta)? indexDepositDeltaWad : needSawpInIndexDelta;

                // console.log(needSawpInIndexDelta, totalIndexTotalDeltaWad, expectIndexDeltaWad)
                // console.log(swapIndexDeltaWad, indexDepositDeltaWad, needSawpInIndexDelta)

                // uint256 amountIn,
                // uint256 reserveIn,
                // uint256 reserveOut
                
                // if (amountIn == 0) {
                //     return 0;
                // }
        
                // require(reserveIn > 0 && reserveOut > 0, "Invalid reserve");
                // amountOut = Math.mulDiv(amountIn, reserveOut, reserveIn + amountIn);

                const amountIn =  BigNumber.from(new Decimal(swapIndexDeltaWad.toString())
                                    .mul(1e30)
                                    .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                                    .toFixed(0));
                
                const totalAmountIn = amountIn.add(reserveA);
                const swapAmountOut = amountIn.mul(reserveB).div(totalAmountIn);
                
                const slipDeltaWad: BigNumber = swapIndexDeltaWad.sub(swapAmountOut);

                console.log(slipDeltaWad)

                const slipAmount = new Decimal(slipDeltaWad.toString())
                    .mul(1e30)
                    .div(new Decimal((await oraclePriceFeed.getPrice(btc.address)).toString()))
                    .div(10 ** (18 - await btc.decimals()))
                    .toFixed(0);

                console.log('slipAmount: ' + slipAmount)
                console.log('act slipAmount: ' + lpAmounts.slipAmount)
                
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
                                [ethers.utils.parseUnits(pairPrice.toString(), 8)]
                            )
                        ],
                        {value: 1}
                    );
                
                // check Fee Amount
                expect(lpAmounts.indexFeeAmount).to.be.eq(
                    indexAmount.mul(pair.addLpFeeP).div(10 ** await btc.decimals())
                )

                expect(lpAmounts.slipAmount.add(lpAmounts.indexFeeAmount)).to.be.eq(
                    indexAmount.sub(lpAmounts.afterFeeIndexAmount)
                )

                // check slippage
                145998495311
                39773655815
                
                // console.log(indexDepositDelta, expectIndexDelta, indexTotalDelta)

                // const index = await convertIndexAmount(btc, reserveAmount.reserveA, 18)
                expect(lpAmounts.slipToken).to.be.eq(btc.address);
                // expect(lpAmounts.slipAmount)

                // check Lp Amount
                expect(lpAmounts.mintAmount).to.be.eq(
                    await lpToken.balanceOf(depositor2.address)
                )

                





            });


        })




    })
})
