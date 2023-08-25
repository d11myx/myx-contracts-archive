import { testEnv } from './helpers/make-suite';
import { expect } from './shared/expect';
import { ethers, getNamedAccounts } from 'hardhat';
import { TradeType } from '../helpers';
import { TradingTypes } from '../types/contracts/trading/Router';

describe('Blacklist cases', () => {
    after(async () => {
        const {
            roleManager,
            users: [blackUser],
        } = testEnv;

        const { operator } = await getNamedAccounts();
        const operatorSigner = await ethers.getSigner(operator);

        await roleManager.connect(operatorSigner).removeAccountBlackList(blackUser.address);
        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(false);
    });

    it('operator can manage blacklist', async () => {
        const {
            roleManager,
            users: [blackUser],
        } = testEnv;

        const { operator } = await getNamedAccounts();
        const operatorSigner = await ethers.getSigner(operator);
        expect(await roleManager.isOperator(operator)).to.be.eq(true);

        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(false);

        await roleManager.connect(operatorSigner).addAccountBlackList(blackUser.address);
        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(true);

        await roleManager.connect(operatorSigner).removeAccountBlackList(blackUser.address);
        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(false);
    });

    it('user manage blacklist should be reverted', async () => {
        const {
            deployer,
            roleManager,
            users: [blackUser],
        } = testEnv;

        expect(await roleManager.isOperator(deployer.address)).to.be.eq(false);

        await expect(roleManager.connect(deployer.signer).addAccountBlackList(blackUser.address)).to.be.reverted;
        await expect(roleManager.connect(deployer.signer).removeAccountBlackList(blackUser.address)).to.be.reverted;
    });

    it('blacklist user addLiquidity should be reverted', async () => {
        const {
            roleManager,
            users: [blackUser, user],
            router,
            pool,
        } = testEnv;
        const { operator } = await getNamedAccounts();
        const operatorSigner = await ethers.getSigner(operator);

        await roleManager.connect(operatorSigner).addAccountBlackList(blackUser.address);
        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(true);

        let pair = await pool.getPair(0);

        await expect(
            router.connect(blackUser.signer).addLiquidity(pair.indexToken, pair.stableToken, 0, 0),
        ).to.be.revertedWith('blacklist account');

        await expect(
            router
                .connect(user.signer)
                .addLiquidityForAccount(pair.indexToken, pair.stableToken, blackUser.address, 0, 0),
        ).to.be.revertedWith('blacklist account');
    });

    it('blacklist user removeLiquidity should be reverted', async () => {
        const {
            roleManager,
            users: [blackUser, user],
            router,
            pool,
        } = testEnv;
        const { operator } = await getNamedAccounts();
        const operatorSigner = await ethers.getSigner(operator);

        await roleManager.connect(operatorSigner).addAccountBlackList(blackUser.address);
        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(true);

        let pair = await pool.getPair(0);

        await expect(
            router.connect(blackUser.signer).removeLiquidity(pair.indexToken, pair.stableToken, 0),
        ).to.be.revertedWith('blacklist account');

        await expect(
            router
                .connect(user.signer)
                .removeLiquidityForAccount(pair.indexToken, pair.stableToken, blackUser.address, 0),
        ).to.be.revertedWith('blacklist account');
    });

    it('blacklist user createOrder should be reverted', async () => {
        const {
            roleManager,
            users: [blackUser],
            router,
        } = testEnv;
        const { operator } = await getNamedAccounts();
        const operatorSigner = await ethers.getSigner(operator);

        await roleManager.connect(operatorSigner).addAccountBlackList(blackUser.address);
        expect(await roleManager.isBlackList(blackUser.address)).to.be.eq(true);

        const increase: TradingTypes.IncreasePositionWithTpSlRequestStruct = {
            account: blackUser.address,
            pairIndex: 0,
            tradeType: TradeType.MARKET,
            collateral: 0,
            openPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: 0,
            tp: 0,
            tpPrice: 0,
            sl: 0,
            slPrice: 0,
        };

        await expect(router.connect(blackUser.signer).createIncreaseOrder(increase)).to.be.revertedWith(
            'blacklist account',
        );

        await expect(router.connect(blackUser.signer).createIncreaseOrderWithoutTpSl(increase)).to.be.revertedWith(
            'blacklist account',
        );

        const decrease: TradingTypes.DecreasePositionRequestStruct = {
            account: blackUser.address,
            pairIndex: 0,
            tradeType: TradeType.MARKET,
            collateral: 0,
            triggerPrice: ethers.utils.parseUnits('30000', 30),
            isLong: true,
            sizeAmount: 0,
        };
        await expect(router.connect(blackUser.signer).createDecreaseOrder(decrease)).to.be.revertedWith(
            'blacklist account',
        );
    });
});
