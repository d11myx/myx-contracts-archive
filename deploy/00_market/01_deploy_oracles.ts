import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    getAddressesProvider,
    INDEX_PRICE_FEED_ID,
    loadReserveConfig,
    MARKET_NAME,
    MOCK_PRICE_FEED_PREFIX,
    ORACLE_PRICE_FEED_ID,
    waitForTx,
} from '../../helpers';
import { MockPriceFeed, OraclePriceFeed } from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer, keeper } = await getNamedAccounts();
    const deployerSigner = await hre.ethers.getSigner(deployer);

    const pairConfigs = loadReserveConfig(MARKET_NAME)?.PairsConfig;

    const addressesProvider = await getAddressesProvider();

    const oraclePriceFeedArtifact = await deploy(`${ORACLE_PRICE_FEED_ID}`, {
        from: deployer,
        contract: 'OraclePriceFeed',
        args: [addressesProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const oraclePriceFeed = (await hre.ethers.getContractAt(
        oraclePriceFeedArtifact.abi,
        oraclePriceFeedArtifact.address,
    )) as OraclePriceFeed;

    for (let pair of Object.keys(pairConfigs)) {
        const mockPriceFeedArtifact = await deploy(`${MOCK_PRICE_FEED_PREFIX}${pair}`, {
            from: deployer,
            contract: 'MockPriceFeed',
            args: [],
            ...COMMON_DEPLOY_PARAMS,
        });
        const mockPriceFeed = (await hre.ethers.getContractAt(
            mockPriceFeedArtifact.abi,
            mockPriceFeedArtifact.address,
        )) as MockPriceFeed;

        await waitForTx(await mockPriceFeed.connect(deployerSigner).setAdmin(keeper, true));
    }

    await deploy(`${INDEX_PRICE_FEED_ID}`, {
        from: deployer,
        contract: 'IndexPriceFeed',
        args: [addressesProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    
    await addressesProvider.connect(deployerSigner).setPriceOracle(oraclePriceFeed.address);
};

func.id = `Oracles`;
func.tags = ['market', 'oracle'];
export default func;
