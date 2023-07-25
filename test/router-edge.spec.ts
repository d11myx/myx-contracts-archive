import { testEnv } from './helpers/make-suite';

describe('Router: Edge cases', () => {
  beforeEach(async () => {
    const { deployer } = testEnv;
    console.log(`deployer address:`, deployer.address);
  });
  afterEach(async () => {});

  it('add liquidity', function () {
    const {
      deployer,
      keeper,
      users: [depositor],
      pairLiquidity,
    } = testEnv;

    // pairLiquidity.addLiquidity();
  });

  it('open position', async () => {
    const {
      deployer,
      keeper,
      users: [trader],
      tradingRouter,
      executeRouter,
    } = testEnv;
  });
});
