### Contract address

### Test account

### Contract interface

#### event code

#### Set parameters

#### Open a position

## contract deploy

1. remove chain data and restart chain
2. stop xxl jobs
    1. https://test-job.myx.cash/xxl-job-admin/jobinfo
    2. stop all jobs
3. remove deployments
4. execute

    ```shell
    # deploy contracts
    yarn deploy --network remote_test

    # setup roles and liquidity
    yarn hardhat run scripts/deploy.dev.setup.ts --network remote_test
    ```

5. update mysql data
    1. set blockNumber to 0
    2. update contract addresses and private keys
    3. clear data
6. start xxl jobs
7. update web configured contract addresses
