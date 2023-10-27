import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { Duration, encodeParameters, getTimelock, latest } from '../../helpers';

const func: DeployFunction = async function ({ getNamedAccounts, deployments, ...hre }: HardhatRuntimeEnvironment) {
    const timelock = await getTimelock();

    console.log(await timelock.delay());

    await hre.run('time-execution', {
        target: timelock.address,
        value: '0',
        signature: 'setDelay(uint256)',
        data: encodeParameters(['uint256'], ['43200']),
        eta: Duration.seconds(20)
            .add(await latest())
            .toString(),
    });
    console.log(await timelock.delay());
};
func.id = `SetupTimelock`;
func.tags = ['post', 'setup-timelock'];
export default func;
