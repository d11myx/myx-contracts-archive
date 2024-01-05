import { task } from 'hardhat/config';
import { DevNetwork, getTimelock, increase, latest, waitForTx } from '../../helpers';
import { BigNumber } from 'ethers';
import { Timelock } from '../../types';

task(`time-execution`)
    .addParam('target')
    .addParam('value')
    .addParam('signature')
    .addParam('data')
    .addParam('eta')
    .addOptionalParam('timelockAddress', 'timelock address')
    .setAction(async (taskArgs, { deployments, getNamedAccounts, ...hre }) => {
        let timelock: Timelock;
        if (taskArgs.timelockAddress) {
            timelock = await hre.ethers.getContractAt('Timelock', taskArgs.timelockAddress);
        } else {
            timelock = await getTimelock();
        }

        await waitForTx(
            await timelock.queueTransaction(
                taskArgs.target,
                taskArgs.value,
                taskArgs.signature,
                taskArgs.data,
                taskArgs.eta,
            ),
        );

        if (hre.network.name == 'hardhat' || hre.network.name == DevNetwork.local) {
            const duration = BigNumber.from(taskArgs.eta).sub(await latest());
            await increase(duration);
        } else {
            await new Promise((f) => setTimeout(f, 30 * 1000));
        }

        await waitForTx(
            await timelock.executeTransaction(
                taskArgs.target,
                taskArgs.value,
                taskArgs.signature,
                taskArgs.data,
                taskArgs.eta,
            ),
        );
    });
