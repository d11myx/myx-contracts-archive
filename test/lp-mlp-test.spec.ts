import { newTestEnv, TestEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import hre, { ethers } from 'hardhat';
import { mintAndApprove } from './helpers/misc';
import { BigNumber } from 'ethers';
import { getMockToken } from '../helpers';
import {
    convertIndexAmountToStable,
    convertStableAmountToIndex,
} from '../helpers/token-decimals';



describe('lp-mlp: Test cases', () => {
    const pairIndex = 1;
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
})
