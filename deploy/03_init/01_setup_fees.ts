import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    getFeeCollector,
    getMockToken,
    getPool,
    getToken,
    getWETH,
    loadReserveConfig,
    MARKET_NAME,
} from '../../helpers';
import { IFeeCollector } from '../../types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { poolAdmin } = await hre.getNamedAccounts();
    const poolAdminSigner = await hre.ethers.getSigner(poolAdmin);

    const reserveConfig = loadReserveConfig(MARKET_NAME);
    const pairConfigs = reserveConfig?.PairsConfig;

    const pool = await getPool();
    const feeCollector = await getFeeCollector();

    console.log(`- setup pairs regular fee`);
    for (let symbol of Object.keys(pairConfigs)) {
        const pairConfig = pairConfigs[symbol];

        const basicToken = await getToken();
        let pairToken;
        if (pairConfig.useWrappedNativeToken) {
            pairToken = await getWETH();
        } else {
            pairToken = await getMockToken(symbol);
        }

        const pairIndex = await pool.getPairIndex(pairToken.address, basicToken.address);
        const tierFee: IFeeCollector.TradingFeeTierStruct = {
            makerFee: pairConfig.tradingFeeConfig.makerFee,
            takerFee: pairConfig.tradingFeeConfig.takerFee,
        };
        await feeCollector.connect(poolAdminSigner).updateTradingFeeTiers(pairIndex, [0], [tierFee]);

        console.log(
            ` - setup pair【${symbol}/${MARKET_NAME}】fees. tier:【0】taker: ${tierFee.takerFee} maker: ${tierFee.makerFee}`,
        );
    }
};
func.id = `SetupFees`;
func.tags = ['init', 'setup-fees'];
export default func;
