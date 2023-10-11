import { ethers } from 'hardhat';
import { IndexPriceFeed, MockPyth, OraclePriceFeed, PriceOracle } from '../types';
import { testEnv } from './helpers/make-suite';
import { getBlockTimestamp } from '../helpers';
import { expect } from './shared/expect';

describe('Oracle: oracle cases', () => {
    let mockPyth: MockPyth, oraclePriceFeed: OraclePriceFeed, indexPriceFeed: IndexPriceFeed, priceOracle: PriceOracle;

    before(async () => {
        const mockPythFactory = await ethers.getContractFactory('MockPyth');
        mockPyth = await mockPythFactory.deploy(100, 60);

        const oraclePriceFeedFactory = await ethers.getContractFactory('OraclePriceFeed');
        oraclePriceFeed = (await oraclePriceFeedFactory.deploy(mockPyth.address, [], [])) as OraclePriceFeed;

        const indexPriceFeedFactory = await ethers.getContractFactory('IndexPriceFeed');
        indexPriceFeed = (await indexPriceFeedFactory.deploy([], [])) as IndexPriceFeed;

        const priceOracleFactory = await ethers.getContractFactory('PriceOracle');
        priceOracle = await priceOracleFactory.deploy(oraclePriceFeed.address, indexPriceFeed.address);
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

        await oraclePriceFeed.setAssetPriceIds([btc.address], [id]);
        

        expect(await oraclePriceFeed.assetIds(btc.address)).to.be.eq(id);

        const fee = await priceOracle.getUpdateFee([btc.address], [price]);
        await priceOracle.updatePrice([btc.address], [price], { value: fee });

        expect(await oraclePriceFeed.getPrice(btc.address)).to.be.eq(price);
        expect(await indexPriceFeed.getPrice(btc.address)).to.be.eq(price);
        expect(await priceOracle.getOraclePrice(btc.address)).to.be.eq(price + '0000000000000000000000');
        expect(await priceOracle.getIndexPrice(btc.address)).to.be.eq(price + '0000000000000000000000');
    });
});
