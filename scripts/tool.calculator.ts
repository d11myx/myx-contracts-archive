// @ts-ignore
import { ethers } from 'hardhat';
import { getOraclePriceFeed, getPositionManager, getTokens } from '../helpers';
import { PositionManager, MockERC20Token, PythOraclePriceFeed } from '../types';
import Decimal from 'decimal.js';
import { parseUnits } from 'ethers/lib/utils';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(`deployer: `, deployer.address);
    console.log(`deployer balance:`, (await deployer.getBalance()) / 1e18);
    console.log();
    const positionManager = await getPositionManager();
    const priceOracle = await getOraclePriceFeed();

    const { btc } = await getTokens();

    const btcPrice = await getTokenPrice(priceOracle, btc);

    console.log(`btcPrice:`, btcPrice);

    const account = '0x2068f8e9C9e61A330F2F713C998D372C04e3C9Cc';
    const pairIndex = 1;
    const isLong = false;
    await calculateMaxDecreaseMargin(positionManager, account, pairIndex, isLong, btcPrice);
}

async function getTokenPrice(priceOracle: PythOraclePriceFeed, token: MockERC20Token) {
    const price = await priceOracle.getPrice(token.address);
    return new Decimal(price.toString()).div(1e30);
}

async function calculateMaxDecreaseMargin(
    positionManager: PositionManager,
    account: string,
    pairIndex: number,
    isLong: boolean,
    price: Decimal,
) {
    const userPosition = await positionManager.getPosition(account, pairIndex, isLong);
    const margin = new Decimal(userPosition.collateral.toString()).div(1e18);
    const size = new Decimal(userPosition.positionAmount.toString()).div(1e18);
    const averagePrice = new Decimal(userPosition.averagePrice.toString()).div(1e30);

    const fundingFee = await positionManager.getFundingFee(account, pairIndex, isLong);
    const fundingFeeFormatted = new Decimal(fundingFee.toString()).div(1e18);

    const tradingFee = await positionManager.getTradingFee(pairIndex, isLong, parseUnits(size.toString(), 18));
    const tradingFeeFormatted = new Decimal(tradingFee.toString()).div(1e18);

    let pnl = averagePrice.sub(price).mul(size);
    if (isLong) {
        pnl = pnl.mul(-1);
    }

    const initMargin = size.mul(averagePrice).div(50);

    console.log(`initMargin:`, initMargin);
    console.log(`fundingFee:`, fundingFeeFormatted);
    console.log(`tradingFee:`, tradingFeeFormatted);
    console.log(`pnl:`, pnl);

    const minMarginRequired = new Decimal(initMargin).add(tradingFeeFormatted).sub(fundingFeeFormatted).sub(pnl);
    console.log(`minimum margin required:`, minMarginRequired);
    console.log(`max decrease margin amount:`, margin.sub(minMarginRequired));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
