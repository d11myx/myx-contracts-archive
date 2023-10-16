import BN from 'bn.js';
import BigNumber from 'bignumber.js';

export function toFullBN(val: number | string, decimals = 18): BN {
    const tokenDigit = new BigNumber('10').exponentiatedBy(decimals);
    const bigNumber = new BigNumber(val).multipliedBy(tokenDigit).toFixed(0);
    return new BN(bigNumber);
}

export function toFullBNStr(val: number | string, decimals = 18): string {
    return toFullBN(val, decimals).toString();
}
