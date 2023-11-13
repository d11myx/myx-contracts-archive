import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { EvmPriceServiceConnection } from '@pythnetwork/pyth-evm-js';
// @ts-ignore
import { ethers } from 'hardhat';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(await deployer.getBalance());

    const BTC_USD_FEED_main = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
    const BTC_USD_FEED_test = '0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b';

    const conn = new EvmPriceServiceConnection('https://hermes.pyth.network');

    // const priceId = BTC_USD_FEED as string;
    // The unix timestamp in seconds
    // const unixTimestamp = await getBlockTimestamp();
    // console.log(`Querying unix timestamp: ${unixTimestamp}`);
    const unixTimestamp = (new Date().getTime() / 1000).toFixed(0);
    console.log(`Querying unix timestamp: ${unixTimestamp}`);

    // const [priceFeedUpdateVaa, updateTimestamp] = await conn.getVaa(priceId, unixTimestamp);
    // console.log(`Next pyth update was at: ${updateTimestamp}`);
    // console.log(priceFeedUpdateVaa);

    const priceFeedUpdate = await conn.getPriceFeedsUpdateData([BTC_USD_FEED_main]);
    console.log(priceFeedUpdate);

    // const priceFeedUpdate = '0x' + Buffer.from(priceFeedUpdateVaa, 'base64').toString('hex');

    const pyth = await ethers.getContractAt('IPyth', '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729');

    const updateFee = await pyth.getUpdateFee(priceFeedUpdate);
    console.log(`Update fee: ${updateFee}`);

    const wallet = new ethers.Wallet('', deployer.provider);

    // const mockPythFactory = await ethers.getContractFactory('MockPyth', wallet);
    // const mockPyth = await mockPythFactory.deploy(60, 1);
    const mockPyth = await ethers.getContractAt('MockPyth', '0xC227dfA6dC62fA493153592b0c520f4224D0a396');
    // const mockPythArtifact = await deployments.deploy(`MockPyth`, {
    //     from: wallet.address,
    //     contract: 'MockPyth',
    //     args: [60, 1],
    // });
    // const mockPyth = (await ethers.getContractAt(mockPythArtifact.abi, mockPythArtifact.address)) as MockPyth;
    console.log(`mockPyth: ${mockPyth.address}`);

    // const id = BTC_USD_FEED_main;
    // const price = 2784800000000;
    // const conf = 944722067;
    // const expo = -8;
    // const emaPrice = 2784800000000;
    // const emaConf = 944722067;
    // const publishTime = unixTimestamp;
    // const mockUpdateData = await mockPyth.createPriceFeedUpdateData(
    //     id,
    //     price,
    //     conf,
    //     expo,
    //     emaPrice,
    //     emaConf,
    //     publishTime,
    // );
    // console.log(mockUpdateData);
    // await pyth.connect(wallet).updatePriceFeeds(priceFeedUpdate, { value: updateFee });

    // await pyth
    //     .connect(wallet)
    //     .updatePriceFeedsIfNecessary(priceFeedUpdate, [BTC_USD_FEED_main], [unixTimestamp + 1000], {
    //         value: updateFee,
    //     });
    console.log(await pyth.getPriceUnsafe(BTC_USD_FEED_main));
    // console.log(await pyth.getPrice(BTC_USD_FEED_main));
    // await pyth.parsePriceFeedUpdates(priceFeedUpdate, [priceId], unixTimestamp, unixTimestamp + 1000);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
