import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { COMMON_DEPLOY_PARAMS, getTokens, isProdNetwork, waitForTx } from '../../helpers';
import { Faucet } from '../../types';
import { ethers } from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    if (isProdNetwork(hre)) {
        console.log('[warring] Skipping faucet deployed');
        return;
    }
    const { usdt, btc } = await getTokens();
    const faucetArtifact = await deploy(`Faucet`, {
        from: deployer,
        contract: 'Faucet',
        args: [
            [btc.address, usdt.address],
            [
                ethers.utils.parseUnits('0.5', await btc.decimals()),
                ethers.utils.parseUnits('5000', await usdt.decimals()),
            ],
        ],
        ...COMMON_DEPLOY_PARAMS,
    });
    const faucet = (await hre.ethers.getContractAt(faucetArtifact.abi, faucetArtifact.address)) as Faucet;

    await waitForTx(await btc.mint(faucet.address, ethers.utils.parseUnits('200000000', await btc.decimals())));
    // await waitForTx(await eth.mint(faucet.address, ethers.utils.parseUnits('2000000000', await eth.decimals())));
    await waitForTx(await usdt.mint(faucet.address, ethers.utils.parseUnits('10000000000000', await usdt.decimals())));
};

func.id = `Oracles`;
func.tags = ['market', 'oracle'];
export default func;
