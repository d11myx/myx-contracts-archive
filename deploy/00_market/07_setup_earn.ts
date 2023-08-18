import {DeployFunction} from 'hardhat-deploy/types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {
  COMMON_DEPLOY_PARAMS, CONVERTOR_ID,
  EXECUTOR_ID, FEE_DISTRIBUTOR_ID,
  getAddressesProvider,
  getIndexPriceFeed,
  getOraclePriceFeed,
  getPool, getPositionManager,
  getRoleManager, getToken,
  getWETH, LP_STAKING_POOL_ID, MYX_ID,
  ORDER_MANAGER_ID,
  POSITION_MANAGER_ID, RAMYX_ID, REWARD_DISTRIBUTOR_ID,
  ROUTER_ID, STAKING_POOL_ID, STMYX_ID,
  TRADING_VAULT_ID, VESTER_ID,
  waitForTx,
} from '../../helpers';
import {
  MYX,
  RaMYX,
  StMYX,
  Vester,
  StakingPool,
  LPStakingPool,
  RewardDistributor,
  Convertor,
  FeeDistributor
} from '../../types';

const func: DeployFunction = async function ({getNamedAccounts, deployments, ...hre}: HardhatRuntimeEnvironment) {
  const {deploy} = deployments;
  const {
    deployer, poolAdmin, teamAndAdvisor, privatePlacement, community, initLiquidity,
    marketOperation, ecoKeeper, developmentReserve
  } = await getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);
  const poolAdminSigner = await hre.ethers.getSigner(poolAdmin);

  let usdt = await getToken();
  let pool = await getPool();
  let positionManager = await getPositionManager();

  //// deploy
  // myx
  const myxArtifact = await deploy(`${MYX_ID}`, {
    from: deployer,
    contract: 'MYX',
    args: [],
    ...COMMON_DEPLOY_PARAMS,
  });
  const myx = (await hre.ethers.getContractAt(
    myxArtifact.abi,
    myxArtifact.address,
  )) as MYX;

  // raMYX
  const raMYXArtifact = await deploy(`${RAMYX_ID}`, {
    from: deployer,
    contract: 'RaMYX',
    args: [],
    ...COMMON_DEPLOY_PARAMS,
  });
  const raMYX = (await hre.ethers.getContractAt(
    raMYXArtifact.abi,
    raMYXArtifact.address,
  )) as RaMYX;

  // stMYX
  const stMYXArtifact = await deploy(`${STMYX_ID}`, {
    from: deployer,
    contract: 'StMYX',
    args: [],
    ...COMMON_DEPLOY_PARAMS,
  });
  const stMYX = (await hre.ethers.getContractAt(
    stMYXArtifact.abi,
    stMYXArtifact.address,
  )) as StMYX;

  // MYXVester
  const vesterArtifact = await deploy(`${VESTER_ID}`, {
    from: deployer,
    contract: 'Vester',
    args: [
      myx.address,
      teamAndAdvisor,
      privatePlacement,
      community,
      initLiquidity,
      marketOperation,
      ecoKeeper,
      developmentReserve
    ],
    ...COMMON_DEPLOY_PARAMS,
  });
  const vester = (await hre.ethers.getContractAt(
    vesterArtifact.abi,
    vesterArtifact.address,
  )) as Vester;

  await waitForTx(await myx.initialize(vester.address, "1000000000000000000000000000"));
  console.log(`myx balance of ${vester.address} : ${hre.ethers.utils.formatEther(await myx.balanceOf(vester.address))}`);

  // stakingPool
  const stakingPoolArtifact = await deploy(`${STAKING_POOL_ID}`, {
    from: deployer,
    contract: 'StakingPool',
    args: [
      [myx.address, raMYX.address],
      stMYX.address,
      usdt.address,
      positionManager.address
    ],
    ...COMMON_DEPLOY_PARAMS,
  });
  const stakingPool = (await hre.ethers.getContractAt(
    stakingPoolArtifact.abi,
    stakingPoolArtifact.address,
  )) as StakingPool;

  // lpStakingPool
  const lpStakingPoolArtifact = await deploy(`${LP_STAKING_POOL_ID}`, {
    from: deployer,
    contract: 'LPStakingPool',
    args: [pool.address],
    ...COMMON_DEPLOY_PARAMS,
  });
  const lpStakingPool = (await hre.ethers.getContractAt(
    lpStakingPoolArtifact.abi,
    lpStakingPoolArtifact.address,
  )) as LPStakingPool;

  // convertor
  const convertorArtifact = await deploy(`${CONVERTOR_ID}`, {
    from: deployer,
    contract: 'Convertor',
    args: [raMYX.address, myx.address],
    ...COMMON_DEPLOY_PARAMS,
  });
  const convertor = (await hre.ethers.getContractAt(
    convertorArtifact.abi,
    convertorArtifact.address,
  )) as Convertor;

  // rewardDistributor-RaMYX
  const rewardDistributorArtifact = await deploy(`${REWARD_DISTRIBUTOR_ID}`, {
    from: deployer,
    contract: 'RewardDistributor',
    args: [raMYX.address],
    ...COMMON_DEPLOY_PARAMS,
  });
  const rewardDistributor = (await hre.ethers.getContractAt(
    rewardDistributorArtifact.abi,
    rewardDistributorArtifact.address,
  )) as RewardDistributor;

  // feeDistributor
  const feeDistributorArtifact = await deploy(`${FEE_DISTRIBUTOR_ID}`, {
    from: deployer,
    contract: 'FeeDistributor',
    args: [usdt.address],
    ...COMMON_DEPLOY_PARAMS,
  });
  const feeDistributor = (await hre.ethers.getContractAt(
    feeDistributorArtifact.abi,
    feeDistributorArtifact.address,
  )) as FeeDistributor;

  //// config
  // convertor
  await waitForTx(await convertor.setCommunityPool(community));

  // StakingPool
  await waitForTx(await stakingPool.setMaxStakeAmount(myx.address, hre.ethers.utils.parseUnits("1000000", 18)));
  await waitForTx(await stakingPool.setMaxStakeAmount(raMYX.address, hre.ethers.utils.parseUnits("1000000", 18)));
  await waitForTx(await stakingPool.setHandler(rewardDistributor.address, true));

  await waitForTx(await lpStakingPool.setMaxStakeAmount(0, hre.ethers.utils.parseUnits("1000000", 18)));
  await waitForTx(await lpStakingPool.setMaxStakeAmount(1, hre.ethers.utils.parseUnits("1000000", 18)));

  // distributor
  await waitForTx(await rewardDistributor.setStakingPool(stakingPool.address));
  await waitForTx(await rewardDistributor.setHandler(deployer, true));
  await waitForTx(await feeDistributor.setPositionManager(positionManager.address));
  await waitForTx(await feeDistributor.setHandler(deployer, true));

  // token
  await waitForTx(await raMYX.setPrivateTransferMode(true));
  await waitForTx(await raMYX.setMiner(rewardDistributor.address, true));
  await waitForTx(await raMYX.setMiner(convertor.address, true));
  await waitForTx(await raMYX.setHandler(stakingPool.address, true));
  await waitForTx(await raMYX.setHandler(convertor.address, true));

  await waitForTx(await stMYX.setPrivateTransferMode(true));
  await waitForTx(await stMYX.setMiner(stakingPool.address, true));
  await waitForTx(await stMYX.setHandler(stakingPool.address, true));

  const roleManager = await getRoleManager();
  await waitForTx(await roleManager.connect(deployerSigner).addPoolAdmin(stakingPool.address));
  await waitForTx(await roleManager.connect(deployerSigner).addPoolAdmin(feeDistributor.address));

};

func.id = `Pairs`;
func.tags = ['market', 'pair'];
export default func;
