import { BigNumber } from 'ethers';
import { MockERC20Token } from '../types';
import Decimal from 'decimal.js';

export async function convertIndexAmountToStable(
    indexToken: MockERC20Token,
    stableToken: MockERC20Token,
    indexAmount: BigNumber,
): Promise<BigNumber> {
    const indexDec = await indexToken.decimals(); 
    const stableDec = await stableToken.decimals(); 
    return BigNumber.from(
        new Decimal(indexAmount.toString())
            .mul(10 ** (18 - indexDec))
            .div(10 ** (18 - stableDec))
            .toFixed(0),
    );
}

export async function convertStableAmountToIndex(
    indexToken: MockERC20Token,
    stableToken: MockERC20Token,
    stableAmount: BigNumber,
): Promise<BigNumber> {
    const indexDec = await indexToken.decimals(); 
    const stableDec = await stableToken.decimals(); 
    return BigNumber.from(
        new Decimal(stableAmount.toString())
            .mul((10 ** (18 - stableDec)).toString())
            .div((10 ** (18 - indexDec)).toString())
            .toFixed(0),
    );
}

export async function convertStableAmount(
    stableToken: MockERC20Token,
    stableAmount: BigNumber,
    decimals: number,
): Promise<BigNumber> {
    const stableDec = await stableToken.decimals();
    return BigNumber.from(
        new Decimal(stableAmount.toString())
            .mul((10 ** (18 - stableDec)).toString())
            .div((10 ** (18 - decimals)).toString())
            .toFixed(0),
    );
}

export async function convertIndexAmount(
    indexToken: MockERC20Token,
    indexAmount: BigNumber,
    decimals: number,
): Promise<BigNumber> {
    const stableDec = await indexToken.decimals();
    return BigNumber.from(
        new Decimal(indexAmount.toString())
            .mul((10 ** (18 - stableDec)).toString())
            .div((10 ** (18 - decimals)).toString())
            .toFixed(0),
    );
}
