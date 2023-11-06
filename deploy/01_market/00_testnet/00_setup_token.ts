import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
    COMMON_DEPLOY_PARAMS,
    eNetwork,
    getToken,
    getWETH,
    loadReserveConfig,
    MARKET_NAME,
    MOCK_TOKEN_PREFIX,
    SymbolMap,
    ZERO_ADDRESS,
} from '../../../helpers';
import { MockERC20Token, WETH9 } from '../../../types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy, save } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    const network = hre.network.name as eNetwork;
    const reserveConfig = loadReserveConfig(MARKET_NAME);

    // basic token
    const basicTokenAddress = reserveConfig?.MarketTokenAddress[network];
    let basicToken;
    if (!basicTokenAddress || basicTokenAddress == ZERO_ADDRESS) {
        const basicTokenArtifact = await deploy(`${MARKET_NAME}`, {
            from: deployer,
            contract: 'MockERC20Token',
            args: [MARKET_NAME, MARKET_NAME, reserveConfig?.MarketTokenDecimals],
            ...COMMON_DEPLOY_PARAMS,
        });
        basicToken = (await getToken(basicTokenArtifact.address)) as MockERC20Token;
    } else {
        basicToken = (await getToken(basicTokenAddress)) as MockERC20Token;

        const artifact = await hre.deployments.getArtifact('MockERC20Token');
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
            pairToken = (await getToken(pairTokenAddress)) as MockERC20Token;

            const artifact = await hre.deployments.getArtifact('MockERC20Token');
            await save(`${MOCK_TOKEN_PREFIX}${pair}`, {
                ...artifact,
                address: pairToken.address,
            });
        } else {
            let pairTokenArtifact;
            if (pairInfo.useWrappedNativeToken) {
                pairTokenArtifact = await hre.deployments.get('WETH');
            } else {
                pairTokenArtifact = await deploy(`${MOCK_TOKEN_PREFIX}${pair}`, {
                    from: deployer,
                    contract: 'MockERC20Token',
                    args: [pair, pair, pairInfo.pairTokenDecimals],
                    ...COMMON_DEPLOY_PARAMS,
                });
            }
            pairToken = (await getToken(pairTokenArtifact.address)) as MockERC20Token;
        }
        console.log(`[deployment] deployed index tokens【${pair}】at ${pairToken.address}`);
    }
};

func.tags = ['market', 'init-testnet', 'token-setup'];
func.dependencies = ['before-deploy'];
export default func;
