// @ts-ignore
import { ethers } from 'hardhat';
import { getIndexPriceFeed, getOraclePriceFeed, getRoleManager, getTokens, waitForTx } from '../helpers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { PythOraclePriceFeed } from '../types';
import { BigNumber } from 'ethers';

declare var hre: HardhatRuntimeEnvironment;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(ethers.utils.formatEther(await deployer.getBalance()));

    const roleManager = await getRoleManager();
    const oraclePriceFeed = await getOraclePriceFeed();

    const keepers: string[] = [
        '0x7515faD273e6f1e0B36dc0Fda6628D94dc2512c2',
        '0x64eBDa3e06Ea291206fe5Df2684DEca5E36e5658',
        '0x19cD468095E89F3aA0B4442DF91047ba211B983A',
        '0x83eF4154f6b3FEE0Dc9Cd2A015Fc8de352c7B2eA',
        '0xC8Ea896A4dB392f2F9973F0c747340058AD7C883',
        '0x3E7B1Baa684BBea6F40Ce81D70805825d6DE600b',
        '0xBc7913F4fBf76Cd25131EF27dBcB88CaE29FEc56',
        '0x8cD00CDAeBe88674eD063e70A4C8C0211A1C1BB5',
        '0x77060DC85be51674915d98112B1f93e32fd7C70e',
        '0xF3E70777A5FCD2E8f2B7cd01eF89AB8D62C52052',
        '0xA689841E6aF5823a5772D22b16ea46E4D204bb61',
        '0x40D77EF4Ab4caf64752EeA0E4d401008007bC16f',
        '0x987b504e86661aA9EDE3D27a672B89ca58511E6a',
        '0x4d869Dc04CBD6f289DdE109F902cCa7809fd7cf0',
        '0xCD6ECEc9FB6eD9D6985CD0Ef3806BeC455eb9a65',
        '0xdf89c4d441c3f6e2a8E2eb50d95C2685887B5693',
        '0x812876AaBA09bA6f6A2bA2bc7E7f73443ee14d67',
        '0x2430E5eFaBB5eCB250575ab7C24573F46158BF7E',
        '0xc80032711776E2EA939CD1Abd2F379cF5980978f',
        '0x0A5FedC236657116235Ca574Eb206aE2e7E08374',
        '0xc5e0b53d8490898fa36b052222F85de98C4fE1B2',
        '0x6Ad5ac927Ed650AAbaDe61ec483fD549cDc93532',
        '0xB893AfBF7C00a2AE82B7816Fb6Bb9994DD98B445',
        '0x354Ad8188408698c18e15adD734303F3ab75E6ed',
        '0x6A71c8480f25dbfFDd9F36c0BB04d7597CB3b84A',
        '0xe90bB62905BA15c673b18026ad2577ef70b6d064',
        '0x5c2163d44fd51b1AEaa543e792DCF6F25Da4db93',
        '0x159b9d016D18021405F19EF4A4a65C265cCe7672',
        '0xd480fDd69257AA20e084e49B4a5D91BACb2855E5',
        '0x231cC0812c35DBC3D086879cFBCaa20b3222C26d',

        '0x801a5B93aDAdCe3B325D1cCB024F99472baE4728',
        '0x3b929C24A7a9ec6e6e917261059384991f712105',
        '0x80753b31b0e45E24D0F0D309B653221d90AbF660',
        '0xB0b2210679D3605394fa3891A8AD58A512b036D4',
        '0x6a13E180325292770e9653987f34E695F089B92a',

        '0xDD8454dFf91f865824A78fDC0416d5C9513cdB9A',
        '0x02a773F1b6dC711B8AA1070F733b3190F1a5b7Ed',
        '0xa766206477e928AB3Bd8eAB662af05888f3f7309',
        '0x01F883dC08aFddb44ef17807bEDae0E5B555aA8A',
        '0xcF5F92d58D6AC194ffaafF3DE2CE380C83bEE2D0',
        '0xC4a180Fc6006ef282928D504B731B439907c16E7',
        '0x485e4eeaD7F88208cdB85cE6dfdB34642d1670b9',
        '0xE914E0648D0Cd210c0B1f8f655292934C88A13c9',
        '0xe0473CcEA3c331d2fE404cb720f5c546A9981D3d',
        '0x1475d4517f9d5148e76c4415E158602b5F768756',
        '0x87cf6B3891B512c500993713238d60af18938E1C',
        '0xf5F10ae037B8C9A6f4d7b99577b80462298c340C',
        '0x6D91D64fBD3220228EDbE025eEC5e6dE0bf5fe58',
        '0xD011ec18CBe86407bd6135B43AC47eFAc5c05876',
        '0x37a0d4E719619dF2a5ba7293B8c28148C0128FE2',
        '0xaE3Ebd6bE8cCfDAC798b66904c26D6753EF204e4',
        '0xe5814967415c0128ceF7f93A83EaD328966547B8',
        '0x0dcCAe6A181802C8787630073C51A8f0E33AB351',
        '0x778375330DdB293497Eac813ff8A50CDb1b467Fc',
        '0x44d8557a216CD271505F0eE8dA2173a85Acefd8B',
        '0x05697229FFB7A660f1c24A01908a7dE7b1c69fad',
        '0x3036E48f22E01495E9D5a972f0119DA6CC288516',
        '0x527F4cD48753ba2D1eF1a142313977Db5Eb90A20',
        '0xd8dd095FaB418e9c305e6d734edA174F65bd7dd8',
        '0xcd7117982a05C23476dEC268D8a8cFc3F3b85cB7',
        '0xF04D640Fa91cDf7279CBa851FD0981639f416B90',
        '0x4148f3F51a914863593D0315fB85166aBD83e4FF',
        '0x548c5bF21C4ed2783E8bFC6C096D5217aB38d783',
        '0x107567841c98c733B260F19981660d1Fd27b011b',
        '0xe6e8E306bA42Ac7d8ca69A10EfE243B08638bE4a',
        '0xBa3472e4c19CA8eB5c1Bc78A77E0AFF856BcF849',
        '0x8692e99F83600888ec44a0354E969345d67eaFC9',
        '0xBb7D8B5f1c60af542D6C4c6beAeff4AE3244b5FD',
        '0xD794E61AE4afF85f775d7d89Af02B26ccB5b8a91',
        '0x3717B947D5E24Bf78B393133c9EFAa00E5C3C798',
    ];

    // for (let keeper of keepers) {
    //     await roleManager.addKeeper(keeper);
    //     await roleManager.addPoolAdmin(keeper);
    // }

    // const pythOraclePriceFeed = await ethers.getContractAt('PythOraclePriceFeed', oraclePriceFeed.address);
    // await pythOraclePriceFeed.connect(deployer).updatePriceAge(60);

    // const wallet = new ethers.Wallet(
    //     '',
    //     deployer.provider,
    // );

    let total = BigNumber.from('0');
    for (const keeper of keepers) {
        // await wallet.sendTransaction({
        //     to: keeper,
        //     value: ethers.utils.parseEther('2'),
        // });
        total = total.add(await deployer.provider.getBalance(keeper));
        console.log(
            `keeper: ${keeper} balance: ${ethers.utils.formatEther(await deployer.provider.getBalance(keeper))}`,
        );
    }
    console.log(`total: ${ethers.utils.formatEther(total)}`);
}

