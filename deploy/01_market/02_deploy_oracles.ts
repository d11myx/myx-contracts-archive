import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    FUNDING_RATE,
    getAddressesProvider,
    getFundingRate,
    getIndexPriceFeed,
    getOraclePriceFeed,
    INDEX_PRICE_FEED_ID,
    MOCK_PRICE_FEED_ID,
    ORACLE_PRICE_FEED_ID,
    waitForTx,
} from '../../helpers';
import { MockPyth } from '../../types';

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

    await deploy(`${ORACLE_PRICE_FEED_ID}`, {
        from: deployer,
        contract: 'PythOraclePriceFeed',
        args: [addressesProvider.address, mockPyth.address, [], []],
        ...COMMON_DEPLOY_PARAMS,
    });
    const oraclePriceFeed = await getOraclePriceFeed();

    await deploy(`${INDEX_PRICE_FEED_ID}`, {
        from: deployer,
        contract: 'IndexPriceFeed',
        args: [addressesProvider.address, [], []],
        ...COMMON_DEPLOY_PARAMS,
    });
    const indexPriceFeed = await getIndexPriceFeed();

    await deploy(`${FUNDING_RATE}`, {
        from: deployer,
        contract: 'FundingRate',
        args: [],
        proxy: {
            owner: deployer,
            proxyContract: 'UUPS',
            proxyArgs: [],
            execute: {
                methodName: 'initialize',
                args: [addressesProvider.address],
            },
        },
        ...COMMON_DEPLOY_PARAMS,
    });
    const fundingRate = await getFundingRate();

    await waitForTx(
        await addressesProvider
            .connect(deployerSigner)
            .initialize(oraclePriceFeed.address, indexPriceFeed.address, fundingRate.address),
    );
};

func.id = `Oracles`;
func.tags = ['market', 'oracle'];
export default func;
