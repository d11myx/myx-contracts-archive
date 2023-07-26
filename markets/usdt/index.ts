import { ReserveConfiguration } from '../../helpers/types';
import { btcPairInfo, ethPairInfo } from './pairs';
import { eBscNetwork, ZERO_ADDRESS } from '../../helpers/constants';

export const USDTMarketConfig: ReserveConfiguration = {
  TokenSymbol: 'USDT',
  TokenName: 'Tether',
  TokenAddress: {
    [eBscNetwork.test]: ZERO_ADDRESS,
    [eBscNetwork.main]: '0x',
  },
  PairsConfig: {
    BTC: btcPairInfo,
    ETH: ethPairInfo,
  },
  PairAssets: {
    [eBscNetwork.test]: {
      BTC: ZERO_ADDRESS,
      ETH: ZERO_ADDRESS,
    },
    [eBscNetwork.main]: {
      BTC: '0x',
      ETH: '0x',
    },
  },
};

export default USDTMarketConfig;
