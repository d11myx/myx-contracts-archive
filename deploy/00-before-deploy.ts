import { DeployFunction } from 'hardhat-deploy/types';
import { getWalletBalances } from '../helpers/utilities/tx';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { eNetwork } from '../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
  const balances = await getWalletBalances();
  console.log('');
  console.log('Accounts');
  console.table(balances);

  const network = (process.env.FORK ? process.env.FORK : hre.network.name) as eNetwork;
  console.log('Live network:', !!hre.config.networks[network].live);
};

func.tags = ['before-deploy'];

export default func;
