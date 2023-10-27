import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
    COMMON_DEPLOY_PARAMS,
    eNetwork,
    getToken,
    getWETH,
    isProdNetwork,
    loadReserveConfig,
    MARKET_NAME,
    MOCK_TOKEN_PREFIX,
    SymbolMap,
    ZERO_ADDRESS,
} from '../../../helpers';
import { ERC20DecimalsMock, WETH9 } from '../../../types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy, save } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    if (isProdNetwork(hre)) {
        console.log('[warring] Skipping testnet token setup');
        return;
    }
    const network = hre.network.name as eNetwork;
    const reserveConfig = loadReserveConfig(MARKET_NAME);

    // basic token
    const basicTokenAddress = reserveConfig?.MarketTokenAddress[network];
    let basicToken;
    if (!basicTokenAddress || basicTokenAddress == ZERO_ADDRESS) {
        const basicTokenArtifact = await deploy(`${MARKET_NAME}`, {
            from: deployer,
            contract: 'ERC20DecimalsMock',
            args: [MARKET_NAME, MARKET_NAME, reserveConfig?.MarketTokenDecimals],
            ...COMMON_DEPLOY_PARAMS,
        });
        basicToken = (await getToken(basicTokenArtifact.address)) as ERC20DecimalsMock;
    } else {
        basicToken = (await getToken(basicTokenAddress)) as ERC20DecimalsMock;

        const artifact = await hre.deployments.getArtifact('ERC20DecimalsMock');
        await save(`${MARKET_NAME}`, {
            ...artifact,
            address: basicToken.address,
        });
    }
    console.log(`[deployment] deployed basic token【${MARKET_NAME}】at ${basicToken.address}`);

    // wrapper token
    const wrapperTokenAddress = reserveConfig?.WrapperTokenAddress[network];
    let wrapperToken;
    if (!wrapperTokenAddress || wrapperTokenAddress == ZERO_ADDRESS) {
        const wrapperTokenArtifact = await deploy(`WETH`, {
            from: deployer,
            contract: 'WETH9',
            args: [],
            ...COMMON_DEPLOY_PARAMS,
        });
        wrapperToken = (await getWETH(wrapperTokenArtifact.address)) as WETH9;
    } else {
        wrapperToken = (await getWETH(wrapperTokenAddress)) as WETH9;

        const artifact = await hre.deployments.getArtifact('WETH');
        await save(`WETH`, {
            ...artifact,
            address: wrapperToken.address,
        });
    }
    console.log(`[deployment] deployed wrapper token【WETH】at ${wrapperToken.address}`);

    // pairs index token
    for (let [pair, pairInfo] of Object.entries(reserveConfig?.PairsConfig)) {
        const pairAssets = reserveConfig?.PairAssets[network] as SymbolMap<string>;
        let pairToken;
        if (pairAssets && pairAssets[pair] && pairAssets[pair] != ZERO_ADDRESS) {
            const pairTokenAddress = pairAssets[pair];
            pairToken = (await getToken(pairTokenAddress)) as ERC20DecimalsMock;

            const artifact = await hre.deployments.getArtifact('ERC20DecimalsMock');
            await save(`${MOCK_TOKEN_PREFIX}${pair}`, {
                ...artifact,
                address: pairToken.address,
            });
        } else {
            //TODO pairInfo.useWrappedNativeToken
            const pairTokenArtifact = await deploy(`${MOCK_TOKEN_PREFIX}${pair}`, {
                from: deployer,
                contract: 'ERC20DecimalsMock',
                args: [pair, pair, pairInfo.pairTokenDecimals],
                ...COMMON_DEPLOY_PARAMS,
            });
            pairToken = (await getToken(pairTokenArtifact.address)) as ERC20DecimalsMock;
        }
        console.log(`[deployment] deployed index tokens【${pair}】at ${pairToken.address}`);
    }
};

func.tags = ['market', 'init-testnet', 'token-setup'];
func.dependencies = ['before-deploy'];
export default func;
