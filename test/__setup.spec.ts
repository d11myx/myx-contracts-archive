import { setupTestEnv } from './helpers/make-suite';
import { deployments } from 'hardhat';

before(async () => {
  await deployments.fixture(['market']);

  console.log('-> Initializing test environment');
  await setupTestEnv();
  console.log('\n*********************************************');
  console.log('************** Setup finished ***************');
  console.log('*********************************************\n');
});