// 0x7515faD273e6f1e0B36dc0Fda6628D94dc2512c2_0x830ace302357a3206c5094cd6f91b51782168b61e1de6b4835246aac73032b97
// 0x64eBDa3e06Ea291206fe5Df2684DEca5E36e5658_0x571b6bb33687308fedcd4cf2010875a25fcc93bfb29ad794f358e7e725d28835
// 0x19cD468095E89F3aA0B4442DF91047ba211B983A_0x13bf9ed7131ca31d3b1cb69aecdec44b79dd8afc8977eb71159fd2311d9c4104
// 0x83eF4154f6b3FEE0Dc9Cd2A015Fc8de352c7B2eA_0x4c2ce9ea7ee3d8d77b225d9661016b1d5a20acc1c4914381a67ba4827cc977cb
// 0xC8Ea896A4dB392f2F9973F0c747340058AD7C883_0x2a1692ec9c76a4a884f9e8d3d0e16f6e0c4e6be0d9d94bc9ffe98dccc05b209d
// 0x3E7B1Baa684BBea6F40Ce81D70805825d6DE600b_0xf525bb12a1c8901e1ce83ea4df0ea95460a6f7f86953a2c43be773eeb549d128
// 0xBc7913F4fBf76Cd25131EF27dBcB88CaE29FEc56_0x5b160c96eef19c5bdb01c5acd7ad77855019eeee8840cba6f8a232006fad3146
// 0x8cD00CDAeBe88674eD063e70A4C8C0211A1C1BB5_0xac4e083d9cf0966f25eb5b30b202ecd55b5af923a505c7341601718e0b089f4c
// 0x77060DC85be51674915d98112B1f93e32fd7C70e_0xae9e386e993de866d03f887c73ba34e368e0f88c476f6008b75667bd847bc212
// 0xF3E70777A5FCD2E8f2B7cd01eF89AB8D62C52052_0x23bede524c5f1c7ae1cd6e100d4382643debdbd03b1ca5a6d3a181b86600d745
// 0xA689841E6aF5823a5772D22b16ea46E4D204bb61_0x5eec3bec9b383c98e4cf2566dc00f28be705b74815e2a3c8ec61234ff09ab604
// 0x40D77EF4Ab4caf64752EeA0E4d401008007bC16f_0x4008ea72b87a2d49d8d3774fd11130aaf8fe542dedb184e32838948da729f576
// 0x987b504e86661aA9EDE3D27a672B89ca58511E6a_0x55824d567d61945a0c3c6dcaa225a9b16f262fc61250747b8bde8289dbd62959
// 0x4d869Dc04CBD6f289DdE109F902cCa7809fd7cf0_0xc9be621c2052d34919e596dd6eac44275a312279ba9699c39315f8f098b3a110
// 0xCD6ECEc9FB6eD9D6985CD0Ef3806BeC455eb9a65_0x6c13fc4d8716a83334ab4be5e32135d956b676f5b09ac2d0e9fe546fcafeb144
// 0xdf89c4d441c3f6e2a8E2eb50d95C2685887B5693_0x7bf556595c9805b4d35e9fcbdaa33395a26d691f15b17af9006afb26ac73a0a3
// 0x812876AaBA09bA6f6A2bA2bc7E7f73443ee14d67_0x6161a625cd29c1881381dbc8e265111fceaae764a0b479ee9a2184b32baf1fc1
// 0x2430E5eFaBB5eCB250575ab7C24573F46158BF7E_0x40596dca54a0aff033dd0851666c726fe39f8df73d3fdfb102a4f4da3d682cd2
// 0xc80032711776E2EA939CD1Abd2F379cF5980978f_0xd3114786b5a395417f9411c5df33476b0d1e5068794f9b07554996d489b80773
// 0x0A5FedC236657116235Ca574Eb206aE2e7E08374_0x3de726a67679579c37f42105393674c9045178b582abd85ccc125ef79744fdd3
// 0xc5e0b53d8490898fa36b052222F85de98C4fE1B2_0x0aa656a0beb1ceb89e458b2945e0b7e2d19adc9c6add13cba4c7fe6c26b71e65
// 0x6Ad5ac927Ed650AAbaDe61ec483fD549cDc93532_0x8fbd9521bdcff7b7a95451f21c5e97b04ec9b3021e21222f4f8f48a4a1d9d5bf
// 0xB893AfBF7C00a2AE82B7816Fb6Bb9994DD98B445_0xf9415003843850e263b12e1a0b80c9de3829f76b6c7bed869f6f80c777539cee
// 0x354Ad8188408698c18e15adD734303F3ab75E6ed_0x64e573aca8b22cc7458e655e5fbd66c9558e7238afbb7067e9b48421a337baa1
// 0x6A71c8480f25dbfFDd9F36c0BB04d7597CB3b84A_0x1783c1a6476ac403da9c4e3c565d7b18f1dde3e41ff61793e3e6bd7dcf9fdf2b
// 0xe90bB62905BA15c673b18026ad2577ef70b6d064_0xbb9ab666574c7fe325e5509f282d05f97d390359701469f82a36f78ab864c007
// 0x5c2163d44fd51b1AEaa543e792DCF6F25Da4db93_0x93dd051adefe65342ccb28ef29fdba072dbe13ae9991d4383aa2f7aa21e6fca8
// 0x159b9d016D18021405F19EF4A4a65C265cCe7672_0x0ad8aec71f6959a58ef9b09853dfd64dadfde7dc42869fa6fc9d0b18a83f5d73
// 0xd480fDd69257AA20e084e49B4a5D91BACb2855E5_0x0ea8863c1c365e591e6f55c07e9e91d0d16844f8e1d8f2f411364100406f8e74
// 0x231cC0812c35DBC3D086879cFBCaa20b3222C26d_0xfac0f6f88e0cf40a2f485b2e95894fb65b560c5b8d405f6a935bc2845a037c2c

