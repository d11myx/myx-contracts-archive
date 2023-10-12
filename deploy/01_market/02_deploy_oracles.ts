import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    deployProxy,
    FUNDING_RATE,
    getAddressesProvider,
    INDEX_PRICE_FEED_ID,
    MOCK_PRICE_FEED_ID,
    ORACLE_PRICE_FEED_ID,
    PRICE_ORACLE_ID,
    waitForTx,
} from '../../helpers';
import { FundingRate, IndexPriceFeed, MockPyth, OraclePriceFeed, PriceOracle } from '../../types';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const deployerSigner = await hre.ethers.getSigner(deployer);

    const addressesProvider = await getAddressesProvider();

    const mockPythArtifact = await deploy(`${MOCK_PRICE_FEED_ID}`, {
        from: deployer,
        contract: 'MockPyth',
        args: [60, 1],
        ...COMMON_DEPLOY_PARAMS,
    });
    const mockPyth = (await hre.ethers.getContractAt(mockPythArtifact.abi, mockPythArtifact.address)) as MockPyth;

    const oraclePriceFeedArtifact = await deploy(`${ORACLE_PRICE_FEED_ID}`, {
        from: deployer,
        contract: 'OraclePriceFeed',
        args: [addressesProvider.address, mockPyth.address, [], []],
        ...COMMON_DEPLOY_PARAMS,
    });
    const oraclePriceFeed = (await hre.ethers.getContractAt(
        oraclePriceFeedArtifact.abi,
        oraclePriceFeedArtifact.address,
    )) as OraclePriceFeed;

    const indexPriceFeedArtifact = await deploy(`${INDEX_PRICE_FEED_ID}`, {
        from: deployer,
        contract: 'IndexPriceFeed',
        args: [addressesProvider.address, [], []],
        ...COMMON_DEPLOY_PARAMS,
    });
    const indexPriceFeed = (await hre.ethers.getContractAt(
        indexPriceFeedArtifact.abi,
        indexPriceFeedArtifact.address,
    )) as IndexPriceFeed;

    const priceOracleArtifact = await deploy(`${PRICE_ORACLE_ID}`, {
        from: deployer,
        contract: 'PriceOracle',
        args: [oraclePriceFeed.address, indexPriceFeed.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const priceOracle = (await hre.ethers.getContractAt(
        priceOracleArtifact.abi,
        priceOracleArtifact.address,
    )) as PriceOracle;

    const FundingRateArtifact = await deployProxy(`${FUNDING_RATE}`, [], {
        from: deployer,
        contract: 'FundingRate',
        args: [addressesProvider.address],
        ...COMMON_DEPLOY_PARAMS,
    });
    const fundingRate = (await hre.ethers.getContractAt(
        FundingRateArtifact.abi,
        FundingRateArtifact.address,
    )) as FundingRate;

    await waitForTx(
        await addressesProvider.connect(deployerSigner).initialize(priceOracle.address, fundingRate.address),
    );
};

func.id = `Oracles`;
func.tags = ['market', 'oracle'];
export default func;
