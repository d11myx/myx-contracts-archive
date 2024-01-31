import { ethers } from 'hardhat';
import {
    AddressesProvider,
    MockERC20Token,
    IndexPriceFeed,
    MockPyth,
    MockPythOraclePriceFeed,
    PythOraclePriceFeed,
    RoleManager,
    Timelock,
    WETH9,
} from '../types';
import {
    Duration,
    encodeParameterArray,
    encodeParameters,
    getBlockTimestamp,
    increase,
    latest,
    toFullBNStr,
    waitForTx,
    ZERO_ADDRESS,
} from '../helpers';
import { expect } from './shared/expect';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

describe('Oracle: oracle cases', () => {
    let mockPyth: MockPyth, pythOraclePriceFeed: MockPythOraclePriceFeed, indexPriceFeed: IndexPriceFeed;
    let timelock: Timelock;
    let owner: SignerWithAddress,
        dev: SignerWithAddress,
        spender: SignerWithAddress,
        other: SignerWithAddress,
        user1: SignerWithAddress,
        user2: SignerWithAddress;
    let eth!: MockERC20Token;
    let btc!: MockERC20Token;
    let token3!: MockERC20Token;

    beforeEach(async () => {
        const MockERC20Token = await ethers.getContractFactory('MockERC20Token');
        eth = (await MockERC20Token.deploy('token1', 'token1', 18)) as MockERC20Token;
        btc = (await MockERC20Token.deploy('token2', 'token2', 8)) as MockERC20Token;
        token3 = (await MockERC20Token.deploy('token3', 'token3', 18)) as MockERC20Token;
        const WETHMock = await ethers.getContractFactory('WETH9');
        const weth = (await WETHMock.deploy()) as WETH9;
        [owner, dev, spender, other, user1, user2] = await ethers.getSigners();
        const mockPythFactory = await ethers.getContractFactory('MockPyth');
        mockPyth = await mockPythFactory.deploy(100, 60);

        const timelockFactory = await ethers.getContractFactory('Timelock');
        timelock = (await timelockFactory.deploy('43200')) as Timelock;

        const addressesProviderFactory = await ethers.getContractFactory('AddressesProvider');

        let addressProvider = (await addressesProviderFactory.deploy(
            weth.address,
            timelock.address,
        )) as AddressesProvider;
        const PythOraclePriceFeedFactory = await ethers.getContractFactory('MockPythOraclePriceFeed', owner);

        const rolemanagerFactory = await ethers.getContractFactory('RoleManager');
        let roleManager = (await rolemanagerFactory.deploy()) as RoleManager;

        await addressProvider.setRolManager(roleManager.address);

        pythOraclePriceFeed = (await PythOraclePriceFeedFactory.deploy(
            addressProvider.address,
            mockPyth.address,
            [],
            [],
        )) as MockPythOraclePriceFeed;
        const indexPriceFeedFactory = await ethers.getContractFactory('IndexPriceFeed');
        indexPriceFeed = (await indexPriceFeedFactory.deploy(
            addressProvider.address,
            [],
            [],
            ZERO_ADDRESS,
        )) as IndexPriceFeed;
        await roleManager.addKeeper(user1.address);
        await roleManager.addPoolAdmin(owner.address);
    });
    it('test updatePythAddress', async () => {
        await expect(pythOraclePriceFeed.connect(dev).updatePythAddress(mockPyth.address)).to.be.revertedWith('opa');

        expect(await pythOraclePriceFeed.pyth()).to.be.eq(mockPyth.address);

        await pythOraclePriceFeed.connect(owner).updatePythAddress(eth.address);
        // let timestamp = await latest();
        // let eta = Duration.days(1);
        // await timelock.queueTransaction(
        //     pythOraclePriceFeed.address,
        //     0,
        //     'updatePythAddress(address)',
        //     encodeParameters(['address'], [eth.address]),
        //     eta.add(timestamp),
        // );
        // await increase(Duration.days(1));
        // expect(await pythOraclePriceFeed.pyth()).to.be.eq(mockPyth.address);
        //
        // await timelock.executeTransaction(
        //     pythOraclePriceFeed.address,
        //     0,
        //     'updatePythAddress(address)',
        //     encodeParameters(['address'], [eth.address]),
        //     eta.add(timestamp),
        // );
        expect(await pythOraclePriceFeed.pyth()).to.be.eq(eth.address);
    });

    it('update price feed', async () => {
        const id = '0x87a67534df591d2dd5ec577ab3c75668a8e3d35e92e27bf29d9e2e52df8de412';
        const price = '16320000';
        const confidence = 60000000;
        const expo = 0;
        const emaPrice = '163158326000';
        const emaConf = '63257707';
        const publishTime = getBlockTimestamp();
        const prevPublishTime = getBlockTimestamp();
        const priceFeedData = await mockPyth.createPriceFeedUpdateData(
            id,
            price,
            confidence,
            expo,
            emaPrice,
            emaConf,
            publishTime,
            prevPublishTime,
        );
        await expect(pythOraclePriceFeed.connect(dev).setTokenPriceIds([btc.address], [id])).to.be.revertedWith('opa');
        expect(await pythOraclePriceFeed.tokenPriceIds(btc.address)).to.be.eq(ethers.utils.formatBytes32String(''));

        await pythOraclePriceFeed.connect(owner).setTokenPriceIds([btc.address], [id]);
        // let timestamp = await latest();
        // let eta = Duration.days(1);
        // await timelock.queueTransaction(
        //     pythOraclePriceFeed.address,
        //     0,
        //     'setTokenPriceIds(address[],bytes32[])',
        //     encodeParameterArray(['address[]', 'bytes32[]'], [[btc.address], [id]]),
        //     eta.add(timestamp),
        // );
        // await increase(Duration.days(1));
        //
        // await waitForTx(
        //     await timelock.executeTransaction(
        //         pythOraclePriceFeed.address,
        //         0,
        //         'setTokenPriceIds(address[],bytes32[])',
        //         encodeParameterArray(['address[]', 'bytes32[]'], [[btc.address], [id]]),
        //         eta.add(timestamp),
        //     ),
        // );
        expect(await pythOraclePriceFeed.tokenPriceIds(btc.address)).to.be.eq(id);
        //todo test

        const abiCoder = new ethers.utils.AbiCoder();
        const fee = await mockPyth.getUpdateFee([btc.address]);
        // await expect(
        //     pythOraclePriceFeed.updatePrice(
        //         [btc.address],
        //         [abiCoder.encode(['uint256'], [abiCoder.encode(['uint256'], [price])])],
        //         { value: fee },
        //     ),
        // ).to.be.revertedWith('opk');
        await expect(
            indexPriceFeed.connect(user1).updatePrice([btc.address], [abiCoder.encode(['uint256'], [price])]),
        ).to.be.revertedWith('oep');
        await pythOraclePriceFeed
            .connect(owner)
            .updatePrice([btc.address], [abiCoder.encode(['uint256'], [price])], [0], { value: fee });
        await indexPriceFeed.connect(owner).updatePrice([btc.address], [price]);

        // console.log('btc:' + btc.address);
        expect(await pythOraclePriceFeed.getPrice(btc.address)).to.be.eq(toFullBNStr(price, 22));
        expect(await indexPriceFeed.getPrice(btc.address)).to.be.eq(price);
    });
});
