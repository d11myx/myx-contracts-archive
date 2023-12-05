// @ts-ignore
import { ethers } from 'hardhat';
import { abiCoder, getOraclePriceFeed, getPool, getRouter, getTokens, MAX_UINT_AMOUNT, waitForTx } from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { EvmPriceServiceConnection } from '@pythnetwork/pyth-evm-js';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(ethers.utils.formatEther(await deployer.getBalance()));

    const oraclePriceFeed = await getOraclePriceFeed();
    const pool = await getPool();
    const router = await getRouter();

    const { btc, usdt } = await getTokens();

    const priceId = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
    const conn = new EvmPriceServiceConnection('https://hermes.pyth.network');
    const vaas = await conn.getLatestVaas([priceId]);
    const priceFeedUpdate = '0x' + Buffer.from(vaas[0], 'base64').toString('hex');

    const wallet = new ethers.Wallet(
        'a5f6cbc5851da39699e5779e9d2c61966ea50ea08988c5430785e8d2c8c71eeb',
        deployer.provider,
    );

    console.log(`wallet: ${wallet.address}`);

    for (let i = 0; i < 100; i++) {
        const _account = ethers.Wallet.createRandom();

        const account = new ethers.Wallet(_account.privateKey, deployer.provider);
        console.log(`account: ${account.address}`);
        await waitForTx(
            await wallet.sendTransaction({
                to: account.address,
                value: ethers.utils.parseEther('0.0011'),
            }),
        );
        console.log(
            `keeper: ${account.address} balance: ${ethers.utils.formatEther(
                await deployer.provider.getBalance(account.address),
            )}`,
        );

        const lpAmount = await ethers.utils.parseEther(randomNumber().toString());
        const { depositIndexAmount, depositStableAmount } = await pool.getDepositAmount(
            1,
            lpAmount,
            await oraclePriceFeed.getPrice(btc.address),
        );

        await waitForTx(await btc.connect(deployer).mint(account.address, depositIndexAmount));
        await waitForTx(await usdt.connect(deployer).mint(account.address, depositStableAmount));
        await waitForTx(await btc.connect(account).approve(router.address, MAX_UINT_AMOUNT));
        await waitForTx(await usdt.connect(account).approve(router.address, MAX_UINT_AMOUNT));

        const gas = await router
            .connect(account)
            .estimateGas.addLiquidity(
                btc.address,
                usdt.address,
                depositIndexAmount,
                depositStableAmount,
                [btc.address],
                [priceFeedUpdate],
                { value: 1, gasLimit: '1000000' },
            );
        console.log(
            await router
                .connect(account)
                .addLiquidity(
                    btc.address,
                    usdt.address,
                    depositIndexAmount,
                    depositStableAmount,
                    [btc.address],
                    [priceFeedUpdate],
                    { value: 1, gasLimit: gas.mul('120').div('100') },
                ),
        );
    }

    function randomNumber() {
        const min = 500;
        const max = 100000;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
