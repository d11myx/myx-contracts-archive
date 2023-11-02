import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { COMMON_DEPLOY_PARAMS, getTokens, isTestNetwork, waitForTx } from '../../helpers';
import { Faucet } from '../../types';
import { ethers } from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy } = hre.deployments;
    const { deployer } = await hre.getNamedAccounts();

    if (isTestNetwork(hre)) {
    }
    const { usdt, btc, eth } = await getTokens();

    const faucetArtifact = await deploy(`Faucet`, {
        from: deployer,
        contract: 'Faucet',
        args: [
            [btc.address, eth.address, usdt.address],
            [20, 200, 1000000],
        ],
        ...COMMON_DEPLOY_PARAMS,
    });
    const faucet = (await hre.ethers.getContractAt(faucetArtifact.abi, faucetArtifact.address)) as Faucet;

    await waitForTx(await btc.mint(faucet.address, ethers.utils.parseEther('200000000')));
    await waitForTx(await eth.mint(faucet.address, ethers.utils.parseEther('2000000000')));
    await waitForTx(await usdt.mint(faucet.address, ethers.utils.parseEther('10000000000000')));
};

func.id = `Oracles`;
func.tags = ['market', 'oracle'];
export default func;
