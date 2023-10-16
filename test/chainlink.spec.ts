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

import BN from 'bn.js';
import BigNumber from 'bignumber.js';
import { string } from 'yargs';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Duration, encodeParameterArray, increase, latest } from '../helpers';
const CHAINLINK_DECIMAL = 8;

export function toFullBN(val: number | string, decimals = 18): BN {
    const tokenDigit = new BigNumber('10').exponentiatedBy(decimals);
    const bigNumber = new BigNumber(val).multipliedBy(tokenDigit).toFixed(0);
    return new BN(bigNumber);
}

export function toFullBNStr(val: number | string, decimals = 18): string {
    return toFullBN(val, decimals).toString();
}

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
                encodeParameterArray(['address[]', 'address[]'], [[eth.address,btc.address,token3.address], [chainlinkMockETH.address,chainlinkMockBTC.address,chainlinkMock3.address]]),
                eta.add(timestamp),
            );



            await increase(Duration.days(1));

            await timelock.executeTransaction(
                chainlinkPriceFeed.address,
                0,
                'setTokenConfig(address[],address[])',
                encodeParameterArray(['address[]', 'address[]'], [[eth.address,btc.address,token3.address], [chainlinkMockETH.address,chainlinkMockBTC.address,chainlinkMock3.address]]),
                eta.add(timestamp),
            );

            expect(await chainlinkPriceFeed.priceFeeds(eth.address)).eq(chainlinkMockETH.address);
            expect(await chainlinkPriceFeed.priceFeeds(btc.address)).eq(chainlinkMockBTC.address);
            expect(await chainlinkPriceFeed.priceFeeds(token3.address)).eq(chainlinkMock3.address);
        });
    });

    // describe('remove oracle', () => {
    //     it('test owner', async () => {
    //         await expect(chainlinkPriceFeed.connect(dev).setTokenConfig(eth.address, chainlinkMockETH.address)).to.be.revertedWith(
    //             'Ownable: caller is not the owner',
    //         );
    //         await expect(chainlinkPriceFeed.connect(dev).removeOracle(eth.address)).to.be.revertedWith(
    //             'Ownable: caller is not the owner',
    //         );
    //     });
    //     it('remove oracle', async () => {
    //         await chainlinkPriceFeed.setTokenConfig(eth.address, chainlinkMockETH.address);
    //         await chainlinkPriceFeed.removeOracle(eth.address);
    //         expect(await chainlinkPriceFeed.tokenOracles(eth.address)).eq(EMPTY_ADDRESS);
    //         expect(await chainlinkPriceFeed.tokenDecimas(eth.address)).eq(0);

    //         await chainlinkPriceFeed.setTokenConfig(eth.address, chainlinkMockETH.address);
    //         await chainlinkPriceFeed.setTokenConfig(btc.address, chainlinkMockBTC.address);
    //         await chainlinkPriceFeed.removeOracle(btc.address);

    //         expect(await chainlinkPriceFeed.tokenOracles(btc.address)).eq(EMPTY_ADDRESS);
    //         expect(await chainlinkPriceFeed.tokenDecimas(btc.address)).eq(0);
    //         expect(await chainlinkPriceFeed.tokenOracles(eth.address)).eq(chainlinkMockETH.address);
    //         expect(await chainlinkPriceFeed.tokenDecimas(eth.address)).eq(8);
    //     });
    // });

    // describe('getprice', () => {
    //     beforeEach(async () => {
    //         await chainlinkPriceFeed.setTokenConfig(eth.address, chainlinkMockETH.address);

    //         await chainlinkMockETH.setAnswer(0, toChainLinkAnswer(1600), 1);
    //     });

    //     it('getPrice', async () => {
    //         const price = await chainlinkPriceFeed.getPrice(eth.address);
    //         expect(price).to.eq(toWei('1600'));
    //     });
    // });

    // describe('tokenToUnerlyingPrice', () => {
    //     beforeEach(async () => {
    //         await chainlinkPriceFeed.setTokenConfig(eth.address, chainlinkMockETH.address);
    //         await chainlinkPriceFeed.setTokenConfig(btc.address, chainlinkMockBTC.address);
    //         await chainlinkPriceFeed.setTokenConfig(token3.address, chainlinkMock3.address);

    //         await chainlinkMockETH.setAnswer(0, toChainLinkAnswer(100), 1);
    //         await chainlinkMockBTC.setAnswer(1, toChainLinkAnswer(200), 2);
    //         await chainlinkMock3.setAnswer(2, toChainLinkAnswer(300), 3);
    //     });

    //     it('getPrice', async () => {
    //         let price = await chainlinkPriceFeed.getPrice(usdc.address);
    //         expect(price).to.eq(toWei('1'));
    //         price = await chainlinkPriceFeed.getPrice(eth.address);
    //         expect(price).to.eq(toWei('100'));
    //         price = await chainlinkPriceFeed.getPrice(btc.address);
    //         expect(price).to.eq(toWei('200'));
    //         price = await chainlinkPriceFeed.getPrice(token3.address);
    //         expect(price).to.eq(toWei('300'));

    //         price = await chainlinkPriceFeed.tokenToUnerlyingPrice(usdc.address, usdc.address);
    //         expect(price).to.eq(toWei('1'));

    //         price = await chainlinkPriceFeed.tokenToUnerlyingPrice(eth.address, usdc.address);
    //         expect(price).to.eq(toWei('100'));

    //         price = await chainlinkPriceFeed.tokenToUnerlyingPrice(btc.address, usdc.address);
    //         expect(price).to.eq(toWei('200'));

    //         price = await chainlinkPriceFeed.tokenToUnerlyingPrice(token3.address, usdc.address);
    //         expect(price).to.eq(toWei('300'));

    //         price = await chainlinkPriceFeed.tokenToUnerlyingPrice(token3.address, eth.address);
    //         expect(price).to.eq(toWei('3'));

    //         price = await chainlinkPriceFeed.tokenToUnerlyingPrice(usdc.address, eth.address);
    //         expect(price).to.eq(toWei('0.01'));

    //         price = await chainlinkPriceFeed.tokenToUnerlyingPrice(usdc.address, btc.address);
    //         expect(price).to.eq(toWei('0.005'));

    //         price = await chainlinkPriceFeed.tokenToUnerlyingPrice(usdc.address, token3.address);
    //         expect(price).to.eq(toWei('0.003333333333333333'));

    //         price = await chainlinkPriceFeed.tokenToUnerlyingPrice(eth.address, btc.address);
    //         expect(price).to.eq(toWei('0.5'));
    //     });
    // });

    // describe('tokenToUnderlyingSize', () => {
    //     beforeEach(async () => {
    //         await chainlinkPriceFeed.setTokenConfig(eth.address, chainlinkMockETH.address);
    //         await chainlinkPriceFeed.setTokenConfig(btc.address, chainlinkMockBTC.address);
    //         await chainlinkPriceFeed.setTokenConfig(token3.address, chainlinkMock3.address);

    //         await chainlinkMockETH.setAnswer(0, toChainLinkAnswer(100), 1);
    //         await chainlinkMockBTC.setAnswer(1, toChainLinkAnswer(200), 2);
    //         await chainlinkMock3.setAnswer(2, toChainLinkAnswer(300), 3);
    //     });

    //     it('get size', async () => {
    //         let price = await chainlinkPriceFeed.getPrice(usdc.address);
    //         expect(price).to.eq(toWei('1'));
    //         price = await chainlinkPriceFeed.getPrice(eth.address);
    //         expect(price).to.eq(toWei('100'));
    //         price = await chainlinkPriceFeed.getPrice(btc.address);
    //         expect(price).to.eq(toWei('200'));
    //         price = await chainlinkPriceFeed.getPrice(token3.address);
    //         expect(price).to.eq(toWei('300'));

    //         let size = await chainlinkPriceFeed.tokenToUnderlyingSize(usdc.address, usdc.address, toWei('1'));
    //         expect(size).to.eq(toWei('1'));

    //         size = await chainlinkPriceFeed.tokenToUnderlyingSize(eth.address, usdc.address, toWei('1'));
    //         expect(size).to.eq(toFullBNStr(100, 6));

    //         size = await chainlinkPriceFeed.tokenToUnderlyingSize(btc.address, usdc.address, toFullBNStr(1, 8));
    //         expect(size).to.eq(toFullBNStr(200, 6));

    //         size = await chainlinkPriceFeed.tokenToUnderlyingSize(token3.address, usdc.address, toFullBNStr(1, 18));
    //         expect(size).to.eq(toFullBNStr(300, 6));

    //         size = await chainlinkPriceFeed.tokenToUnderlyingSize(token3.address, eth.address, toFullBNStr(1, 18));
    //         expect(size).to.eq(toWei('3'));

    //         size = await chainlinkPriceFeed.tokenToUnderlyingSize(usdc.address, eth.address, toFullBNStr(100, 6));
    //         expect(size).to.eq(toWei('1'));

    //         size = await chainlinkPriceFeed.tokenToUnderlyingSize(usdc.address, btc.address, toFullBNStr(200, 6));
    //         expect(size).to.eq(toFullBNStr(1, 8));

    //         size = await chainlinkPriceFeed.tokenToUnderlyingSize(usdc.address, token3.address, toFullBNStr(300, 6));
    //         expect(size).to.eq('999999000000000000');

    //         price = await chainlinkPriceFeed.tokenToUnderlyingSize(eth.address, btc.address, toFullBNStr(2, 18));
    //         expect(size).to.eq('999999000000000000');
    //     });
    // });
});
