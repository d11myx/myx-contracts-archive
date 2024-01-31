// @ts-ignore
import hre, { artifacts, deployments, ethers } from 'hardhat';
import {
    abiCoder,
    COMMON_DEPLOY_PARAMS,
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
    getRoleManager,
    getRouter,
    getTokens,
    ROUTER_ID,
    TradeType,
    waitForTx,
    ZERO_ADDRESS,
} from '../helpers';
import { EvmPriceServiceConnection } from '@pythnetwork/pyth-evm-js';
import { mock } from '../types/contracts';
import { getContractAt } from '@nomiclabs/hardhat-ethers/internal/helpers';
import { deploy } from '@openzeppelin/hardhat-upgrades/dist/utils';
import { string } from 'hardhat/internal/core/params/argumentTypes';

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

    const btcPriceId = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
    const ethPriceId = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';
    const conn = new EvmPriceServiceConnection('https://hermes.pyth.network', {
        priceFeedRequestConfig: { binary: true },
    });
    const btcPriceFeeds = await conn.getLatestPriceFeeds([btcPriceId]);
    const ethPriceFeeds = await conn.getLatestPriceFeeds([ethPriceId]);
    // console.log(btcPriceFeeds);
    // @ts-ignore
    const btcPriceFeed = btcPriceFeeds[0];
    const btcPrice = btcPriceFeed.getPriceUnchecked().price;
    const btcPriceFeedUpdate = '0x' + Buffer.from(btcPriceFeed.getVAA() as string, 'base64').toString('hex');
    const btcPublishTime = btcPriceFeed.getPriceUnchecked().publishTime;

    // @ts-ignore
    const ethPriceFeed = ethPriceFeeds[0];
    const ethPrice = ethPriceFeed.getPriceUnchecked().price;
    const ethPriceFeedUpdate = '0x' + Buffer.from(ethPriceFeed.getVAA() as string, 'base64').toString('hex');
    const ethPublishTime = ethPriceFeed.getPriceUnchecked().publishTime;

    // console.log(price);
    // console.log(publishTime);

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

    // const art = await deployments.deploy(`${ROUTER_ID}-v9`, {
    //     from: deployer.address,
    //     contract: 'Router',
    //     args: [addressesProvider.address, orderManager.address, positionManager.address, pool.address],
    //     ...COMMON_DEPLOY_PARAMS,
    // });
    // const routerV2 = await getRouter(art.address);
    //
    // const { depositIndexAmount, depositStableAmount } = await poolView.getDepositAmount(
    //     2,
    //     ethers.utils.parseEther('10'),
    //     ethers.utils.parseUnits(ethers.utils.formatUnits(price, 8), 30),
    // );
    // const wallet = new ethers.Wallet(
    //     'd0d53b4c99b1be944f8caa0dee8c0dee572e44df542ac23f42dc66d5d42fc6fd',
    //     deployer.provider,
    // );
    // // console.log(usdt.address);
    // console.log(depositIndexAmount);
    // // console.log(depositStableAmount);
    // // console.log(await usdt.balanceOf(wallet.address));
    // // await waitForTx(await eth.connect(wallet).approve(router.address, depositIndexAmount));
    //
    // console.log(await wallet.getBalance());
    // console.log(await addressesProvider.WETH());
    // console.log(eth.address);
    // await waitForTx(await usdt.connect(wallet).approve(routerV2.address, depositStableAmount));
    // console.log(
    //     await routerV2
    //         .connect(wallet)
    //         .addLiquidityETH(
    //             eth.address,
    //             usdt.address,
    //             depositIndexAmount,
    //             depositStableAmount,
    //             [eth.address],
    //             [priceFeedUpdate],
    //             [publishTime],
    //             1,
    //             { value: depositIndexAmount.add(10) },
    //         ),
    // );

    // console.log(await router.connect(wallet).wrapWETH(wallet.address, { value: 2 }));

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

    console.log(await feeCollector.stakingTradingFee());

    await feeCollector.claimTreasuryFee();
    console.log(await feeCollector.treasuryFee());

    console.log(await pool.getVault(2));

    interface K {
        prikey: string;
        addr: string;
    }
    const keepers: K[] = [
        {
            prikey: '0xe9ddfb253ba48aad65b202fca613796ebe28bdfc0a6f06d42e83e72cc613127d',
            addr: '0x57E70053319297E34c0B38A50F8B9E0e4D52b703',
        },
        {
            prikey: '0x7a20fa7f8c109f92f3761b663bfd8fdb90099d00aba58460a20c94171084b79a',
            addr: '0x4BF0af1deeEbCCA7AB4E56f9d25e37023bd82BeA',
        },
        {
            prikey: '0x9c9e88514fec34bc18117ab06a4ac55403e230fc64e43f2f7607622a71a6abfb',
            addr: '0x48dfCB49aB855f531Ec6b3b5e87dCc754595d926',
        },
        {
            prikey: '0x449a69d4f0bc97e8f42cbfd9a86e8bbc738f48760ff212d2df22718b06f05b32',
            addr: '0xC84ECdbDD5D369bF6Ee6E5479112F6860E9C2a6D',
        },
        {
            prikey: '0x4df388e826cf9119b061f0749c86846b0391653db589ab356490c8e0c24f567d',
            addr: '0xD12e0173F2950df675071a1db47F9A07d9670B92',
        },
        {
            prikey: '0x414b15472f6fe51fd0c6bb805906ec201906fc2d8cef1495de445488e9e6ebf6',
            addr: '0x54DfE50b305f3E2AE74e04f448B399D9c36b0F8e',
        },
        {
            prikey: '0x0a8dfe6076d0227d74100891f13cddd0d2360122b392e8cdd3edf66356c8766a',
            addr: '0xd252B5298f9baC0af8CE4E7CB82E082dE3878628',
        },
        {
            prikey: '0x2352ac145b15bcfc9a6e37caa975707b9a13d6768a45f244f84059814fa82349',
            addr: '0x8CE2f46a71283C76ABE9ad33271AFE50F1147f5e',
        },
        {
            prikey: '0x615109ba705c6cf21a15b986a8697966c464268247009f6ae5e559b0071c5900',
            addr: '0xa96D64ba3b0D8D3Ec35560F20EB10F857942D01B',
        },
        {
            prikey: '0xe97c5c3919b9b9b1c3975649a6ab037d6946d0d8084b94213e96f205b88ec574',
            addr: '0xB1e39211aE24f38857C252487a40b318e4159F9A',
        },
        {
            prikey: '0x030c1dcca3cea8bff236111af846d22b5671b698c981696e721eeda443aba931',
            addr: '0x8EDA028171900dF1129E6dC01eF1c93019455156',
        },
        {
            prikey: '0x1651a2ddce15b855559132e71c2ecf6deab8a8fd9146db6e6adb84c9dc54c040',
            addr: '0xe33224312832E780586C9aF43a29a1eeaD4A50E4',
        },
        {
            prikey: '0x38525251bd13158d79b52f3c3e5d3147ff63d2790b7be00c25ebcb854d415cdc',
            addr: '0xE14E65c6192175Bd72A475198C716E8e9f6A1b9D',
        },
        {
            prikey: '0x2c1813f53f4a059f2fd266d5d617b7eea714c22437d8f9a51f2aaa4db8f239a2',
            addr: '0x14B9Ef347206bc095A40AE6B73330539fe7440bc',
        },
        {
            prikey: '0xa673baad2505966150f935eaf21ff340b8d74d4c0254e25fa0f52f51ce5d81bb',
            addr: '0xBbbbbBA0A9e8C8C4EBDD88C6ec5A907826a3C7F6',
        },
        {
            prikey: '0x35ed6b22b70a97dba595bf7dc5086a617d3adb29dd4c77cb4f0d660a1515ea81',
            addr: '0xcd9b15167902A0C3b4750c13Aea0983EaFABc02A',
        },
        {
            prikey: '0x7162454d6f047ef47c24649c624f1c291fdf021da5bc4a1ede7af276ba1b450e',
            addr: '0x312aceD188D8fd8dfC73552094B90676ca5E55fb',
        },
        {
            prikey: '0x0ab906e08b299580fde2ff28611c31decc00ec23c09740f283d859ac07e9c652',
            addr: '0x465D662C4dcf2f4f4a047BE1AbDD5551100C124E',
        },
        {
            prikey: '0xae37479bff5b3b184124e8cdb57373c67ba6b4b64aefd8dcc81121f0b3484934',
            addr: '0x7f6Bd4908ae2b61b7e88F3e7Ec51C77456aD7f2C',
        },
        {
            prikey: '0x7bbe1508cf9ba34c24e87d767b9498fa759ffee747ef3e808c1912c941a245af',
            addr: '0x34660d8FB093821A51EC36C1A57e2bdD743dc541',
        },
        {
            prikey: '0x925ee3c6836a555182d910f587236fa3cf2e4878eafbedc7629f0d3702af9c21',
            addr: '0x3c628d2Ac2d57b1b7B09d7b610187fb94f6543Fa',
        },
        {
            prikey: '0x0b1a86fc541d1b14210d972f2b72124416e8495340aa5272009d15a25c11101e',
            addr: '0x2E83649fda7eC71a459c96c82b45032aD9678Db6',
        },
        {
            prikey: '0xfa76ba7d744e69db0c4d313c835c8386f18d8596fb238081d7b238213f057bce',
            addr: '0x5a39686BdC40C279677E9548eB9F49558c7670Ba',
        },
        {
            prikey: '0x875fd8c99a3bb0ff907ea789334e40aaeffc957cfdd6582b9fe555a21ccf1c1e',
            addr: '0x0C6cDF6E0FB67C8989428e8e9B3BE5851f3911c7',
        },
        {
            prikey: '0x77c757fec6cc5578eebed0a464e799e8dcb6c7557c636e0e51dfdea8a24bfc77',
            addr: '0xf0CAb5356b14d1aa2844E595d95eFF997bFDfF0E',
        },
        {
            prikey: '0xb35b1a6ddc86d9c86b9675e6c3c97236c4e3c98cb0eb5d6a0fd292ed987f2563',
            addr: '0x2BD098280a8b0Ce00155115Da0983C142b472704',
        },
        {
            prikey: '0xc599ae807f0a1d7498289df08c9659034c3dd7af3f3bddf44ce4f5978d7d1dcd',
            addr: '0xfBFEC9e68247492803B53325D99cA36b7bC615c9',
        },
        {
            prikey: '0x442eaf5a00d571393a65b7727348154ad2a0d412e1adc6da7be496576b414dd0',
            addr: '0x01e785480Cd9bb2DcE5B13586950Bc6efb4F51FB',
        },
        {
            prikey: '0x0476db0d7d08e49ea8616cf58f5d6e181f4cf9fd76d18dc845094dfcda8cb807',
            addr: '0x12bf841918A5d12eff97eA3B250Eb4dD1ab9BDDB',
        },
        {
            prikey: '0xe796f040df3ac2131b56b55199406dac626ac881c8f6dfd232d98f85256cf22e',
            addr: '0xd16C506Fc6340AC224B0409c370272ba708315aF',
        },
        {
            prikey: '0x47eb5aa3ad94ff33a554ce8bf58db8f9df5e54712b9fa61a3bb0fb7dad7de6f4',
            addr: '0xB311cE2707e892ed5CCb9ADF0bc2A4Aa5c763dC9',
        },
        {
            prikey: '0xabd59c173b9eb94ec39fd3bf505205cf193c4d08386ddc32e7ba6df55e846484',
            addr: '0x3F788d0eC3d1109566830a1f642E9CF04bD623A7',
        },
        {
            prikey: '0x0b811f16cf2599022ebfc2d4653d777b042abe2868e1cca29945d0dd2d8c5bf3',
            addr: '0x8C17890442Dc57BF63f515ffB3b6fFF53c1947dB',
        },
        {
            prikey: '0xf1ceddaff0fbc07a46be58a18f4b791364702d3fa8ac0a36a2c0743b58a12c35',
            addr: '0x3731cdEc34eA238A619D174BdB165323a10F778b',
        },
        {
            prikey: '0x5083478d5c8692e4c35794f807d02f3f01abc668bc03b364d14a422f22eb0068',
            addr: '0x466617C6D901FdD82668A2237B613aa2424Ca403',
        },
        {
            prikey: '0x1f3e78417c1dec836dc994fb5c94a7035ab99803dfa260e762b8255eefa7e469',
            addr: '0xF62DC866B4dbe0fd9b1171AeC091bA29866b3D5B',
        },
        {
            prikey: '0x4ec3d6c278bc22238554611b048537bb171267ad1ac1705231f8b3d871503e10',
            addr: '0x7a7B134df987850A7185668f7dF9e0220aa144CD',
        },
        {
            prikey: '0x8d4799c942bb937775007817b319b668f58ea00940a4d841e577a9b6ad04a5ad',
            addr: '0x8E250c61c5779924B67b3c103313928DfF1e9F1e',
        },
        {
            prikey: '0x042a9729f08f8550eef2b4faad2f822724b79fcf1c305273580927ec4beb865c',
            addr: '0xE11014fC8647E1Ff8869855dd095D6dEaB8Ad33f',
        },
        {
            prikey: '0xd48324430850a23091bdb8779925be795f8a9696051c076c3613b1584e84c5a4',
            addr: '0xeA053594787ee5456bCF2B8173A4144502A50799',
        },
        {
            prikey: '0x9e9d216f5581eb157a9d1720b7868fa3ddd7959304c88797ca29fd65f01686a8',
            addr: '0x7DF2dbCc5cFFa8AbAb01bB1D70f6E99ccb4D7064',
        },
        {
            prikey: '0xddf0cf3141076172fcb6e4913744f372edac21f070937354e95bdcd874c41bc2',
            addr: '0xAfB811E26c42F16aa5ae423D2D598037592E7cBC',
        },
        {
            prikey: '0x21b133cad35f593569686cacab97f6f0a1aafabb9f7b0cf826a567c602687e08',
            addr: '0x7fe235ad34ee5c94E0485b515f0a34567faD801c',
        },
        {
            prikey: '0x2a68acf04d736f866c6a009a27eae8ef8891c3b907a395774f814e781f36fb7f',
            addr: '0x035Cc85b1ea31eC6389afBCB5336819f4028C439',
        },
        {
            prikey: '0xf4c7ece97d41a86410961ffa2f321334d1651b3ac8232446d1170e64754a4c04',
            addr: '0x814346C06283CB8f5AEf8414Bd6Efef01e4700c2',
        },
        {
            prikey: '0x5ede088a7a2eb53ffba61171d10bb60c82520a0455ae38f814d1b950e348274b',
            addr: '0xf5d284Ea6D956027cf5E887f2827f56Bb185FD42',
        },
        {
            prikey: '0x04e98b716c2bf65ded1a6b7603da7a90f31e2782b47bd25da1d208b1d2de4106',
            addr: '0x63123cA1498c161657612e8CaDe116B13CA73f82',
        },
        {
            prikey: '0x45dd47fcb20169b1a67d9eb287b94735bb00eb391daa8be463dc0573e9aa4223',
            addr: '0x45ce32692cb7EF6e6c4A5f96DF0D16785225Dda5',
        },
        {
            prikey: '0x9e74f4dfe4e6674ebc990c5c3231b4d1a8113dc107fbe95724ed4c2e142c7c3e',
            addr: '0x9Ab4f8eB44115b7358647E283575Ad4231892868',
        },
        {
            prikey: '0x92361d9fd8f823136400a543141d8a751ddb4a25c46310c1ae268fdf9a300765',
            addr: '0xE51E20e2427eC82feA2E78F08695F9974bcE1369',
        },
        {
            prikey: '0x4510cbcc5b65436544e66ed733a5bebaea6556d2101eb19c291525017561f8a1',
            addr: '0x745a4A89806f1d459e4DFe7FE2A1F152741518Ae',
        },
        {
            prikey: '0xf544e0f67ca51798a40e05a6d69782ff8aeec35ac38883b5f6debea20ef8b7e3',
            addr: '0x023DC53aebf1a839e8523daA5604CDa2ACb4dC3f',
        },
        {
            prikey: '0x0ad1dc61879624b35bf25763eae539319d1a5cfeaa944fef2cbc8b028390dc0a',
            addr: '0xf8EC5837446F0605D137091Ef02F7d30680Cd113',
        },
        {
            prikey: '0xf36d5db5a8497b80bae39c4d39dee6d12c67078c595ce10b4683ddcd7c550e17',
            addr: '0xd7e78bb133d5e20D6289dac68a1667Ca5Ce6555f',
        },
        {
            prikey: '0x5c9ef5d80ae955c291e057d2588643cd8293e90431ec9a1d27d99f77ef8c09d3',
            addr: '0x8eC313D4281f4A5430cb37680D1CacB2EF7aBa68',
        },
        {
            prikey: '0x3a274b5644d8550d60a2ccc2cb8cd4fd703a2618f79e04afe1ca6ecf8d10b87b',
            addr: '0x22147dc27f6703aCDFf7979a2c7Ed20421c1badE',
        },
        {
            prikey: '0xf6a3f3e3e0bd5fd89a47dbe5ccc3ca0ce8fb512c6dc2ae88f14ea890512186db',
            addr: '0xF69e9208b64F363Ce6033731ACAA5bBC22741d0D',
        },
        {
            prikey: '0x470afd606244fc1cc4a37cf4c6ff1e53b630e4df7e1a40ff1190424ee1eb3e98',
            addr: '0xf44db96ae1b5DcEd73E3D43Db2aE39151C72DDC5',
        },
        {
            prikey: '0x9ccc763a862bfec560de6bd9b840f2ff7006ba646a07e4fae907a1d780d4d187',
            addr: '0x592c6a2aCd40ED7A916C88Fcc3606F1041E1F59f',
        },
        {
            prikey: '0xfa2c21939672b73386075cd01fbdf3320786263d83cef24c005b45fb27b7e5cb',
            addr: '0xD224d0D2CCFbeb1f1eE2a1202D6B8E4c472322b6',
        },
        {
            prikey: '0x02f19caf6cbba1a71bbf600a8b2bd9d16de56d7c9b7e543c656ccd1a11dcdbae',
            addr: '0x57D8312c48e2a87d2F516aB172C4b9401cb625DA',
        },
        {
            prikey: '0xa24ef8871bd3d4ff9472bc9f7448206389272ca9c67024dcdba46ced199a5fe0',
            addr: '0x0Bfc3B8f10B94F263ACECDC0191238e0E3F41102',
        },
        {
            prikey: '0x8ba0d7b4d2762ee5ddcec49d2dae23537ad3a7a446f3b22afec078b9c1bdb5c4',
            addr: '0x3A79a52634c3b9876A71Ff4341048C94CA7ADE4b',
        },
        {
            prikey: '0xf5a01e36242362a68b2520a0fc0ef06a9d7ae83ac4c2504ad487f2a5501d87b6',
            addr: '0x744D71D44bb8B560B4176cA9513d5AA9dE8651ee',
        },
        {
            prikey: '0xce23c514056411164860e5134db994be16c9f9f6c84853511478e4b88aa78a7b',
            addr: '0x874F8F2807e017a1a6849A390f870a09d9BE23e0',
        },
        {
            prikey: '0x4a0e31cfd562dfcff42df5d4852e371220dcc8c6d1c34ddf34d12df5e5ad688b',
            addr: '0xf2302305B8F7B2145909f6F7ABf7285db7a855fd',
        },
        {
            prikey: '0xea9c382f96d3eb4b0e638617e1f16705f4de39d046541dc47f562c7521e196e3',
            addr: '0xB9f50869eE75290c548386C15821F2b3B133B050',
        },
        {
            prikey: '0xc00759cd4ab8e5ec964f784e6cda1074e48b09c687b165821365734b81d9cced',
            addr: '0x9be16f7fc952e626ccBF4f5425865B50612E8c3B',
        },
        {
            prikey: '0xbfbe48ccc81856b0714c8f2d3ef2a844b06b035f76ecfb5558b6b2a880492fbd',
            addr: '0x1Cd1B39377bDfe8874f4D7929d4Ae1b4861F622b',
        },
        {
            prikey: '0x09023e9b22f71ca0f265fd028252af64e89acd2ef9af30adb4d3f2996d29652b',
            addr: '0x68B91A98C3D331987421F7E127A226c851dF2e4a',
        },
        {
            prikey: '0xd320e29c81b2450c650f558cd5d5e38614899307a57e8058ca05781578131f0a',
            addr: '0x3851cB5F36316eAf42c485413E0917d2860DB02C',
        },
        {
            prikey: '0xf0965b31fd8e4e851798033ec8b3074628fccaea7fe5d4a1b04424b5c4864ce6',
            addr: '0xb1cE814aeE3097F369d7518f2c07e0C66b2F5199',
        },
        {
            prikey: '0x9889efaebfccfcac09777b6393438e960dfbbdd5e9027854a86982b2f7055b4a',
            addr: '0x8586900709fa4D6F54d6BFA34Ca6FF29dCef47ed',
        },
        {
            prikey: '0x6cde236157716666c3d970742f842aa5e8e6bcd08f7f4885bd2c58be7f1ed72d',
            addr: '0x51dc9e3a42f5Ca5FE45423e79AFeeDad56ADd0eE',
        },
        {
            prikey: '0x8b4c2220693ab6d1ac2a17a732e51987fb36d81337fe6324822e02033b9cacac',
            addr: '0x09fB2102856ef76461a8754CaC80f556EA02Fd29',
        },
        {
            prikey: '0x33d421491096a4da0f914192765f9636cdcbbcb9953fb9c2400e503f005cc433',
            addr: '0xbC66d173Ff5A9105a00F2cc10557C9f3AfCe48B3',
        },
        {
            prikey: '0x5455fdd8039d59ff54cccb830f69f940eb01e25bad8445343c4c960e1ff6be9e',
            addr: '0x6fa2Cf70ffB0b303127A5D55Bde783c7b773419d',
        },
        {
            prikey: '0x50d4a9d4010fdb1c6f0bdcbd02c6a75850f1417861c8a17b641ffa986f94c08e',
            addr: '0x87269eEcE81997725ddBff7DBcAefd4560aCDe4B',
        },
        {
            prikey: '0x8c1f2f57e93c51e51063bc17c828d88b3b236b112abaa74bd8f0ed1de6ca50b3',
            addr: '0xd45BA4Ef035286ac42EA5c6a648F15bd667D0ccA',
        },
        {
            prikey: '0x1bfdd3734e4a6b2798532aa24bd2387ab538da9c036a205997e43e4dfa57004b',
            addr: '0x51529ad7767f9Fef9CB2fc9356Ff40221B131058',
        },
        {
            prikey: '0x1cf7cac88afa5e61d7b3ffe386a916f0430cea9c25fa405d79228a272a6c0939',
            addr: '0x1504B856f0f0225C500eB7409C1F115BD2Dd5976',
        },
        {
            prikey: '0x73b80c324e69f9f7d88aa85c990769e60edc8515d9fc741c8b9e1af9d810d753',
            addr: '0xf1031682D9bE287d5d0e62C07EE49eD8416C8A51',
        },
        {
            prikey: '0x6585c7206a412e89fc01c561a7f9f5c2ee073dadf6ac34a53ff1f2a43ae302b9',
            addr: '0xE6232B2777df924B06ac76703e9EC4b02a99423C',
        },
        {
            prikey: '0x070c6c3b6f5aaf1f45617b8850ba81a463563dbfaac33128a4d329a100b036d5',
            addr: '0xb676eE16f4F4e08740049FE3a8e4D2117Ff0cC1E',
        },
        {
            prikey: '0xd58ca0ce6140fb83150731d5ad388cceecb5e008d4380c81e4625083d3a5c32d',
            addr: '0x2314223e2A7B5Db3ab17aee7533a750E5eBbB938',
        },
        {
            prikey: '0x30af453f3de8edbc1f9ea790c2d1c469f251e971c7a4036b6ecb5a8553441054',
            addr: '0x33f08CF51E64D73C0105868056A80Efd9174bF5F',
        },
        {
            prikey: '0x36c954733f787af3125c91028cc54c485f757444a709445c519603bff0344f85',
            addr: '0x991a34b4D00CdfDE904418289FA89FDf78dc01f1',
        },
        {
            prikey: '0x049b685bd2c33b2267d809fbc39d951b5515830577be87789c4678115c0c1ebc',
            addr: '0x3B0Fb35Cb66C03eecFB148f254deDA0DEe4ad335',
        },
        {
            prikey: '0x528f2b0a118cf9f9e0c1e5bf0c4a5629f3fbfdc7ddd5101488d04c5d6e40651f',
            addr: '0xF05bE23094cF98a3f8Ddcd420251c81bfe86007b',
        },
        {
            prikey: '0x835b097f71bfe42123749838cfcbf13481fc4270a7e605f3b91b5bef4d1620cc',
            addr: '0x6583d6f1268296901a81ee234b90149C9A3D6178',
        },
        {
            prikey: '0x74ff1e8ff22891d344191415d1e57dea412ea4376b1be64a7143bc2f3a4c9593',
            addr: '0xebC99Ff12256cbAa823441B16CA5531301f739C2',
        },
        {
            prikey: '0xdc1226d525848a336c83e8409540ec0f84956396643ed31199edef652b99fd47',
            addr: '0xCcE0ec256D2e104c872FeAf324E86B5a2A0587C5',
        },
        {
            prikey: '0x646ab5d5a8111ffb29df53f675143fc09c8170950c925aad1865ac019865ca3e',
            addr: '0x1f13555B0bfF6BB9902d47ef35efb147b5dFA1fA',
        },
        {
            prikey: '0xf5f5fcb65f6e36c94efc26d5a6f4ffc3daa72d892bf5ce0286434374110b81d2',
            addr: '0xfd1092F04127d216d7B55C712f9431dE63Ced529',
        },
        {
            prikey: '0xf650bca12521770d3a7428ee3060b50e1474e2a27881475677df9c19b73c48f1',
            addr: '0xeF09C724cE72B64c753A28179972E517Eb6bb817',
        },
        {
            prikey: '0x7ea7bb60c2dac7d2197cbe3482d91dfc05174347799962707bbd576e436ee81e',
            addr: '0x371d592B15aCBb228aB2a38F719cf56F32b66ce7',
        },
        {
            prikey: '0x18937220bbc0799182b5c75aed1577561ef4b2ead93eb8fe85a701e4d845613b',
            addr: '0x6CE2C6bA018bcE3ed63D4110E0616Eb548e38c53',
        },
        {
            prikey: '0x49a94dcedbc3b66c09e297b7e235259484b489eefe7b709374fb585d449d4ea3',
            addr: '0x4069a50E6feB74939b7E781dA671147de404FbaA',
        },
        {
            prikey: '0xd303f73d5b9035048386a8c8982faca36ceef18c056d2f4f49d2b98b6363bdaf',
            addr: '0xB37877eF155EE98f8293Ac9bc009E455208e5Aa1',
        },
        {
            prikey: '0x6be6e7acf04c0c6ad5c0553ccd2b33999c8b997412da0687c879aafc33fa01cc',
            addr: '0xDBcf0d010D850C547beA3cb8bfa775da156Ad14A',
        },
        {
            prikey: '0x9d68f228df25365573168405b12b5e227a530a36e72eb78509f9f09eadf38609',
            addr: '0x8e05C1FFC1d16c735df7843654333FD780a554F0',
        },
        {
            prikey: '0x4dd79baac75d7634ab7d601d456232685daa503e859a047ebd041a43b1ff4a00',
            addr: '0x0621379E67e91a8AD66FDcA2508B853500FA8099',
        },
        {
            prikey: '0x12c11989f2762a94ceb2897836d0dae5f61716e7dc7295327e2ae1ac8fd16c2d',
            addr: '0x5546767A99877e0bC52Bf32029880d38bCEb98F3',
        },
        {
            prikey: '0xc3f6580c909c2573013289e38a5056178ab0ea7d6fe3b9fb29864b2a7b30419b',
            addr: '0xC3a4EAd16d70B0a4BB19C6D4212420a7a49009ee',
        },
        {
            prikey: '0x485f951197b0b677bdac2ebbc92043f199b743503b817278c6420f96fe85e8f9',
            addr: '0xA95B0b036A6ae92268569CAE0D7Fc5b61fed7236',
        },
    ];

    // for (let keeper of keepers) {
    //     const fee = await feeCollector.keeperNetworkFee(keeper.addr, 2);
    //     if (fee.toNumber() > 0) {
    //         // const wallet = new ethers.Wallet(keeper.prikey, deployer.provider);
    //         // await feeCollector.connect(wallet).claimKeeperNetworkFee(1);
    //         console.log(`keeper: ${keeper.addr}:`, ethers.utils.formatUnits(fee, 18));
    //     }
    // }

    // console.log(
    //     await executor.setPricesAndExecuteOrders(
    //         ['0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'],
    //         [await oraclePriceFeed.getPrice(btc.address), await oraclePriceFeed.getPrice(eth.address)],
    //         [btcPriceFeedUpdate, ethPriceFeedUpdate],
    //         [btcPublishTime, ethPublishTime],
    //         [
    //             {
    //                 orderId: 56,
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
    // console.log(await usdt.mint('0xAb2aaB9D9d85e19891F0500b6d600c2b5d04890A', ethers.utils.parseUnits('100000', 6)));
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
