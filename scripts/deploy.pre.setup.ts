import { ethers } from 'hardhat';
import {
    getExecutor,
    getOrderManager,
    getPool,
    getPositionManager,
    getRouter,
    getTestCallBack,
    getToken,
    MOCK_TOKEN_PREFIX,
    SymbolMap,
    waitForTx,
    getRoleManager,
    getPriceOracle,
    getFundingRate,
} from '../helpers';
import { Token } from '../types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { IFundingRate } from '../types/contracts/core/FundingRate';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const router = await getRouter();
    const orderManager = await getOrderManager();
    const positionManager = await getPositionManager();
    const fundingRate = await getFundingRate();
    const executor = await getExecutor();
    const priceOracle = await getPriceOracle();
    const roleManager = await getRoleManager();
    const pool = await getPool();
    const testCallBack = await getTestCallBack();
    // console.log(`router:`, router.address);
    // console.log(`index:`, await orderManager.ordersIndex());
    console.log(`executor:`, executor.address);

    const { usdt, btc, eth } = await getTokens();
    console.log(`btc price:`, ethers.utils.formatUnits(await priceOracle.getOraclePrice(btc.address), 30));
    console.log(`eth price:`, ethers.utils.formatUnits(await priceOracle.getOraclePrice(eth.address), 30));

    const keepers: string[] = [
        '0x66D1e5F498c21709dCFC916785f09Dcf2D663E63',
        '0x8C2B496E5BC13b4170dC818132bEE5413A39834C',
        '0x9a5c3C2843eB3d9b764A2F00236D8519989BbDa1',
        '0x299227e2bD681A510b00dFfaC9f4FD0Da0715B94',
        '0xF1BAB1E9ad036B53Ad653Af455C21796f15EE3bD',
        '0x8bc45c15C993A982AFc053ce0fF7B59b40eE0D7B',
    ];

    for (let keeper of keepers) {
        await deployer.sendTransaction({ to: keeper, value: ethers.utils.parseEther('100') });

        await waitForTx(await roleManager.addKeeper(keeper));
        await waitForTx(await roleManager.addPoolAdmin(keeper));
    }

    const btcFeeConfig: IFundingRate.FundingFeeConfigStruct = {
        minFundingRate: -36500000, //=-0.1% * 365
        maxFundingRate: 36500000, //=0.1% * 365
        fundingWeightFactor: 1000000, //1%
        liquidityPremiumFactor: 100000000, //100%
        interest: 0,
        fundingInterval: 60 * 60,
    };
    await fundingRate.updateFundingFeeConfig(0, btcFeeConfig);

    const ethFeeConfig: IFundingRate.FundingFeeConfigStruct = {
        minFundingRate: -36500000, //=-0.1% * 365
        maxFundingRate: 36500000, //=0.1% * 365
        fundingWeightFactor: 1000000, //1%
        liquidityPremiumFactor: 100000000, //100%
        interest: 0,
        fundingInterval: 60 * 60,
    };
    await fundingRate.updateFundingFeeConfig(1, ethFeeConfig);

    // await waitForTx(await usdt.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await btc.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await eth.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await usdt.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await btc.approve(testCallBack.address, MAX_UINT_AMOUNT));
    // await waitForTx(await eth.approve(testCallBack.address, MAX_UINT_AMOUNT));
    //
    // await waitForTx(
    //     await testCallBack.addLiquidity(
    //         pool.address,
    //         (
    //         await pool.getPair(0)
    //         ).indexToken,
    //         (
    //         await pool.getPair(0)
    //         ).stableToken,
    //         ethers.utils.parseEther('1000'),
    //         ethers.utils.parseEther('26000000'),
    //     ),
    // );
    // await waitForTx(
    //     await testCallBack.addLiquidity(
    //         pool.address,
    //         (
    //         await pool.getPair(1)
    //         ).indexToken,
    //         (
    //         await pool.getPair(1)
    //         ).stableToken,
    //         ethers.utils.parseEther('1000'),
    //         ethers.utils.parseEther('1650000'),
    //     ),
    // );

    // const btcTradingConfig: IPool.TradingConfigStruct = {
    //     minLeverage: 3,
    //     maxLeverage: 50,
    //     minTradeAmount: '100000000000000000',
    //     maxTradeAmount: '100000000000000000000000',
    //     maxPositionAmount: '100000000000000000000000000',
    //     maintainMarginRate: 100,
    //     priceSlipP: 10,
    //     maxPriceDeviationP: 50,
    // };
    // await pool.updateTradingConfig(0, btcTradingConfig);
    //
    // const ethTradingConfig: IPool.TradingConfigStruct = {
    //     minLeverage: 3,
    //     maxLeverage: 50,
    //     minTradeAmount: '100000000000000000',
    //     maxTradeAmount: '100000000000000000000000',
    //     maxPositionAmount: '100000000000000000000000000',
    //     maintainMarginRate: 100,
    //     priceSlipP: 10,
    //     maxPriceDeviationP: 50,
    // };
    // await pool.updateTradingConfig(1, ethTradingConfig);
}

async function getTokens() {
    const allDeployments = await hre.deployments.all();
    const mockTokenKeys = Object.keys(allDeployments).filter((key) => key.includes(MOCK_TOKEN_PREFIX));

    let pairTokens: SymbolMap<Token> = {};
    for (let [key, deployment] of Object.entries(allDeployments)) {
        if (mockTokenKeys.includes(key)) {
            pairTokens[key.replace(MOCK_TOKEN_PREFIX, '')] = await getToken(deployment.address);
        }
    }

    // tokens
    const usdt = await getToken();
    const btc = pairTokens['BTC'];
    const eth = pairTokens['ETH'];

    return { usdt, btc, eth };
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
