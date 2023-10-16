import { ethers } from 'hardhat';
import {
    AddressesProvider,
    ERC20DecimalsMock,
    IndexPriceFeed,
    MockPyth,
    PythOraclePriceFeed,
    RoleManager,
    Timelock,
} from '../types';
import { testEnv } from './helpers/make-suite';
import { Duration, encodeParameterArray, getBlockTimestamp, increase, latest, toFullBN, waitForTx } from '../helpers';
import { expect } from './shared/expect';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('Oracle: oracle cases', () => {
    let mockPyth: MockPyth, pythOraclePriceFeed: PythOraclePriceFeed, indexPriceFeed: IndexPriceFeed;
    let timelock: Timelock;
    let owner: SignerWithAddress,
        dev: SignerWithAddress,
        spender: SignerWithAddress,
        other: SignerWithAddress,
        user1: SignerWithAddress,
        user2: SignerWithAddress;
    let eth!: ERC20DecimalsMock;
    let btc!: ERC20DecimalsMock;
    let token3!: ERC20DecimalsMock;

    beforeEach(async () => {
        const ERC20DecimalsMock = await ethers.getContractFactory('ERC20DecimalsMock');
        eth = (await ERC20DecimalsMock.deploy('token1', 'token1', 18)) as ERC20DecimalsMock;
        btc = (await ERC20DecimalsMock.deploy('token2', 'token2', 8)) as ERC20DecimalsMock;
        token3 = (await ERC20DecimalsMock.deploy('token3', 'token3', 18)) as ERC20DecimalsMock;

        [owner, dev, spender, other, user1, user2] = await ethers.getSigners();
        const mockPythFactory = await ethers.getContractFactory('MockPyth');
        mockPyth = await mockPythFactory.deploy(100, 60);

        const timelockFactory = await ethers.getContractFactory('Timelock');
        timelock = (await timelockFactory.deploy('43200')) as Timelock;

        const addressesProviderFactory = await ethers.getContractFactory('AddressesProvider');

        let addressProvider = (await addressesProviderFactory.deploy(timelock.address)) as AddressesProvider;
        const PythOraclePriceFeedFactory = await ethers.getContractFactory('PythOraclePriceFeed');

        const rolemanagerFactory = await ethers.getContractFactory('RoleManager');
        let roleManager = (await rolemanagerFactory.deploy()) as RoleManager;

        await addressProvider.setRolManager(roleManager.address);

        pythOraclePriceFeed = (await PythOraclePriceFeedFactory.deploy(
            addressProvider.address,
            mockPyth.address,
            [],
            [],
        )) as PythOraclePriceFeed;
        const indexPriceFeedFactory = await ethers.getContractFactory('IndexPriceFeed');
        indexPriceFeed = (await indexPriceFeedFactory.deploy(addressProvider.address, [], [])) as IndexPriceFeed;
        await roleManager.addKeeper(user1.address);
    });

    it('update price feed', async () => {
        const id = '0x87a67534df591d2dd5ec577ab3c75668a8e3d35e92e27bf29d9e2e52df8de412';
        const price = "16320000";
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
        await expect(pythOraclePriceFeed.setAssetPriceIds([btc.address], [id])).to.be.revertedWith('only timelock');
        expect(await pythOraclePriceFeed.assetIds(btc.address)).to.be.eq(ethers.utils.formatBytes32String(''));
        let timestamp = await latest();
        let eta = Duration.days(1);
        await timelock.queueTransaction(
            pythOraclePriceFeed.address,
            0,
            'setAssetPriceIds(address[],bytes32[])',
            encodeParameterArray(['address[]', 'bytes32[]'], [[btc.address], [id]]),
            eta.add(timestamp),
        );
        await increase(Duration.days(1));

        await waitForTx(
            await timelock.executeTransaction(
                pythOraclePriceFeed.address,
                0,
                'setAssetPriceIds(address[],bytes32[])',
                encodeParameterArray(['address[]', 'bytes32[]'], [[btc.address], [id]]),
                eta.add(timestamp),
            ),
        );
        expect(await pythOraclePriceFeed.assetIds(btc.address)).to.be.eq(id);
        //todo test

        const fee = await pythOraclePriceFeed.getUpdateFee([btc.address], [price]);
        await expect(pythOraclePriceFeed.updatePrice([btc.address], [price], { value: fee })).to.be.revertedWith('opk');
        await expect(indexPriceFeed.updatePrice([btc.address], [price])).to.be.revertedWith('opk');
        await pythOraclePriceFeed.connect(user1).updatePrice([btc.address], [price], { value: fee });
        await indexPriceFeed.connect(user1).updatePrice([btc.address], [price]);

        console.log('btc:' + btc.address);
        expect(await pythOraclePriceFeed.getPrice(btc.address)).to.be.eq(toFullBN(price, 24));
        // expect(await indexPriceFeed.getPrice(btc.address)).to.be.eq(price);
        // expect(await pythOraclePriceFeed.getPrice(btc.address)).to.be.eq(price);
        // expect(await indexPriceFeed.getPrice(btc.address)).to.be.eq(toFullBN(price, 8));
    });
});
