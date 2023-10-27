import { ethers } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
declare var hre: HardhatRuntimeEnvironment;

interface AccountItem {
    name: string;
    account: string;
    balance: string;
}

export const getWalletBalances = async () => {
    const accounts = await hre.getNamedAccounts();

    const acc: AccountItem[] = [];
    for (let accKey of Object.keys(accounts)) {
        acc.push({
            name: accKey,
            account: accounts[accKey],
            balance: ethers.utils.formatEther(await hre.ethers.provider.getBalance(accounts[accKey])),
        });
    }
    return acc;
};

export function encodeParameters(types: string[], values: string[]) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

export function encodeParameterArray(types: string[], values: string[][]) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}
