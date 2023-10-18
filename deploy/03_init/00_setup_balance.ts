import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { COMMON_DEPLOY_PARAMS, getTokens, waitForTx } from '../../helpers';
import { Faucet, Token } from '../../types';
import { ethers } from 'hardhat';
import { getSigners } from '@nomiclabs/hardhat-ethers/internal/helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const signers = await hre.ethers.getSigners();

    console.log(`- setup balance`);
    const { usdt, btc, eth } = await getTokens();

    const tokens: Token[] = [];
    tokens.push(usdt);
    tokens.push(btc);
    tokens.push(eth);

    for (let signer of signers) {
        for (let token of tokens) {
            console.log(` mint for ${signer.address} 100000000${await token.symbol()}`);
            await waitForTx(await token.mint(signer.address, ethers.utils.parseEther('100000000')));
        }
    }
};

func.id = `Oracles`;
func.tags = ['market', 'oracle'];
export default func;
