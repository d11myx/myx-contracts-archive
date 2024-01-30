// @ts-ignore
import hre, { artifacts, deployments, ethers } from 'hardhat';
import {
    abiCoder,
    getAddressesProvider,
    getBacktracker,
    getExecutionLogic,
    getExecutor,
    getFeeCollector,
    getIndexPriceFeed,
    getOraclePriceFeed,
    getOrderManager,
    getPool,
    getPoolView,
    getPositionManager,
    getRiskReserve,
    getRouter,
    getTokens,
    waitForTx,
} from '../helpers';
import { EvmPriceServiceConnection } from '@pythnetwork/pyth-evm-js';
import { mock } from '../types/contracts';
import { getContractAt } from '@nomiclabs/hardhat-ethers/internal/helpers';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const positionManager = await getPositionManager();
    const executor = await getExecutor();
    const backtracker = await getBacktracker();
    const executionLogic = await getExecutionLogic();
    const oraclePriceFeed = await getOraclePriceFeed();
    const indexPriceFeed = await getIndexPriceFeed();
    const feeCollector = await getFeeCollector();
    const pool = await getPool();
    const poolView = await getPoolView();
    const riskReserve = await getRiskReserve();
    const addressesProvider = await getAddressesProvider();

    const { btc, eth, usdt } = await getTokens();

    // const btcOraclePrice = ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30);
    // const ethOraclePrice = ethers.utils.formatUnits(await oraclePriceFeed.getPrice(eth.address), 30);
    // const btcIndexPrice = ethers.utils.formatUnits(await indexPriceFeed.getPrice(btc.address), 30);
    // const ethIndexPrice = ethers.utils.formatUnits(await indexPriceFeed.getPrice(eth.address), 30);
    // console.log(`btc price:`, btcOraclePrice);
    // console.log(`eth price:`, ethOraclePrice);
    // console.log(`btc price:`, btcIndexPrice);
    // console.log(`eth price:`, ethIndexPrice);

    // const key = await positionManager.getPositionKey('0x180D310656bc630295Ef5Fd30bB94EE59f3e2905', 1, true);
    // console.log(await orderManager.getPositionOrders(key));

    // console.log(await pool.getVault(2));
    // const poolToken = await ethers.getContractAt('PoolToken', '0xb76d66C2fe6b4ed0694AD71B99c5466db2dA4C79');
    // console.log(await poolToken.totalSupply());
    // console.log(await pool.lpFairPrice(2, await oraclePriceFeed.getPrice(eth.address)));

    // await deployments.deploy(`UiPoolDataProvider`, {
    //     from: deployer.address,
    //     contract: 'UiPoolDataProvider',
    //     args: [addressesProvider.address],
    //     ...COMMON_DEPLOY_PARAMS,
    // });
    // console.log(await executor.positionManager());

    // console.log(
    //     await positionManager.getPositionByKey('0x0138df453dc8fef8c03945d2ff83067d12015e33000000000000000100000000'),
    // );
    // // console.log(await positionManager.getFundingFee('0xC2d0Bfc4B5D23ddDa21AaDe8FB07CC36896dCe20', 1, true));
    //

    const priceId = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
    const conn = new EvmPriceServiceConnection('https://hermes.pyth.network', {
        priceFeedRequestConfig: { binary: true },
    });
    const vaas = await conn.getLatestPriceFeeds([priceId]);
    console.log(vaas);
    // @ts-ignore
    const priceFeed = vaas[0];

    const price = priceFeed.getPriceUnchecked().price;
    const priceFeedUpdate = '0x' + Buffer.from(priceFeed.getVAA() as string, 'base64').toString('hex');
    const publishTime = priceFeed.getPriceUnchecked().publishTime;
    console.log(price);
    console.log(publishTime);

    //
    // // // console.log(
    // // //     abiCoder.encode(['uint256'], [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')]),
    // // // );
    //
    // console.log(
    //     await executor.connect(deployer).setPricesAndLiquidatePositions(
    //         ['0x2d7a41e46da01c44a5be328ce4887996d0326071', '0xc79e3a689d1ccf604f4d16ae36614b0e72b10233'],
    //         // [await oraclePriceFeed.getPrice(btc.address), await oraclePriceFeed.getPrice(eth.address)],
    //         // ['0x3ff8c9a44733e54a48170ed3839a80c46c912b00', '0x7025c220763196f126571b34a708fd700f67d363'],
    //         ['40089000000000000000000000000000000', '2223000000000000000000000000000000'],
    //         [
    //             {
    //                 token: '0xc79e3a689d1ccf604f4d16ae36614b0e72b10233',
    //                 updateData: priceFeedUpdate,
    //                 updateFee: 1,
    //                 backtrackRound: '1706167922',
    //                 positionKey: '0x07533963da0494a48a763c82359dc131a79011f0000000000000000200000001',
    //                 sizeAmount: 0,
    //                 tier: 0,
    //                 referralsRatio: 0,
    //                 referralUserRatio: 0,
    //                 referralOwner: '0x0000000000000000000000000000000000000000',
    //             },
    //         ],
    //         { value: 2, gasLimit: 5000000 },
    //     ),
    // );

    // 787.864139;
    // 4383976028;
    // -1019.478317
    // await executor.setPricesAndLiquidatePositions(
    //     ['0x3fF8C9A44733E54a48170ed3839a80C46C912b00', '0x7025c220763196F126571B34A708fD700f67d363'],
    //     [3896940250000, 221977000000],
    //     [],
    // );

    //[{"value":[{"value":"0x3ff8c9a44733e54a48170ed3839a80c46c912b00","typeAsString":"address"},{"value":"0x7025c220763196f126571b34a708fd700f67d363","typeAsString":"address"}],"typeAsString":"address[]","componentType":"org.web3j.abi.datatypes.Address"},{"value":[{"value":42335000000000000000000000000000000,"bitSize":256,"typeAsString":"uint256"},{"value":2516000000000000000000000000000000,"bitSize":256,"typeAsString":"uint256"}],"typeAsString":"uint256[]","componentType":"org.web3j.abi.datatypes.generated.Uint256"},{"value":[{"value":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2bM6nvA=","typeAsString":"bytes"},{"value":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOpmcI9A=","typeAsString":"bytes"}],"typeAsString":"bytes[]","componentType":"org.web3j.abi.datatypes.DynamicBytes"},{"value":[{"value":[{"value":0,"bitSize":256,"typeAsString":"uint256"},{"value":0,"bitSize":8,"typeAsString":"uint8"},{"value":0,"bitSize":256,"typeAsString":"uint256"},{"value":0,"bitSize":256,"typeAsString":"uint256"},{"value":"0x0000000000000000000000000000000000000000","typeAsString":"address"}],"typeAsString":"(uint256,uint8,uint256,uint256,address)","componentType":"org.web3j.abi.datatypes.Type"}],"typeAsString":"(uint256,uint8,uint256,uint256,address)[]","componentType":"org.web3j.abi.datatypes.StaticStruct"}]

    // console.log(await positionManager.needADL(1, true, 765000000, 4292587250000));
    // console.log(await executor.updatePositionManager(positionManager.address));

    // console.log(
    //     await router.estimateGas.createIncreaseOrder(
    //         {
    //             pairIndex: 1,
    //             isLong: true,
    //             tradeType: 0,
    //             account: '0x9335264956af1e68579cdef0f5c908f1668dde3f',
    //             collateral: '890146900',
    //             sizeAmount: '100000000',
    //             openPrice: '42877860000000000000000000000000000',
    //             maxSlippage: '300000',
    //             paymentType: 0,
    //             networkFeeAmount: '15000000000000000',
    //         },
    //         { value: '15000000000000000' },
    //     ),
    // );

    // console.log(await oraclePriceFeed.getPrice(btc.address));
    // console.log(ethers.utils.parseUnits(ethers.utils.formatUnits(price, 8), 30));
    // const { depositIndexAmount, depositStableAmount } = await poolView.getDepositAmount(
    //     1,
    //     ethers.utils.parseEther('50'),
    //     ethers.utils.parseUnits(ethers.utils.formatUnits(price, 8), 30),
    // );
    // const wallet = new ethers.Wallet(
    //     'd0d53b4c99b1be944f8caa0dee8c0dee572e44df542ac23f42dc66d5d42fc6fd',
    //     deployer.provider,
    // );
    // await waitForTx(await btc.connect(wallet).approve(router.address, depositIndexAmount));
    // await waitForTx(await usdt.connect(wallet).approve(router.address, depositStableAmount));
    // console.log(
    //     await router
    //         .connect(wallet)
    //         .addLiquidity(
    //             btc.address,
    //             usdt.address,
    //             depositIndexAmount,
    //             depositStableAmount,
    //             [btc.address],
    //             [priceFeedUpdate],
    //             [publishTime],
    //             { value: 1 },
    //         ),
    // );
    // console.log(
    //     await router
    //         .connect(wallet)
    //         .addLiquidity(
    //             '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    //             '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    //             '0',
    //             '1000000',
    //             ['0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'],
    //             [
    //                 '0x504e41550100000003b801000000030d0210b3aaf0f3b487444927e8853c0ab635bfdce174d965e11b52893aa33bc5298b75e63d52bf9b5ba1418d084e96ef8437e14d6ae58a332f55353640bd0f0e862a01035f1f459783666b9ecf9e49c8322cf102ff50ac277247a00740e354327089896c1ffcf2900c275efa76e71e6535ba25f7efc77295bb86a1d9336a7235fd17b53a01041631186a9874e309d10769d7d16b0111c68aeec339a72b4cc115e8e4c91595ec41e57e80fd7320f2b6f7f6c231781d352c887f8bf0fcfc9d798c6708cdfd120100060a3258c42d2701e5d85acfe69cb0755e51f5054b4022cdd2661b13c3fdcce2824c5d930e885527716896dcff0c096b451937f607b65d8e5379f37ec71a184d50010723d1ffb446feb33b37ed9a344cfee53c50d74cc719cf51ebb6a4b0cbb2b14d094f3843850193339537a06fba98b7dcfe60d5866037ab259691932ce779e14661000842da8b263a4e5d80862ad24cdc0af4e30d36759b457ff5fe38c0976f82af8a4254d9c4266543a26724156ac2b64048a3c5873792fba662a4fb542b41329ef3a4000afbecc43951289178738e6e17619fa518ffe00eaf7386fe069a551aa3481490126adb5d6e08d7b332ec9441a330b223dc708077f0f0eb6e268dcffcbe692347b2010b59f816846d44709641a755cd60900bc40b3600df6636f6d3cd29af768ca02ad406e26f04efd1e9862f82ff33fdd87c21d5c8a96d4c76ac32ac512d9e3bc75da7000d284d4aa8732558a99036ed41854415cbad6e78a1647e19cb353a756b2ac4738a57db27b3a5bc36c83b03264bff381df865df8565dba656cf2956a436c0a7f989000e8e78ee151a3681618a9b7a5ca373213702b779f156884b6e1195bba578e3d2350d9cdce78c7ae952d87b5ee986a21a22e606159b0dd3a1359a6936af1823e4c2010f710a55296d73c136a8499b9f5c22f79932d53d3a74d6b2a68fecfb026e66a086448f0483a7664adb2027cea7f8462b29bb3b13e575d648a710be9c8b03083b9b0010a8ddf78a27a7ce8173e08bad1dce5aafbe0cec39a2903b5950ecc00fe1ca156e5e3d871dbae61b62292f55e24ccf5fa7e13981dccdf46cf188ab1a2980166ef80112671cf8c40b1f2574ff353efdc90a7364f402e672370a788ddc31be971721e17c073614fb79ea690261eabfe5f4c393a991a34aed4c83539c2d1c8396ef0865e40065b89f3d00000000001ae101faedac5851e32b9b23b5f9411a8c2bac4aae3ed4dd7b811dd1a72ea4aa7100000000024b79be0141555756000000000007535f3f000027102b8fbbcf80d499d8e237f33b15abbfd3445c465801005500e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43000003f1003190d000000000755a5f76fffffff80000000065b89f3d0000000065b89f3d000003f2868f30a0000000008bad5f300acc59cbdfa03fa146bfc99b4263180f1cf8fa8f5108986364030fb0ceb9756885c6cf567d8b59a59554c606df97d62d849fc325776597093629e04fbc686012fd2c53bbc7bd53514d0592875e72380efa9382f391cc60e2e9a698d1f08f0ef88b3741ddea45cebb0f72be4b120369b54923420ab22b027843d551476a4d8d92cdf61e0ecca56b8b50e3a1f9532906d7bb83030daa14702899cfa3467fb01e40aff06e0d68075f0db2c57676f6efdaddc9ed4d06c8640324afffcd82db8b9041d90fac61efb9a8bece',
    //             ],
    //             [1706598205],
    //             { value: 1 },
    //         ),
    // );
    // console.log(await router.ADDRESS_PROVIDER());
    // console.log(await (await getAddressesProvider(await router.ADDRESS_PROVIDER())).priceOracle());
    // const pythOraclePriceFeed = await ethers.getContractAt(
    //     'PythOraclePriceFeed',
    //     await (await getAddressesProvider(await router.ADDRESS_PROVIDER())).priceOracle(),
    // );
    // console.log(`pyth: `, await pythOraclePriceFeed.pyth());
    // console.log(`priceFeedUpdate: `, priceFeedUpdate);
    // console.log(`publishTime: `, publishTime);
    // console.log(await pythOraclePriceFeed.tokenPriceIds(btc.address));
    // // console.log(await pythOraclePriceFeed.updatePrice([btc.address], [priceFeedUpdate], [publishTime], { value: 1 }));
    //
    // const pyth = await ethers.getContractAt('IPyth', await pythOraclePriceFeed.pyth());
    // console.log(
    //     await pyth.updatePriceFeedsIfNecessary(
    //         [priceFeedUpdate],
    //         ['0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43'],
    //         [publishTime + 3000],
    //         { value: 1 },
    //     ),
    // );

    // console.log(
    //     abiCoder.encode(['uint256'], [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')]),
    // );

    // await router.updateAddLiquidityStatus(1, true);
    // await router.updateAddLiquidityStatus(2, true);
    // await router.updateRemoveLiquidityStatus(1, false);
    // await router.updateRemoveLiquidityStatus(2, false);
    // console.log(await router.operationStatus(1));

    // await waitForTx(await router.updateOrderStatus(1, false));
    // console.log(await router.getOperationStatus(1));

    // console.log(await positionManager.getPosition('0x048B3Ad345f51D250C3e7935FafC73519C571D86', 1, true));
    // console.log(await positionManager.getPosition('0x048B3Ad345f51D250C3e7935FafC73519C571D86', 1, false));

    // const uiPositionDataProvider = await getUiPositionDataProvider();
    // console.log(
    //     await uiPositionDataProvider.getPositionsData(
    //         '0xD6074c46938080F16E84125fb8e8f0d87dDA229d',
    //         '0x8773119561b15f779B31B6aEC1e6ee8f44862785',
    //         '0xbf3CCE2Ee68a258D0bA1a19B094E5fc1743033ed',
    //         [1, 2],
    //         ['42681535000000000000000000000000000', '2549502500000000000000000000000000'],
    //     ),
    // );
    // console.log(await positionManager.getPosition('0x0de8de69e832335b2a490ad2f1249a22b407ef9e', 1, true));

    // const wallet = new ethers.Wallet(
    //     '0xb964f175bc281f0e04f3d1bff052abd42b36cadba3ed8b75be9c617387c2b16d',
    //     deployer.provider,
    // );
    // console.log(
    //     await executor.connect(wallet).setPricesAndExecuteIncreaseMarketOrders(
    //         ['0x3fF8C9A44733E54a48170ed3839a80C46C912b00', '0x7025c220763196F126571B34A708fD700f67d363'],
    //         [await oraclePriceFeed.getPrice(btc.address), await oraclePriceFeed.getPrice(eth.address)],
    //         [
    //             abiCoder.encode(
    //                 ['uint256'],
    //                 [(await oraclePriceFeed.getPrice(btc.address)).div('10000000000000000000000')],
    //             ),
    //             abiCoder.encode(
    //                 ['uint256'],
    //                 [(await oraclePriceFeed.getPrice(eth.address)).div('10000000000000000000000')],
    //             ),
    //         ],
    //         [
    //             {
    //                 orderId: 7,
    //                 tradeType: TradeType.MARKET,
    //                 isIncrease: true,
    //                 tier: 0,
    //                 referralsRatio: 0,
    //                 referralUserRatio: 0,
    //                 referralOwner: ZERO_ADDRESS,
    //             },
    //         ],
    //         { value: 2 },
    //     ),
    // );

    // console.log(await pool.getVault(1));

    // await orderManager.updateNetworkFees(
    //     ['0', '1', '0', '1'],
    //     ['1', '1', '2', '2'],
    //     [
    //         {
    //             basicNetworkFee: '10000000000000000',
    //             discountThreshold: '200000000',
    //             discountedNetworkFee: '5000000000000000',
    //         },
    //         {
    //             basicNetworkFee: '5000000',
    //             discountThreshold: '200000000',
    //             discountedNetworkFee: '2000000',
    //         },
    //         {
    //             basicNetworkFee: '100000000000000',
    //             discountThreshold: '2500000000000000000',
    //             discountedNetworkFee: '50000000000000',
    //         },
    //         {
    //             basicNetworkFee: '5000000',
    //             discountThreshold: '2500000000000000000',
    //             discountedNetworkFee: '2000000',
    //         },
    //     ],
    // );

    // console.log(await orderManager.getNetworkFee(1, 1));

    // const uiPoolDataProvider = await getUiPoolDataProvider('0xf5E571e5B44aF230FB100445D83Dbf336162a74A');
    // // console.log(await oraclePriceFeed.getPrice(btc.address));
    // console.log(
    //     (
    //         await uiPoolDataProvider.getPairsData(
    //             pool.address,
    //             poolView.address,
    //             orderManager.address,
    //             positionManager.address,
    //             router.address,
    //             [1, 2],
    //             [await indexPriceFeed.getPrice(btc.address), await indexPriceFeed.getPrice(eth.address)],
    //         )
    //     )[0].networkFees[1],
    // );

    // let index = 1;
    // setInterval(async () => {
    //     console.log(`index: ${index}  ${await pool.getVault(1)}`);
    //     index++;
    // }, 2000);

    // console.log(
    //     await positionManager.getPositionByKey(
    //         '0x' + 'dff4cfe4d659f7296941cbe543f6766ae9aa3e0c5ee922d6a9a638de954c0ba0',
    //     ),
    // );

    // await deployments.deploy(`UiPositionDataProvider`, {
    //     from: deployer.address,
    //     contract: 'UiPositionDataProvider',
    //     args: [addressesProvider.address],
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    // await deployer.sendTransaction({
    //     to: '0x44C140E06D710Df2727AD7c13618869ec34364Ea',
    //     value: ethers.utils.parseEther('100000'),
    // });
    console.log(await usdt.mint('0xAb2aaB9D9d85e19891F0500b6d600c2b5d04890A', ethers.utils.parseUnits('100000', 6)));
    // console.log(btc.address);
    // console.log(await btc.owner());
    // console.log(await btc.mint('0xed2339eec9e42b4CF7518a4ecdc57BA251e63C74', ethers.utils.parseUnits('1000000', 8)));

    // console.log(await pool.getVault(1));
    // console.log(await pool.getVault(2));
    // console.log(await riskReserve.getReservedAmount(usdt.address));
    //
    // console.log(await pool.feeTokenAmounts(usdt.address));

    // for (let i = 0; i < 10000; i++) {
    //     console.log(
    //         `当前价格: `,
    //         new Decimal(ethers.utils.formatUnits(await oraclePriceFeed.getPrice(btc.address), 30)).toFixed(5),
    //     );
    //     // @ts-ignore
    //     console.log(`LP持仓方向: `, (await positionManager.getExposedPositions(1)) < 0 ? '多' : '空');
    //     console.log(
    //         `LP持仓价格: `,
    //         new Decimal(ethers.utils.formatUnits((await pool.getVault(1)).averagePrice, 30)).toFixed(5),
    //     );
    //     console.log(
    //         `LP盈亏: `,
    //         new Decimal(
    //             ethers.utils.formatUnits(
    //                 await positionManager.lpProfit(1, usdt.address, await oraclePriceFeed.getPrice(btc.address)),
    //                 6,
    //             ),
    //         ).toFixed(5),
    //     );
    //     console.log('------------------------------------------');
    //     await sleep(1000);
    // }

    // console.log(await oraclePriceFeed.getPrice(btc.address));
    // console.log(await positionManager.lpProfit(1, usdt.address, await oraclePriceFeed.getPrice(btc.address)));

    // await deployments.deploy(`${EXECUTION_LOGIC_ID}-V2`, {
    //     from: deployer.address,
    //     contract: 'ExecutionLogic',
    //     args: [
    //         addressesProvider.address,
    //         pool.address,
    //         orderManager.address,
    //         positionManager.address,
    //         feeCollector.address,
    //         60 * 5,
    //     ],
    //     ...COMMON_DEPLOY_PARAMS,
    // });

    // var executionLogic1 = await getExecutionLogic('0xc85D5e8Dfa43fC31Bf12bF517E02e0d2381C0058');
    // await executionLogic1.updateExecutor(executor.address);
    //
    // await hre.run('time-execution', {
    //     target: addressesProvider.address,
    //     value: '0',
    //     signature: 'setExecutionLogic(address)',
    //     data: encodeParameters(['address'], ['0xc85D5e8Dfa43fC31Bf12bF517E02e0d2381C0058']),
    //     eta: Duration.seconds(10)
    //         .add(await latest())
    //         .toString(),
    // });

    // console.log(await executionLogic.maxTimeDelay());
    // console.log(await executionLogic.updateMaxTimeDelay(20 * 60));

    // console.log(await pool.lpFairPrice(2, '2060738556470000000000000000000000'));

    // const pythOraclePriceFeed = await getOraclePriceFeed();
    // console.log(`pythOraclePriceFeed:`, pythOraclePriceFeed.address);
    // const priceFeed = await ethers.getContractAt('PythOraclePriceFeed', pythOraclePriceFeed.address);
    // console.log(await priceFeed.pyth());
    //
    // console.log(await priceFeed.tokenPriceIds(btc.address));
    // console.log(await priceFeed.tokenPriceIds(eth.address));

    // console.log(await priceFeed.getPrice(btc.address));
    // console.log(await priceFeed.getPrice(eth.address));
    // await waitForTx(await priceFeed.updatePythAddress('0xdF21D137Aadc95588205586636710ca2890538d5'));
    //
    // await waitForTx(
    //     await priceFeed.setTokenPriceIds(
    //         [btc.address, eth.address],
    //         [
    //             '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    //             '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    //         ],
    //     ),
    // );

    //
    // const poolToken = await ethers.getContractAt('PoolToken', '0xB220A53E4E1b5B99BCFc8a6CF300a3276976f4a8');
    // await hre.run('time-execution', {
    //     target: poolToken.address,
    //     value: '0',
    //     signature: 'setMiner(address, bool)',
    //     data: encodeParameters(['address', 'bool'], [deployer.address, true]),
    //     eta: Duration.hours(13)
    //         .add(await latest())
    //         .toString(),
    // });

    // curl -X POST --data '{"jsonrpc":"2.0","method":"hardhat_setBalance","params":["0x2068f8e9C9e61A330F2F713C998D372C04e3C9Cc","0xde0b6b3a7640000"],"id":1}' https://pre-rpc.myx.cash
    // const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    // for (let signer of signers) {
    //     // await hre.network.provider.send('hardhat_setBalance', [signer.address, '0xde0b6b3a7640000']);
    //     // console.log(
    //     //     `curl -X POST --data '{"jsonrpc":"2.0","method":"hardhat_setBalance","params":["${signer.address}","0xde0b6b3a7640000"],"id":1}' https://pre-rpc.myx.cash`,
    //     // );
    //     console.log(
    //         signer.address + '_' + ethers.utils.formatEther(await deployer.provider.getBalance(signer.address)),
    //     );
    // }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
