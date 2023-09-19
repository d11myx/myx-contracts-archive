import { ethers } from 'hardhat';
import { MockPyth, PriceOracle, PythPriceFeed } from '../types';
import { testEnv } from './helpers/make-suite';
import { getBlockTimestamp, ZERO_ADDRESS } from '../helpers';
import { expect } from './shared/expect';

describe('Oracle: oracle cases', () => {
    let mockPyth: MockPyth, pythPriceFeed: PythPriceFeed, priceOracle: PriceOracle;

    before(async () => {
        const mockPythFactory = await ethers.getContractFactory('MockPyth');
        mockPyth = await mockPythFactory.deploy(100, 60);

        const pythPriceFeedFactory = await ethers.getContractFactory('PythPriceFeed');
        pythPriceFeed = (await pythPriceFeedFactory.deploy(mockPyth.address, [], [])) as PythPriceFeed;

        const priceOracleFactory = await ethers.getContractFactory('PriceOracle');
        priceOracle = await priceOracleFactory.deploy(pythPriceFeed.address, ZERO_ADDRESS);
    });

    it('update price feed', async () => {
        const { btc } = testEnv;
        console.log(await mockPyth.getValidTimePeriod());

        console.log(await pythPriceFeed.pyth());

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

        expect(await pythPriceFeed.assetIds(btc.address)).to.be.eq(ethers.utils.formatBytes32String(''));

        await pythPriceFeed.setAssetPriceIds([btc.address], [id]);

        expect(await pythPriceFeed.assetIds(btc.address)).to.be.eq(id);

        const fee = await mockPyth.getUpdateFee([priceFeedData]);
        await mockPyth.updatePriceFeedsIfNecessary([priceFeedData], [id], [publishTime], { value: fee });

        expect(await pythPriceFeed.getPrice(btc.address)).to.be.eq(price);
        expect(await priceOracle.getOraclePrice(btc.address)).to.be.eq(price);
    });
});
