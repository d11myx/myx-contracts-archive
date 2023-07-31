import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Signer } from 'ethers';
import { getSigners } from '@nomiclabs/hardhat-ethers/internal/helpers';
import {
    AddressesProvider,
    ExecuteRouter,
    IndexPriceFeed,
    PairInfo,
    PairLiquidity,
    PairVault,
    RoleManager,
    Token,
    TradingRouter,
    TradingUtils,
    TradingVault,
    OraclePriceFeed,
    WETH,
} from '../../types';
import { SymbolMap } from '../../helpers/types';
import { deployPair, deployPrice, deployToken, deployTrading } from '../../helpers';
import { initPairs } from '../../helpers/init-helper';
import { deployContract } from '../../helpers/utilities/tx';

declare var hre: HardhatRuntimeEnvironment;

export interface SignerWithAddress {
    signer: Signer;
    address: string;
}

export interface TestEnv {
    deployer: SignerWithAddress;
    keeper: SignerWithAddress;
    users: SignerWithAddress[];
    weth: WETH;
    btc: Token;
    usdt: Token;
    addressesProvider: AddressesProvider;
    pairTokens: SymbolMap<Token>;
    pairInfo: PairInfo;
    pairLiquidity: PairLiquidity;
    pairVault: PairVault;
    vaultPriceFeed: OraclePriceFeed;
    fastPriceFeed: IndexPriceFeed;
    tradingUtils: TradingUtils;
    tradingVault: TradingVault;
    tradingRouter: TradingRouter;
    executeRouter: ExecuteRouter;
}

export const testEnv: TestEnv = {
    deployer: {} as SignerWithAddress,
    keeper: {} as SignerWithAddress,
    users: [] as SignerWithAddress[],
    weth: {} as WETH,
    btc: {} as Token,
    usdt: {} as Token,
    addressesProvider: {} as AddressesProvider,
    pairTokens: {} as SymbolMap<Token>,
    pairInfo: {} as PairInfo,
    pairLiquidity: {} as PairLiquidity,
    pairVault: {} as PairVault,
    vaultPriceFeed: {} as OraclePriceFeed,
    fastPriceFeed: {} as IndexPriceFeed,
    tradingUtils: {} as TradingUtils,
    tradingVault: {} as TradingVault,
    tradingRouter: {} as TradingRouter,
    executeRouter: {} as ExecuteRouter,
} as TestEnv;

export async function setupTestEnv() {
    const [_deployer, _keeper, ...restSigners] = await getSigners(hre);
    const deployer: SignerWithAddress = {
        address: await _deployer.getAddress(),
        signer: _deployer,
    };
    const keeper: SignerWithAddress = {
        address: await _keeper.getAddress(),
        signer: _keeper,
    };

    for (const signer of restSigners) {
        testEnv.users.push({
            signer,
            address: await signer.getAddress(),
        });
    }
    // setup tokens
    const { weth, usdt, tokens } = await deployToken();
    testEnv.deployer = deployer;
    testEnv.keeper = keeper;
    testEnv.weth = weth;
    testEnv.usdt = usdt;
    testEnv.pairTokens = tokens;
    testEnv.btc = tokens['BTC'];

    // setup provider
    const addressesProvider = (await deployContract('AddressesProvider', [])) as AddressesProvider;
    const roleManager = (await deployContract('RoleManager', [addressesProvider.address])) as RoleManager;
    await addressesProvider.setRolManager(roleManager.address);
    await roleManager.addPoolAdmin(deployer.address);
    await roleManager.addKeeper(keeper.address);
    testEnv.addressesProvider = addressesProvider;

    // setup price
    const { vaultPriceFeed, fastPriceFeed } = await deployPrice(deployer, keeper, addressesProvider);
    testEnv.vaultPriceFeed = vaultPriceFeed;
    testEnv.fastPriceFeed = fastPriceFeed;

    // setup pair
    const { pairInfo, pairLiquidity, pairVault } = await deployPair(vaultPriceFeed, deployer, weth);
    testEnv.pairInfo = pairInfo;
    testEnv.pairLiquidity = pairLiquidity;
    testEnv.pairVault = pairVault;

    // setup trading
    const { tradingUtils, tradingVault, tradingRouter, executeRouter } = await deployTrading(
        deployer,
        pairVault,
        pairInfo,
        vaultPriceFeed,
        fastPriceFeed,
    );
    testEnv.tradingUtils = tradingUtils;
    testEnv.tradingVault = tradingVault;
    testEnv.tradingRouter = tradingRouter;
    testEnv.executeRouter = executeRouter;

    await initPairs(deployer, tokens, usdt, pairInfo, pairLiquidity);

    console.log(`Setup finished`);
}

export async function getPairToken(pair: string): Promise<Token> {
    return testEnv.pairTokens[pair];
}
