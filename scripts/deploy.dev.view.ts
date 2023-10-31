// @ts-ignore
import hre, { ethers } from 'hardhat';
import { getOraclePriceFeed, getPool, getTokens } from '../helpers';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/src/signers';

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    // const router = await getRouter();
    // const orderManager = await getOrderManager();
    // const positionManager = await getPositionManager();
    // const executor = await getExecutor();
    // const executionLogic = await getExecutionLogic();
    const priceOracle = await getOraclePriceFeed();
    const pool = await getPool();

    const { btc, eth, usdt } = await getTokens();

    const btcOraclePrice = ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30);
    const ethOraclePrice = ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30);
    const btcIndexPrice = ethers.utils.formatUnits(await priceOracle.getPrice(btc.address), 30);
    const ethIndexPrice = ethers.utils.formatUnits(await priceOracle.getPrice(eth.address), 30);
    console.log(`btc price:`, btcOraclePrice);
    console.log(`eth price:`, ethOraclePrice);
    console.log(`btc price:`, btcIndexPrice);
    console.log(`eth price:`, ethIndexPrice);

    // curl -X POST --data '{"jsonrpc":"2.0","method":"hardhat_setBalance","params":["0x2068f8e9C9e61A330F2F713C998D372C04e3C9Cc","0xde0b6b3a7640000"],"id":1}' https://pre-rpc.myx.cash
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    for (let signer of signers) {
        // await hre.network.provider.send('hardhat_setBalance', [signer.address, '0xde0b6b3a7640000']);
        // console.log(
        //     `curl -X POST --data '{"jsonrpc":"2.0","method":"hardhat_setBalance","params":["${signer.address}","0xde0b6b3a7640000"],"id":1}' https://pre-rpc.myx.cash`,
        // );
        console.log(
            signer.address + '_' + ethers.utils.formatEther(await deployer.provider.getBalance(signer.address)),
        );
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
