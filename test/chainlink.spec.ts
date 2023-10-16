import { expect, use } from 'chai';
import { fromWei, toWei } from 'web3-utils';

import { ethers, waffle } from 'hardhat';

import {
    MockChainLink,
    ChainlinkPriceFeed,
    ERC20DecimalsMock,
    Timelock,
    AddressesProvider,
    RoleManager,
} from '../types';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Duration, encodeParameterArray, increase, latest, toFullBN, toFullBNStr } from '../helpers';
const CHAINLINK_DECIMAL = 8;

export function toChainLinkAnswer(val: number, decimals = 8): string {
    return toFullBN(val, decimals).toString();
}
export async function getBlockTime(): Promise<number> {
    const blockNumAfter = await ethers.provider.getBlockNumber();
    const blockAfter = await ethers.provider.getBlock(blockNumAfter);
    return blockAfter.timestamp;
}

describe('ChainlinkpriceOracle Spec', () => {
    let addresses: string[];
    let chainlinkPriceFeed!: ChainlinkPriceFeed;
    let chainlinkMockETH!: MockChainLink;
    let chainlinkMockBTC!: MockChainLink;
    let chainlinkMock3!: MockChainLink;
    let eth!: ERC20DecimalsMock;
    let btc!: ERC20DecimalsMock;
    let token3!: ERC20DecimalsMock;
    let owner: SignerWithAddress,
        dev: SignerWithAddress,
        spender: SignerWithAddress,
        other: SignerWithAddress,
        user1: SignerWithAddress,
        user2: SignerWithAddress;
    const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000';
    let usdc: ERC20DecimalsMock;
    let timelock: Timelock;

    beforeEach(async () => {
        [owner, dev, spender, other, user1, user2] = await ethers.getSigners();
        const ERC20DecimalsMock = await ethers.getContractFactory('ERC20DecimalsMock');
        const ChainlinkPriceFeed = await ethers.getContractFactory('ChainlinkPriceFeed');
        const MockChainLink = await ethers.getContractFactory('MockChainLink');
        eth = (await ERC20DecimalsMock.deploy('token1', 'token1', 18)) as ERC20DecimalsMock;
        btc = (await ERC20DecimalsMock.deploy('token2', 'token2', 8)) as ERC20DecimalsMock;
        token3 = (await ERC20DecimalsMock.deploy('token3', 'token3', 18)) as ERC20DecimalsMock;
        usdc = (await ERC20DecimalsMock.deploy('usdc', 'usdc', 6)) as ERC20DecimalsMock;
        chainlinkMockETH = (await MockChainLink.deploy()) as MockChainLink;
        chainlinkMockBTC = (await MockChainLink.deploy()) as MockChainLink;
        chainlinkMock3 = (await MockChainLink.deploy()) as MockChainLink;

        const timelockFactory = await ethers.getContractFactory('Timelock');
        timelock = (await timelockFactory.deploy('3600')) as Timelock;

        const addressesProviderFactory = await ethers.getContractFactory('AddressesProvider');

        let addressProvider = (await addressesProviderFactory.deploy(timelock.address)) as AddressesProvider;
        const rolemanagerFactory = await ethers.getContractFactory('RoleManager');
        let roleManager = (await rolemanagerFactory.deploy()) as RoleManager;

        await addressProvider.setRolManager(roleManager.address);

        chainlinkPriceFeed = (await ChainlinkPriceFeed.deploy(addressProvider.address, [], [])) as ChainlinkPriceFeed;
    });

    describe('setTokenConfig', () => {
        it('setTokenConfig', async () => {
            await expect(chainlinkPriceFeed.setTokenConfig([eth.address], [EMPTY_ADDRESS])).to.be.revertedWith(
                'only timelock',
            );
            let timestamp = await latest();
            let eta = Duration.days(1);
            await timelock.queueTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(['address[]', 'address[]'], [[eth.address], [EMPTY_ADDRESS]]),
                eta.add(timestamp),
            );

            await timelock.queueTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(['address[]', 'address[]'], [[eth.address], [chainlinkMockETH.address]]),
                eta.add(timestamp),
            );
            await increase(Duration.days(1));
            // await expect(
            //     timelock.executeTransaction(
            //         chainlinkPriceFeed.address,
            //         0,
            //         'setTokenConfig(address[],address[])',
            //         encodeParameterArray(['address[]', 'address[]'], [[eth.address], [EMPTY_ADDRESS]]),
            //         eta.add(timestamp),
            //     ),
            // ).to.be.revertedWith('Transaction execution reverted.');

            await timelock.executeTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(['address[]', 'address[]'], [[eth.address], [chainlinkMockETH.address]]),
                eta.add(timestamp),
            );

            expect(await chainlinkPriceFeed.priceFeeds(eth.address)).eq(chainlinkMockETH.address);
            expect(await chainlinkPriceFeed.decimals()).eq(30);
            expect(await chainlinkPriceFeed.priceFeeds(btc.address)).eq(EMPTY_ADDRESS);
            expect(await chainlinkPriceFeed.decimals()).eq(30);
        });

        it('add multi oracle', async () => {
            let timestamp = await latest();
            let eta = Duration.days(1);

            await timelock.queueTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(
                    ['address[]', 'address[]'],
                    [
                        [eth.address, btc.address, token3.address],
                        [chainlinkMockETH.address, chainlinkMockBTC.address, chainlinkMock3.address],
                    ],
                ),
                eta.add(timestamp),
            );

            await increase(Duration.days(1));

            await timelock.executeTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(
                    ['address[]', 'address[]'],
                    [
                        [eth.address, btc.address, token3.address],
                        [chainlinkMockETH.address, chainlinkMockBTC.address, chainlinkMock3.address],
                    ],
                ),
                eta.add(timestamp),
            );

            expect(await chainlinkPriceFeed.priceFeeds(eth.address)).eq(chainlinkMockETH.address);
            expect(await chainlinkPriceFeed.priceFeeds(btc.address)).eq(chainlinkMockBTC.address);
            expect(await chainlinkPriceFeed.priceFeeds(token3.address)).eq(chainlinkMock3.address);
        });
    });

    describe('remove oracle', () => {
        // it('test owner', async () => {
        //     await expect(chainlinkPriceFeed.connect(dev).setTokenConfig(eth.address, chainlinkMockETH.address)).to.be.revertedWith(
        //         'Ownable: caller is not the owner',
        //     );
        //     await expect(chainlinkPriceFeed.connect(dev).removeOracle(eth.address)).to.be.revertedWith(
        //         'Ownable: caller is not the owner',
        //     );
        // });
        it('remove oracle', async () => {
            let timestamp = await latest();
            let eta = Duration.days(1);

            await timelock.queueTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(
                    ['address[]', 'address[]'],
                    [
                        [eth.address, btc.address, token3.address],
                        [chainlinkMockETH.address, chainlinkMockBTC.address, chainlinkMock3.address],
                    ],
                ),
                eta.add(timestamp),
            );

            await timelock.queueTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(['address[]', 'address[]'], [[btc.address], [EMPTY_ADDRESS]]),
                eta.add(timestamp),
            );

            await increase(Duration.days(1));

            await timelock.executeTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(
                    ['address[]', 'address[]'],
                    [
                        [eth.address, btc.address, token3.address],
                        [chainlinkMockETH.address, chainlinkMockBTC.address, chainlinkMock3.address],
                    ],
                ),
                eta.add(timestamp),
            );

            await timelock.executeTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(['address[]', 'address[]'], [[btc.address], [EMPTY_ADDRESS]]),
                eta.add(timestamp),
            );

            expect(await chainlinkPriceFeed.priceFeeds(eth.address)).eq(chainlinkMockETH.address);
            expect(await chainlinkPriceFeed.priceFeeds(btc.address)).eq(EMPTY_ADDRESS);
            expect(await chainlinkPriceFeed.priceFeeds(token3.address)).eq(chainlinkMock3.address);
        });
    });

    describe('getprice', () => {
        beforeEach(async () => {
            let timestamp = await latest();
            let eta = Duration.days(1);

            await timelock.queueTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(['address[]', 'address[]'], [[eth.address], [chainlinkMockETH.address]]),
                eta.add(timestamp),
            );
            await increase(Duration.days(1));
            await timelock.executeTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(['address[]', 'address[]'], [[eth.address], [chainlinkMockETH.address]]),
                eta.add(timestamp),
            );
            await chainlinkMockETH.setAnswer(0, toChainLinkAnswer(1600), 1);
        });

        it('getPrice', async () => {
            const price = await chainlinkPriceFeed.getPrice(eth.address);
            expect(price).to.eq(toFullBNStr('1600', 30));
        });
    });

    describe('tokenToUnerlyingPrice', () => {
        beforeEach(async () => {
            let timestamp = await latest();
            let eta = Duration.days(1);

            await timelock.queueTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(
                    ['address[]', 'address[]'],
                    [
                        [eth.address, btc.address, token3.address],
                        [chainlinkMockETH.address, chainlinkMockBTC.address, chainlinkMock3.address],
                    ],
                ),
                eta.add(timestamp),
            );

            await timelock.queueTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(['address[]', 'address[]'], [[btc.address], [EMPTY_ADDRESS]]),
                eta.add(timestamp),
            );

            await increase(Duration.days(1));

            await timelock.executeTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(
                    ['address[]', 'address[]'],
                    [
                        [eth.address, btc.address, token3.address],
                        [chainlinkMockETH.address, chainlinkMockBTC.address, chainlinkMock3.address],
                    ],
                ),
                eta.add(timestamp),
            );

            await chainlinkMockETH.setAnswer(0, toChainLinkAnswer(100), 1);
            await chainlinkMockBTC.setAnswer(1, toChainLinkAnswer(200), 2);
            await chainlinkMock3.setAnswer(2, toChainLinkAnswer(300), 3);
        });

        it('getPrice', async () => {
            let price = await chainlinkPriceFeed.getPrice(eth.address);
            expect(price).to.eq(toFullBNStr('100', 30));
            price = await chainlinkPriceFeed.getPrice(btc.address);
            expect(price).to.eq(toFullBNStr('200', 30));
            price = await chainlinkPriceFeed.getPrice(token3.address);
            expect(price).to.eq(toFullBNStr('300', 30));
        });
    });
});
