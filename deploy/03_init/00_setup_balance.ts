import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getTokens, isLocalNetwork, waitForTx } from '../../helpers';
import { MockERC20Token } from '../../types';
import { ethers } from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const signers = await hre.ethers.getSigners();

    console.log(`- setup balance`);
    if (!isLocalNetwork(hre)) {
        console.log('[warring] Skipping balance setup');
        return;
    }
    const { usdt, btc } = await getTokens();

    const tokens: MockERC20Token[] = [];
    tokens.push(usdt);
    tokens.push(btc);
    // tokens.push(eth);
    for (let signer of signers) {
        for (let token of tokens) {
            // console.log(` mint for ${signer.address} 100000000${await token.symbol()}`);
            await waitForTx(
                await token.mint(signer.address, ethers.utils.parseUnits('100000000', await token.decimals())),
            );
        }
    }
};

func.id = `SetupBalance`;
func.tags = ['init', 'setup-balance'];
export default func;
