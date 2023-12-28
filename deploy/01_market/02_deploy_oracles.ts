import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
    COMMON_DEPLOY_PARAMS,
    eNetwork,
    FUNDING_RATE,
    getAddressesProvider,
    INDEX_PRICE_FEED_ID,
    isLocalNetwork,
    loadReserveConfig,
    MARKET_NAME,
    MOCK_PRICE_FEED_ID,
    ORACLE_PRICE_FEED_ID,
    ZERO_ADDRESS,
} from '../../helpers';
import { MockPyth } from '../../types';
import { deployments, getNamedAccounts } from 'hardhat';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deploy, save } = deployments;
    const { deployer } = await getNamedAccounts();

    const addressesProvider = await getAddressesProvider();

    const network = hre.network.name as eNetwork;
    const reserveConfig = loadReserveConfig(MARKET_NAME);

    if (isLocalNetwork(hre)) {
        const mockPythArtifact = await deploy(`${MOCK_PRICE_FEED_ID}`, {
            from: deployer,
            contract: 'MockPyth',
            args: [60, 1],
            ...COMMON_DEPLOY_PARAMS,
        });
        const mockPyth = (await hre.ethers.getContractAt(mockPythArtifact.abi, mockPythArtifact.address)) as MockPyth;
        await deploy(`${ORACLE_PRICE_FEED_ID}`, {
            from: deployer,
            contract: 'MockPythOraclePriceFeed',
            args: [addressesProvider.address, mockPyth.address, [], []],
            ...COMMON_DEPLOY_PARAMS,
        });
    } else {
        const oraclePriceFeedAddress = reserveConfig.OraclePriceFeedAddress[network];
        if (!oraclePriceFeedAddress || oraclePriceFeedAddress == ZERO_ADDRESS) {
            console.log('[ERROR] Unknown oracle price feed');
            return;
        }

        await deploy(`${ORACLE_PRICE_FEED_ID}`, {
            from: deployer,
            contract: 'PythOraclePriceFeed',
            args: [addressesProvider.address, oraclePriceFeedAddress, [], []],
            ...COMMON_DEPLOY_PARAMS,
        });
    }

    await deploy(`${INDEX_PRICE_FEED_ID}`, {
        from: deployer,
        contract: 'IndexPriceFeed',
        args: [addressesProvider.address, [], [], ZERO_ADDRESS],
        ...COMMON_DEPLOY_PARAMS,
    });

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
};

func.id = `Oracles`;
func.tags = ['market', 'oracle'];
export default func;
