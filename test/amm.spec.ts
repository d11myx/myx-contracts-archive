import { ethers } from 'hardhat';
import { TestAmmUtils } from '../types';
import Decimal from 'decimal.js';
import { expect } from 'chai';

describe('AMM', () => {
    let amm: TestAmmUtils;
    const _1e30 = '1000000000000000000000000000000';

    before(async () => {
        const contractFactory = await ethers.getContractFactory('TestAmmUtils');
        amm = await contractFactory.deploy();
    });

    it('test amm', async () => {
        let k = ethers.utils.parseUnits('4.4', 46);
        let price = ethers.utils.parseUnits('36100', 30);
        const { reserveA, reserveB } = await amm.getReserve(k, price, _1e30);
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
        const { reserveA: reserveA1, reserveB: reserveB1 } = await amm.getReserve(k, price, _1e30);
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
        const { reserveA: reserveA2, reserveB: reserveB2 } = await amm.getReserve(k, price, _1e30);
        const amountOut5 = ethers.utils.formatEther(
            await amm.getAmountOut(ethers.utils.parseEther('100'), reserveA2, reserveB2),
        );
        expect(new Decimal(amountOut5).toFixed(2)).to.be.eq('3577661.81');

        const amountOut6 = new Decimal(
            ethers.utils.formatEther(
                await amm.getAmountOut(
                    ethers.utils.parseEther(new Decimal('35883.77454').mul('100').toString()),
                    reserveB2,
                    reserveA2,
                ),
            ),
        ).mul('35883.77454');
        expect(new Decimal(amountOut6).toFixed(2)).to.be.eq('3577661.81');

        const amountOut7 = ethers.utils.formatEther(
            await amm.getAmountOut(ethers.utils.parseEther('10000'), reserveA2, reserveB2),
        );
        expect(new Decimal(amountOut7).toFixed(2)).to.be.eq('276131982.08');

        // large amount
        const slippage = new Decimal('10000').sub(new Decimal(amountOut7).div(price.toString()).mul(_1e30)).toFixed(2);
        const slippageRate = new Decimal(slippage).div('100000').toFixed(5);
        expect(slippage).to.be.eq('2304.82');
        expect(slippageRate).to.be.eq('0.02305');

        const amountOut8 = new Decimal(
            ethers.utils.formatEther(
                await amm.getAmountOut(
                    ethers.utils.parseEther(new Decimal('35883.77454').mul('10000').toString()),
                    reserveB2,
                    reserveA2,
                ),
            ),
        ).mul('35883.77454');
        expect(new Decimal(amountOut8).toFixed(2)).to.be.eq('276131982.08');

        const slippage1 = new Decimal('35883.77454').mul('10000').sub(new Decimal(amountOut8)).toFixed(2);
        const slippageRate1 = new Decimal(slippage1).div(new Decimal('35883.77454').mul('10000')).toFixed(5);
        expect(slippage1).to.be.eq('82705763.32');
        expect(slippageRate1).to.be.eq('0.23048');
    });

    it('high price', async () => {
        let k = ethers.utils.parseUnits('4', 49);
        let price = ethers.utils.parseUnits('500000', 30);
        const { reserveA: reserveA2, reserveB: reserveB2 } = await amm.getReserve(k, price, _1e30);
        const amountOut5 = ethers.utils.formatEther(
            await amm.getAmountOut(ethers.utils.parseEther('100'), reserveA2, reserveB2),
        );
        expect(new Decimal(amountOut5).toFixed(2)).to.be.eq('49447163.90');

        const amountOut6 = new Decimal(
            ethers.utils.formatEther(
                await amm.getAmountOut(
                    ethers.utils.parseEther(new Decimal('500000').mul('100').toString()),
                    reserveB2,
                    reserveA2,
                ),
            ),
        ).mul('500000');
        expect(new Decimal(amountOut6).toFixed(2)).to.be.eq('49447163.90');

        const amountOut7 = ethers.utils.formatEther(
            await amm.getAmountOut(ethers.utils.parseEther('10000'), reserveA2, reserveB2),
        );
        expect(new Decimal(amountOut7).toFixed(2)).to.be.eq('2360679775.00');

        // large amount
        const slippage = new Decimal('10000').sub(new Decimal(amountOut7).div(price.toString()).mul(_1e30)).toFixed(2);
        const slippageRate = new Decimal(slippage).div('100000').toFixed(5);
        expect(slippage).to.be.eq('5278.64');
        expect(slippageRate).to.be.eq('0.05279');

        const amountOut8 = new Decimal(
            ethers.utils.formatEther(
                await amm.getAmountOut(
                    ethers.utils.parseEther(new Decimal('500000').mul('10000').toString()),
                    reserveB2,
                    reserveA2,
                ),
            ),
        ).mul('500000');
        expect(new Decimal(amountOut8).toFixed(2)).to.be.eq('2360679775.00');

        const slippage1 = new Decimal('500000').mul('10000').sub(new Decimal(amountOut8)).toFixed(2);
        const slippageRate1 = new Decimal(slippage1).div(new Decimal('500000').mul('10000')).toFixed(5);
        expect(slippage1).to.be.eq('2639320225.00');
        expect(slippageRate1).to.be.eq('0.52786');
    });
});
