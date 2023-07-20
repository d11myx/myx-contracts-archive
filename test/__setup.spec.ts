import {setupTestEnv} from './helpers/make-suite';

before(async () => {
    console.log('-> Initializing test environment');
    await setupTestEnv();
    console.log('\n*********************************************');
    console.log('************** Setup finished ***************');
    console.log('*********************************************\n');
});