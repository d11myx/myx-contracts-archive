import { ethers } from 'hardhat';
import { TestAmmUtils } from '../types';
import Decimal from 'decimal.js';
import { expect } from 'chai';

describe('AMM', () => {
    let amm: TestAmmUtils;

    before(async () => {
        const contractFactory = await ethers.getContractFactory('TestAmmUtils');
        amm = await contractFactory.deploy();
    });

    it('test amm', async () => {
        let k = ethers.utils.parseUnits('4.4', 46);
        let price = ethers.utils.parseUnits('36100', 30);
        const { reserveA, reserveB } = await amm.getReserve(k, price, '1000000000000000000000000000000');
        const amountOut1 = ethers.utils.formatEther(
            await amm.getAmountOut(ethers.utils.parseEther('1'), reserveA, reserveB),
        );
        expect(new Decimal(amountOut1).toFixed(2)).to.be.eq('36067.33');

        const amountOut2 = ethers.utils.formatEther(
            await amm.getAmountOut(ethers.utils.parseEther('36100'), reserveB, reserveA),
        );
        expect(new Decimal(amountOut2).toFixed(2)).to.be.eq('1.00');

        k = ethers.utils.parseUnits('4.4', 46);
        price = ethers.utils.parseUnits('35712.18982', 30);
        const { reserveA: reserveA1, reserveB: reserveB1 } = await amm.getReserve(
            k,
            price,
            '1000000000000000000000000000000',
        );
        const amountOut3 = ethers.utils.formatEther(
            await amm.getAmountOut(ethers.utils.parseEther('1'), reserveA1, reserveB1),
        );
        expect(new Decimal(amountOut3).toFixed(2)).to.be.eq('35680.05');

        const amountOut4 = ethers.utils.formatEther(
            await amm.getAmountOut(ethers.utils.parseEther('35712'), reserveB1, reserveA1),
        );
        expect(new Decimal(amountOut4).toFixed(2)).to.be.eq('1.00');

        k = ethers.utils.parseUnits('4', 49);
        price = ethers.utils.parseUnits('35883.77454', 30);
        const { reserveA: reserveA2, reserveB: reserveB2 } = await amm.getReserve(
            k,
            price,
            '1000000000000000000000000000000',
        );
        const amountOut5 = ethers.utils.formatEther(
            await amm.getAmountOut(ethers.utils.parseEther('100'), reserveA2, reserveB2),
        );
        expect(new Decimal(amountOut5).toFixed(2)).to.be.eq('3577661.81');

        const amount = new Decimal(
            ethers.utils.formatEther(
                await amm.getAmountOut(
                    ethers.utils.parseEther(new Decimal('35883.77454').mul('100').toString()),
                    reserveB2,
                    reserveA2,
                ),
            ),
        ).mul('35883.77454');
        expect(new Decimal(amount).toFixed(2)).to.be.eq('3577661.81');
    });
});
