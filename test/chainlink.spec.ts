import { expect, use } from "chai";
import { fromWei,  toWei } from "web3-utils";
import {
    PriceOracle,
    MockChainLink,
    ERC20DecimalsMock,
} from "../typechain-types";
import { ethers, waffle } from "hardhat";

import { toChainLinkAnswer, toFullBNStr } from "./util";

import { SignerWithAddress } from "./fixturs.test";

describe("ChainlinkpriceOracle Spec", () => {
    let addresses: string[];
    let priceOracle!: PriceOracle;
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
    const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
    let usdc: ERC20DecimalsMock;

    beforeEach(async () => {
        [owner, dev, spender, other, user1, user2] = await ethers.getSigners();
        const ERC20DecimalsMock = await ethers.getContractFactory(
            "ERC20DecimalsMock"
        );
        const PriceOracle = await ethers.getContractFactory("PriceOracle");
        const MockChainLink = await ethers.getContractFactory("MockChainLink");
        eth = (await ERC20DecimalsMock.deploy(
            "token1",
            "token1",
            18
        )) as ERC20DecimalsMock;
        btc = (await ERC20DecimalsMock.deploy(
            "token2",
            "token2",
            8
        )) as ERC20DecimalsMock;
        token3 = (await ERC20DecimalsMock.deploy(
            "token3",
            "token3",
            18
        )) as ERC20DecimalsMock;
        usdc = (await ERC20DecimalsMock.deploy(
            "usdc",
            "usdc",
            6
        )) as ERC20DecimalsMock;
        chainlinkMockETH = (await MockChainLink.deploy()) as MockChainLink;
        chainlinkMockBTC = (await MockChainLink.deploy()) as MockChainLink;
        chainlinkMock3 = (await MockChainLink.deploy()) as MockChainLink;

        priceOracle = (await PriceOracle.deploy(usdc.address)) as PriceOracle;
    });

    describe("setOracle", () => {
        it("setOracle", async () => {
            await expect(
                priceOracle.setOracle(eth.address, EMPTY_ADDRESS)
            ).to.be.revertedWith("is 0");
            await priceOracle.setOracle(eth.address, chainlinkMockETH.address);
            expect(await priceOracle.tokenOracles(eth.address)).eq(
                chainlinkMockETH.address
            );
            expect(await priceOracle.tokenDecimas(eth.address)).eq(8);
            expect(await priceOracle.tokenOracles(btc.address)).eq(
                EMPTY_ADDRESS
            );
            expect(await priceOracle.tokenDecimas(btc.address)).eq(0);
        });

        it("add multi oracle", async () => {
            await priceOracle.setOracle(eth.address, chainlinkMockETH.address);
            await priceOracle.setOracle(btc.address, chainlinkMockBTC.address);
            await priceOracle.setOracle(token3.address, chainlinkMock3.address);

            expect(await priceOracle.tokenOracles(eth.address)).eq(
                chainlinkMockETH.address
            );
            expect(await priceOracle.tokenOracles(btc.address)).eq(
                chainlinkMockBTC.address
            );
            expect(await priceOracle.tokenOracles(token3.address)).eq(
                chainlinkMock3.address
            );
        });
    });

    describe("remove oracle", () => {
        it("test owner", async () => {
            await expect(
                priceOracle
                    .connect(dev)
                    .setOracle(eth.address, chainlinkMockETH.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                priceOracle.connect(dev).removeOracle(eth.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("remove oracle", async () => {
            await priceOracle.setOracle(eth.address, chainlinkMockETH.address);
            await priceOracle.removeOracle(eth.address);
            expect(await priceOracle.tokenOracles(eth.address)).eq(
                EMPTY_ADDRESS
            );
            expect(await priceOracle.tokenDecimas(eth.address)).eq(0);

            await priceOracle.setOracle(eth.address, chainlinkMockETH.address);
            await priceOracle.setOracle(btc.address, chainlinkMockBTC.address);
            await priceOracle.removeOracle(btc.address);

            expect(await priceOracle.tokenOracles(btc.address)).eq(
                EMPTY_ADDRESS
            );
            expect(await priceOracle.tokenDecimas(btc.address)).eq(0);
            expect(await priceOracle.tokenOracles(eth.address)).eq(
                chainlinkMockETH.address
            );
            expect(await priceOracle.tokenDecimas(eth.address)).eq(8);
        });
    });

    describe("getprice", () => {
        beforeEach(async () => {
            await priceOracle.setOracle(eth.address, chainlinkMockETH.address);

            await chainlinkMockETH.setAnswer(0, toChainLinkAnswer(1600), 1);
        });

        it("getPrice", async () => {
            const price = await priceOracle.getPrice(eth.address);
            expect(price).to.eq(toWei("1600"));
        });
    });

    describe("tokenToUnerlyingPrice", () => {
        beforeEach(async () => {
            await priceOracle.setOracle(eth.address, chainlinkMockETH.address);
            await priceOracle.setOracle(btc.address, chainlinkMockBTC.address);
            await priceOracle.setOracle(token3.address, chainlinkMock3.address);

            await chainlinkMockETH.setAnswer(0, toChainLinkAnswer(100), 1);
            await chainlinkMockBTC.setAnswer(1, toChainLinkAnswer(200), 2);
            await chainlinkMock3.setAnswer(2, toChainLinkAnswer(300), 3);
        });

        it("getPrice", async () => {
            let price = await priceOracle.getPrice(usdc.address);
            expect(price).to.eq(toWei("1"));
            price = await priceOracle.getPrice(eth.address);
            expect(price).to.eq(toWei("100"));
            price = await priceOracle.getPrice(btc.address);
            expect(price).to.eq(toWei("200"));
            price = await priceOracle.getPrice(token3.address);
            expect(price).to.eq(toWei("300"));

            price = await priceOracle.tokenToUnerlyingPrice(
                usdc.address,
                usdc.address
            );
            expect(price).to.eq(toWei("1"));

            price = await priceOracle.tokenToUnerlyingPrice(
                eth.address,
                usdc.address
            );
            expect(price).to.eq(toWei("100"));

            price = await priceOracle.tokenToUnerlyingPrice(
                btc.address,
                usdc.address
            );
            expect(price).to.eq(toWei("200"));

            price = await priceOracle.tokenToUnerlyingPrice(
                token3.address,
                usdc.address
            );
            expect(price).to.eq(toWei("300"));

            price = await priceOracle.tokenToUnerlyingPrice(
                token3.address,
                eth.address
            );
            expect(price).to.eq(toWei("3"));

            price = await priceOracle.tokenToUnerlyingPrice(
                usdc.address,
                eth.address
            );
            expect(price).to.eq(toWei("0.01"));

            price = await priceOracle.tokenToUnerlyingPrice(
                usdc.address,
                btc.address
            );
            expect(price).to.eq(toWei("0.005"));

            price = await priceOracle.tokenToUnerlyingPrice(
                usdc.address,
                token3.address
            );
            expect(price).to.eq(toWei("0.003333333333333333"));

            price = await priceOracle.tokenToUnerlyingPrice(
                eth.address,
                btc.address
            );
            expect(price).to.eq(toWei("0.5"));
        });
    });

    describe("tokenToUnderlyingSize", () => {
        beforeEach(async () => {
            await priceOracle.setOracle(eth.address, chainlinkMockETH.address);
            await priceOracle.setOracle(btc.address, chainlinkMockBTC.address);
            await priceOracle.setOracle(token3.address, chainlinkMock3.address);

            await chainlinkMockETH.setAnswer(0, toChainLinkAnswer(100), 1);
            await chainlinkMockBTC.setAnswer(1, toChainLinkAnswer(200), 2);
            await chainlinkMock3.setAnswer(2, toChainLinkAnswer(300), 3);
        });

        it("get size", async () => {
            let price = await priceOracle.getPrice(usdc.address);
            expect(price).to.eq(toWei("1"));
            price = await priceOracle.getPrice(eth.address);
            expect(price).to.eq(toWei("100"));
            price = await priceOracle.getPrice(btc.address);
            expect(price).to.eq(toWei("200"));
            price = await priceOracle.getPrice(token3.address);
            expect(price).to.eq(toWei("300"));

            let size = await priceOracle.tokenToUnderlyingSize(
                usdc.address,
                usdc.address,
                toWei("1")
            );
            expect(size).to.eq(toWei("1"));

            size = await priceOracle.tokenToUnderlyingSize(
                eth.address,
                usdc.address,
                toWei("1")
            );
            expect(size).to.eq(toFullBNStr(100, 6));

            size = await priceOracle.tokenToUnderlyingSize(
                btc.address,
                usdc.address,
                toFullBNStr(1, 8)
            );
            expect(size).to.eq(toFullBNStr(200, 6));

            size = await priceOracle.tokenToUnderlyingSize(
                token3.address,
                usdc.address,
                toFullBNStr(1, 18)
            );
            expect(size).to.eq(toFullBNStr(300, 6));

            size = await priceOracle.tokenToUnderlyingSize(
                token3.address,
                eth.address,
                toFullBNStr(1, 18)
            );
            expect(size).to.eq(toWei("3"));

            size = await priceOracle.tokenToUnderlyingSize(
                usdc.address,
                eth.address,
                toFullBNStr(100, 6)
            );
            expect(size).to.eq(toWei("1"));

            size = await priceOracle.tokenToUnderlyingSize(
                usdc.address,
                btc.address,
                toFullBNStr(200, 6)
            );
            expect(size).to.eq(toFullBNStr(1, 8));

            size = await priceOracle.tokenToUnderlyingSize(
                usdc.address,
                token3.address,
                toFullBNStr(300, 6)
            );
            expect(size).to.eq("999999000000000000");

            price = await priceOracle.tokenToUnderlyingSize(
                eth.address,
                btc.address,
                toFullBNStr(2, 18)
            );
            expect(size).to.eq("999999000000000000");
        });
    });
});
