import { task } from 'hardhat/config';
import { getTimelock, increase, latest, waitForTx } from '../../helpers';
import { BigNumber } from 'ethers';

task(`time-execution`)
    .addParam('target')
    .addParam('value')
    .addParam('signature')
    .addParam('data')
    .addParam('eta')
    .setAction(async (taskArgs, { deployments, getNamedAccounts, ...hre }) => {
        const timelock = await getTimelock();

        await timelock.queueTransaction(
            taskArgs.target,
            taskArgs.value,
            taskArgs.signature,
            taskArgs.data,
            taskArgs.eta,
        );

        const duration = BigNumber.from(taskArgs.eta).sub(await latest());
        await increase(duration);

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