// 0x801a5B93aDAdCe3B325D1cCB024F99472baE4728_0x996ff9011b183d5f9d651f9b239b375a7472ea716a97bf5d3eb3fb5cc8f0ac7b
// 0x3b929C24A7a9ec6e6e917261059384991f712105_0x7d113215ca5b1ad13edfa0e5dd37ed27a3c18c2ccda15219ef3281c6c89ebc09
// 0x80753b31b0e45E24D0F0D309B653221d90AbF660_0x8a8df1cc48d5ed8c1288045306c07ce6ff8cee9beb2bf68bc3c07645bd554204
// 0xB0b2210679D3605394fa3891A8AD58A512b036D4_0x2d74252c1f1b93e48b1e866c891550fb217f85042d78a5780804dec64a4d1774
// 0x6a13E180325292770e9653987f34E695F089B92a_0x061e3103ebf1e1b62cb557120b3736d59fb4c1bcddbb440fc187ec0f4f2370c0

// 0xDD8454dFf91f865824A78fDC0416d5C9513cdB9A_0x286fb0ee518083b79bb279baf5f254286bb241712714b32675bae58d510f2557
// 0x02a773F1b6dC711B8AA1070F733b3190F1a5b7Ed_0xa2ee4d46999cb692f30a8941ddf9dfeb58cd6991b5e7fa9b93de34c2dcba8f9f
// 0xa766206477e928AB3Bd8eAB662af05888f3f7309_0x95911b96f97f69e3b36744c547058140f662e7660086ddc579ea0e1a09bc3c6e
// 0x01F883dC08aFddb44ef17807bEDae0E5B555aA8A_0xc38caefbf93cd05e7e83e7df983b5de20291f3245b76e35fc634acb5f8c00c66
// 0xcF5F92d58D6AC194ffaafF3DE2CE380C83bEE2D0_0x70df99881b1180fe07e7cb0720ceef5fe7df1d46f63fa48021455fd94d5f860a
// 0xC4a180Fc6006ef282928D504B731B439907c16E7_0xfdf14cf0345b67e677808e3f2db9ee72f901d0258e743b8bdf71f436641e5ea8
// 0x485e4eeaD7F88208cdB85cE6dfdB34642d1670b9_0xf5e4aec0cf2da6c38de4ec346bdfa2ef39012f55193e33ea5ce3bb658d98fa4d
// 0xE914E0648D0Cd210c0B1f8f655292934C88A13c9_0x6db6952c8fa2fd9d0919e5b29cb235ba2058565c4988cd860f6bda41e652f504
// 0xe0473CcEA3c331d2fE404cb720f5c546A9981D3d_0x7c151711b2b34c14f4b91b2bc561ca4c1bcbc47e37dcbe4df090702020cc7337
// 0x1475d4517f9d5148e76c4415E158602b5F768756_0x87ca2a520c0b85a337f241b92ec5ab8ead148467a447f1ecc67d436ac70a0f9c
// 0x87cf6B3891B512c500993713238d60af18938E1C_0x6e72056a54c86db54116b262be76145292781aad8d97e57e62d088f9b6edfec8
// 0xf5F10ae037B8C9A6f4d7b99577b80462298c340C_0x92be4c35332f195a749f488bf36df1ba01e9a1c290a7cb740fc73d995a5371c7
// 0x6D91D64fBD3220228EDbE025eEC5e6dE0bf5fe58_0x09377eedb1de5d79824ab1941c87b1f9504b6332ef13fb2982df5351c07453c8
// 0xD011ec18CBe86407bd6135B43AC47eFAc5c05876_0xbfd4bfb1d94a28fa0ff49667942903e4c2ea7b9a57d64e17dcdc9a0b796c0e9b
// 0x37a0d4E719619dF2a5ba7293B8c28148C0128FE2_0x1a6e9d0080902c04ced1613b6d15ea77851aa862267f96c02a0fcfc4561a3616
// 0xaE3Ebd6bE8cCfDAC798b66904c26D6753EF204e4_0x91ce63a79dcd0d15785d0b2fee48d69567e9bf4281125ab7c584cd49aca22df8
// 0xe5814967415c0128ceF7f93A83EaD328966547B8_0x153efed08b9c7a7e44855f0ca418078afc0b995922ad8cc606f62ee01f8fff54
// 0x0dcCAe6A181802C8787630073C51A8f0E33AB351_0x2906e8578678a59b477c443c4a2003dc8ad40d169f390b199abe3f7d86f74d90
// 0x778375330DdB293497Eac813ff8A50CDb1b467Fc_0x2f325a6a9afa02df52959bbfa12f95495542ba303cdce23068b23a55999b6077
// 0x44d8557a216CD271505F0eE8dA2173a85Acefd8B_0x5207d344ff0d755ffe6cf214e0002f9afa56c630caa4b7c14bd9dc8cf9bb28e8
// 0x05697229FFB7A660f1c24A01908a7dE7b1c69fad_0x9dbfe6575830f8b3dd6e792227b0cf11c4fac5179eb81fce0cd476082b79ba87
// 0x3036E48f22E01495E9D5a972f0119DA6CC288516_0x5601f2f0016f73850393c8ccd2336ab90b32f2534b2408cdb1114fed1d550e8a
// 0x527F4cD48753ba2D1eF1a142313977Db5Eb90A20_0x44e0a72d1e4ed950b8fb5aef6ec04419e030ec76bf26324be469401704f0d273
// 0xd8dd095FaB418e9c305e6d734edA174F65bd7dd8_0x6265eb1e68cc4d4f15cd7f8fd6ab25bb87deae6a538fd90cba2642db7fe63244
// 0xcd7117982a05C23476dEC268D8a8cFc3F3b85cB7_0xb6ed51f1fd16e450994b3f5aa837c4bd2658d1d07b9c37c39a4c31614afaf291
// 0xF04D640Fa91cDf7279CBa851FD0981639f416B90_0xe60da225f1cb206efb049cbb20a5598e1bc9eda4888d8e406c2b8dd6cf5ba65f
// 0x4148f3F51a914863593D0315fB85166aBD83e4FF_0xd6f259b6cd4ef46fcf6f3c5f27f8b13a32aa93a10fbc7395ad9bf7215d395033
// 0x548c5bF21C4ed2783E8bFC6C096D5217aB38d783_0xdc8503414594828bb3c0b789ed18a69bd714906e13f76b341317b1b3943629ef
// 0x107567841c98c733B260F19981660d1Fd27b011b_0x69be0520ebf79f77d19bdea57a9063b0b5c9fb5584a104b8f98bf0bdd27d8a3e
// 0xe6e8E306bA42Ac7d8ca69A10EfE243B08638bE4a_0xca7b319bdc072f41037a656f05976f3e88928e1f1a5a6cc67510ea581935a95c
// 0xBa3472e4c19CA8eB5c1Bc78A77E0AFF856BcF849_0x64e1c5854f3c4627960644b1a1b649fdd895de65dda1301a758cb3267e5ecec2
// 0x8692e99F83600888ec44a0354E969345d67eaFC9_0x4117a3a368ce6ac0dd6907755908fcc327473bb3c15007bb6e9094acb3db757b
// 0xBb7D8B5f1c60af542D6C4c6beAeff4AE3244b5FD_0xdeadc5c07b432896016298318c2b10aee1ed85a5959599bbe03975cefc835225
// 0xD794E61AE4afF85f775d7d89Af02B26ccB5b8a91_0xd42ae4daf067bdcad22a16bf9f7da809f223bbee7829b38087a16fb2f1acbb80
// 0x3717B947D5E24Bf78B393133c9EFAa00E5C3C798_0x7b0f2c86b31a5d4d02d4e9dc3501e6be4398e1e56d8309fd8ed1dc6b1333e755

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
