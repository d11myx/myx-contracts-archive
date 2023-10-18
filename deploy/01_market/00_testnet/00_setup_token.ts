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
import { Token, WETH } from '../../../types';

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
            contract: 'Token',
            args: [MARKET_NAME],
            ...COMMON_DEPLOY_PARAMS,
        });
        basicToken = (await getToken(basicTokenArtifact.address)) as Token;
    } else {
        basicToken = (await getToken(basicTokenAddress)) as Token;

        const artifact = await hre.deployments.getArtifact('Token');
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
            contract: 'WETH',
            args: ['WETH', 'WETH', '18'],
            ...COMMON_DEPLOY_PARAMS,
        });
        wrapperToken = (await getWETH(wrapperTokenArtifact.address)) as WETH;
    } else {
        wrapperToken = (await getWETH(wrapperTokenAddress)) as WETH;

        const artifact = await hre.deployments.getArtifact('WETH');
        await save(`WETH`, {
            ...artifact,
            address: wrapperToken.address,
        });
    }
    console.log(`[deployment] deployed wrapper token【WETH】at ${wrapperToken.address}`);

    // pairs index token
    for (let pair of Object.keys(reserveConfig?.PairsConfig)) {
        const pairAssets = reserveConfig?.PairAssets[network] as SymbolMap<string>;
        let pairToken;
        if (pairAssets && pairAssets[pair] && pairAssets[pair] != ZERO_ADDRESS) {
            const pairTokenAddress = pairAssets[pair];
            pairToken = (await getToken(pairTokenAddress)) as Token;

            const artifact = await hre.deployments.getArtifact('Token');
            await save(`${MOCK_TOKEN_PREFIX}${pair}`, {
                ...artifact,
                address: pairToken.address,
            });
        } else {
            const pairTokenArtifact = await deploy(`${MOCK_TOKEN_PREFIX}${pair}`, {
                from: deployer,
                contract: 'Token',
                args: [pair],
                ...COMMON_DEPLOY_PARAMS,
            });
            pairToken = (await getToken(pairTokenArtifact.address)) as Token;
        }
        console.log(`[deployment] deployed index tokens【${pair}】at ${pairToken.address}`);
    }
};

func.tags = ['market', 'init-testnet', 'token-setup'];
func.dependencies = ['before-deploy'];
export default func;
