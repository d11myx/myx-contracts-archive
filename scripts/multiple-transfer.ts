// @ts-ignore
import { ethers } from 'hardhat';
import { waitForTx } from '../helpers';
import { MultipleTransfer } from '../types';
import { MerkleTree } from 'merkletreejs';
import keccak256 = require('keccak256');

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    console.log(ethers.utils.formatEther(await deployer.getBalance()));

    const multipleTransfer = (await ethers.getContractAt(
        'MultipleTransfer',
        '0xbe933E49E9Bd362DE22D680a713De83BFC395aB0',
    )) as MultipleTransfer;

    const keepers: string[] = [
        '0x57E70053319297E34c0B38A50F8B9E0e4D52b703',
        '0x4BF0af1deeEbCCA7AB4E56f9d25e37023bd82BeA',
        '0x48dfCB49aB855f531Ec6b3b5e87dCc754595d926',
        '0xC84ECdbDD5D369bF6Ee6E5479112F6860E9C2a6D',
        '0xD12e0173F2950df675071a1db47F9A07d9670B92',
        '0x54DfE50b305f3E2AE74e04f448B399D9c36b0F8e',
        '0xd252B5298f9baC0af8CE4E7CB82E082dE3878628',
        '0x8CE2f46a71283C76ABE9ad33271AFE50F1147f5e',
        '0xa96D64ba3b0D8D3Ec35560F20EB10F857942D01B',
        '0xB1e39211aE24f38857C252487a40b318e4159F9A',
        '0x8EDA028171900dF1129E6dC01eF1c93019455156',
        '0xe33224312832E780586C9aF43a29a1eeaD4A50E4',
        '0xE14E65c6192175Bd72A475198C716E8e9f6A1b9D',
        '0x14B9Ef347206bc095A40AE6B73330539fe7440bc',
        '0xBbbbbBA0A9e8C8C4EBDD88C6ec5A907826a3C7F6',
        '0xcd9b15167902A0C3b4750c13Aea0983EaFABc02A',
        '0x312aceD188D8fd8dfC73552094B90676ca5E55fb',
        '0x465D662C4dcf2f4f4a047BE1AbDD5551100C124E',
        '0x7f6Bd4908ae2b61b7e88F3e7Ec51C77456aD7f2C',
        '0x34660d8FB093821A51EC36C1A57e2bdD743dc541',
        '0x3c628d2Ac2d57b1b7B09d7b610187fb94f6543Fa',
        '0x2E83649fda7eC71a459c96c82b45032aD9678Db6',
        '0x5a39686BdC40C279677E9548eB9F49558c7670Ba',
        '0x0C6cDF6E0FB67C8989428e8e9B3BE5851f3911c7',
        '0xf0CAb5356b14d1aa2844E595d95eFF997bFDfF0E',
        '0x2BD098280a8b0Ce00155115Da0983C142b472704',
        '0xfBFEC9e68247492803B53325D99cA36b7bC615c9',
        '0x01e785480Cd9bb2DcE5B13586950Bc6efb4F51FB',
        '0x12bf841918A5d12eff97eA3B250Eb4dD1ab9BDDB',
        '0xd16C506Fc6340AC224B0409c370272ba708315aF',
        '0xB311cE2707e892ed5CCb9ADF0bc2A4Aa5c763dC9',
        '0x3F788d0eC3d1109566830a1f642E9CF04bD623A7',
        '0x8C17890442Dc57BF63f515ffB3b6fFF53c1947dB',
        '0x3731cdEc34eA238A619D174BdB165323a10F778b',
        '0x466617C6D901FdD82668A2237B613aa2424Ca403',
        '0xF62DC866B4dbe0fd9b1171AeC091bA29866b3D5B',
        '0x7a7B134df987850A7185668f7dF9e0220aa144CD',
        '0x8E250c61c5779924B67b3c103313928DfF1e9F1e',
        '0xE11014fC8647E1Ff8869855dd095D6dEaB8Ad33f',
        '0xeA053594787ee5456bCF2B8173A4144502A50799',
        '0x7DF2dbCc5cFFa8AbAb01bB1D70f6E99ccb4D7064',
        '0xAfB811E26c42F16aa5ae423D2D598037592E7cBC',
        '0x7fe235ad34ee5c94E0485b515f0a34567faD801c',
        '0x035Cc85b1ea31eC6389afBCB5336819f4028C439',
        '0x814346C06283CB8f5AEf8414Bd6Efef01e4700c2',
        '0xf5d284Ea6D956027cf5E887f2827f56Bb185FD42',
        '0x63123cA1498c161657612e8CaDe116B13CA73f82',
        '0x45ce32692cb7EF6e6c4A5f96DF0D16785225Dda5',
        '0x9Ab4f8eB44115b7358647E283575Ad4231892868',
        '0xE51E20e2427eC82feA2E78F08695F9974bcE1369',
        '0x745a4A89806f1d459e4DFe7FE2A1F152741518Ae',
        '0x023DC53aebf1a839e8523daA5604CDa2ACb4dC3f',
        '0xf8EC5837446F0605D137091Ef02F7d30680Cd113',
        '0xd7e78bb133d5e20D6289dac68a1667Ca5Ce6555f',
        '0x8eC313D4281f4A5430cb37680D1CacB2EF7aBa68',
        '0x22147dc27f6703aCDFf7979a2c7Ed20421c1badE',
        '0xF69e9208b64F363Ce6033731ACAA5bBC22741d0D',
        '0xf44db96ae1b5DcEd73E3D43Db2aE39151C72DDC5',
        '0x592c6a2aCd40ED7A916C88Fcc3606F1041E1F59f',
        '0xD224d0D2CCFbeb1f1eE2a1202D6B8E4c472322b6',
        '0x57D8312c48e2a87d2F516aB172C4b9401cb625DA',
        '0x0Bfc3B8f10B94F263ACECDC0191238e0E3F41102',
        '0x3A79a52634c3b9876A71Ff4341048C94CA7ADE4b',
        '0x744D71D44bb8B560B4176cA9513d5AA9dE8651ee',
        '0x874F8F2807e017a1a6849A390f870a09d9BE23e0',
        '0xf2302305B8F7B2145909f6F7ABf7285db7a855fd',
        '0xB9f50869eE75290c548386C15821F2b3B133B050',
        '0x9be16f7fc952e626ccBF4f5425865B50612E8c3B',
        '0x1Cd1B39377bDfe8874f4D7929d4Ae1b4861F622b',
        '0x68B91A98C3D331987421F7E127A226c851dF2e4a',
        '0x3851cB5F36316eAf42c485413E0917d2860DB02C',
        '0xb1cE814aeE3097F369d7518f2c07e0C66b2F5199',
        '0x8586900709fa4D6F54d6BFA34Ca6FF29dCef47ed',
        '0x51dc9e3a42f5Ca5FE45423e79AFeeDad56ADd0eE',
        '0x09fB2102856ef76461a8754CaC80f556EA02Fd29',
        '0xbC66d173Ff5A9105a00F2cc10557C9f3AfCe48B3',
        '0x6fa2Cf70ffB0b303127A5D55Bde783c7b773419d',
        '0x87269eEcE81997725ddBff7DBcAefd4560aCDe4B',
        '0xd45BA4Ef035286ac42EA5c6a648F15bd667D0ccA',
        '0x51529ad7767f9Fef9CB2fc9356Ff40221B131058',
        '0x1504B856f0f0225C500eB7409C1F115BD2Dd5976',
        '0xf1031682D9bE287d5d0e62C07EE49eD8416C8A51',
        '0xE6232B2777df924B06ac76703e9EC4b02a99423C',
        '0xb676eE16f4F4e08740049FE3a8e4D2117Ff0cC1E',
        '0x2314223e2A7B5Db3ab17aee7533a750E5eBbB938',
        '0x33f08CF51E64D73C0105868056A80Efd9174bF5F',
        '0x991a34b4D00CdfDE904418289FA89FDf78dc01f1',
        '0x3B0Fb35Cb66C03eecFB148f254deDA0DEe4ad335',
        '0xF05bE23094cF98a3f8Ddcd420251c81bfe86007b',
        '0x6583d6f1268296901a81ee234b90149C9A3D6178',
        '0xebC99Ff12256cbAa823441B16CA5531301f739C2',
        '0xCcE0ec256D2e104c872FeAf324E86B5a2A0587C5',
        '0x1f13555B0bfF6BB9902d47ef35efb147b5dFA1fA',
        '0xfd1092F04127d216d7B55C712f9431dE63Ced529',
        '0xeF09C724cE72B64c753A28179972E517Eb6bb817',
        '0x371d592B15aCBb228aB2a38F719cf56F32b66ce7',
        '0x6CE2C6bA018bcE3ed63D4110E0616Eb548e38c53',
        '0x4069a50E6feB74939b7E781dA671147de404FbaA',
        '0xB37877eF155EE98f8293Ac9bc009E455208e5Aa1',
        '0xDBcf0d010D850C547beA3cb8bfa775da156Ad14A',
        '0x8e05C1FFC1d16c735df7843654333FD780a554F0',
        '0x0621379E67e91a8AD66FDcA2508B853500FA8099',
        '0x5546767A99877e0bC52Bf32029880d38bCEb98F3',
        '0xC3a4EAd16d70B0a4BB19C6D4212420a7a49009ee',
        '0xA95B0b036A6ae92268569CAE0D7Fc5b61fed7236',
    ];
    const leaves = keepers.map((value) => keccak256(value));
    const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });

    // await waitForTx(await multipleTransfer.addOperator(deployer.address));
    // await waitForTx(await multipleTransfer.addMerkleManager(deployer.address));

    // const root = merkleTree.getHexRoot();
    // await waitForTx(await multipleTransfer.updateMerkleRoot(root));
    //
    // const recipients = keepers;
    // const multiProofs = leaves.map((leave) => merkleTree.getHexProof(leave));
    // // console.log('Merkle Proofs:', multiProofs);
    //
    // console.log(
    //     await multipleTransfer.batchTransferETH(
    //         recipients,
    //         Array(recipients.length).fill(ethers.utils.parseEther('0.01')),
    //         multiProofs,
    //     ),
    // );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
