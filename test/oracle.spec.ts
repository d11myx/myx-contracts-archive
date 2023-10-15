import { ethers } from 'hardhat';
import { AddressesProvider, IndexPriceFeed, MockPyth, PythOraclePriceFeed, RoleManager, Timelock } from '../types';
import { testEnv } from './helpers/make-suite';
import { Duration, getBlockTimestamp, increase, latest, waitForTx } from '../helpers';
import { expect } from './shared/expect';
import { encodeParameterArray } from './helpers/misc';

describe('Oracle: oracle cases', () => {
    let mockPyth: MockPyth, oraclePriceFeed: PythOraclePriceFeed, indexPriceFeed: IndexPriceFeed;
    let timelock: Timelock;

    before(async () => {
        const mockPythFactory = await ethers.getContractFactory('MockPyth');
        mockPyth = await mockPythFactory.deploy(100, 60);

        const timelockFactory = await ethers.getContractFactory('Timelock');
        timelock = (await timelockFactory.deploy('43200')) as Timelock;

        const addressesProviderFactory = await ethers.getContractFactory('AddressesProvider');

        let addressProvider = (await addressesProviderFactory.deploy(timelock.address)) as AddressesProvider;
        const oraclePriceFeedFactory = await ethers.getContractFactory('PythOraclePriceFeed');

        const rolemanagerFactory = await ethers.getContractFactory('RoleManager');
        let roleManager = (await rolemanagerFactory.deploy()) as RoleManager;

        await addressProvider.setRolManager(roleManager.address);

        oraclePriceFeed = (await oraclePriceFeedFactory.deploy(
            addressProvider.address,
            mockPyth.address,
            [],
            [],
        )) as PythOraclePriceFeed;
        const indexPriceFeedFactory = await ethers.getContractFactory('IndexPriceFeed');
        indexPriceFeed = (await indexPriceFeedFactory.deploy(addressProvider.address, [], [])) as IndexPriceFeed;
    });

    it('update price feed', async () => {
        const { btc, eth } = testEnv;

        const id = '0x87a67534df591d2dd5ec577ab3c75668a8e3d35e92e27bf29d9e2e52df8de412';
        const price = '163240000000';
        const confidence = 60000000;
        const expo = 0;
        const emaPrice = '163158326000';
        const emaConf = '63257707';
        const publishTime = getBlockTimestamp();
        const priceFeedData = await mockPyth.createPriceFeedUpdateData(
            id,
            price,
            confidence,
            expo,
            emaPrice,
            emaConf,
            publishTime,
        );

        expect(await oraclePriceFeed.assetIds(btc.address)).to.be.eq(ethers.utils.formatBytes32String(''));
        let timestamp = await latest();
        let eta = Duration.days(1);
        await timelock.queueTransaction(
            oraclePriceFeed.address,
            0,
            'setAssetPriceIds(address[],bytes32[])',
            encodeParameterArray(['address[]', 'bytes32[]'], [[btc.address], [id]]),
            eta.add(timestamp),
        );
        await increase(Duration.days(1));
        // await oraclePriceFeed.setAssetPriceIds([btc.address], [id]);
        await waitForTx(
            await timelock.executeTransaction(
                oraclePriceFeed.address,
                0,
                'setAssetPriceIds(address[],bytes32[])',
                encodeParameterArray(['address[]', 'bytes32[]'], [[btc.address], [id]]),
                eta.add(timestamp),
            ),
        );
        expect(await oraclePriceFeed.assetIds(btc.address)).to.be.eq(id);
        //todo test

        // const fee = await priceOracle.getUpdateFee([btc.address], [price]);
        // expect(await priceOracle.updatePrice([btc.address], [price], { value: fee })).to.be.revertedWith('opk');

        // expect(await oraclePriceFeed.getPrice(btc.address)).to.be.eq(price);
        // expect(await indexPriceFeed.getPrice(btc.address)).to.be.eq(price);
        // expect(await priceOracle.getOraclePrice(btc.address)).to.be.eq(price + '0000000000000000000000');
        // expect(await priceOracle.getIndexPrice(btc.address)).to.be.eq(price + '0000000000000000000000');
    });
});
