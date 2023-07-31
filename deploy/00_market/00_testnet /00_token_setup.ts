import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { COMMON_DEPLOY_PARAMS, loadReserveConfig, MARKET_NAME, Token, TOKEN_PREFIX } from '../../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    // basic token
    const basicTokenArtifact = await deploy(`${MARKET_NAME}`, {
        from: deployer,
        contract: 'Token',
        args: [MARKET_NAME],
        ...COMMON_DEPLOY_PARAMS,
    });
    const basicToken = (await hre.ethers.getContractAt(basicTokenArtifact.abi, basicTokenArtifact.address)) as Token;
    console.log(`deployed market token at ${basicToken.address}`);

    // native token
    const nativeTokenArtifact = await deploy(`WETH`, {
        from: deployer,
        contract: 'WETH',
        args: ['WETH', 'WETH', '18'],
        ...COMMON_DEPLOY_PARAMS,
    });
    const nativeToken = (await hre.ethers.getContractAt(nativeTokenArtifact.abi, nativeTokenArtifact.address)) as Token;
    console.log(`deployed WETH at ${nativeToken.address}`);

    // pairs token
    for (let pair of Object.keys(pairConfigs)) {
        const tokenArtifact = await deploy(`${TOKEN_PREFIX}${pair}`, {
            from: deployer,
            contract: 'Token',
            args: [pair],
            ...COMMON_DEPLOY_PARAMS,
        });
        // const token = (await hre.ethers.getContractAt(tokenArtifact.abi, tokenArtifact.address)) as Token;
        //
        // console.log(`deployed ${pair} at ${token.address}`);
    }
};

func.tags = ['market', 'init-testnet', 'token-setup'];
func.dependencies = ['before-deploy'];
export default func;
