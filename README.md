### 合约地址
GNSToken: https://arbiscan.io/address/0x18c11fd286c5ec11c3b683caa813b77f5163a122

GNS Trading V6_3_1: https://arbiscan.io/address/0x5220ffb7307a67d41062a261fef5136516637f65

GNS TradingStorage V5: https://arbiscan.io/address/0xcfa6ebd475d89db04cad5a756fff1cb2bc5be33c

GNS Callbacks: https://arbiscan.io/address/0x298a695906e16aea0a184a2815a76ead1a0b7522

GNS PairStorage: https://arbiscan.io/address/0xf67df2a4339ec1591615d94599081dd037960d4b

PriceAggregator: https://arbiscan.io/address/0xcef1C791CDd8c3EA92D6AB32399119Fd30E1Ff21

### 交易流程

#### 1. 质押 DAI
GToken.deposit

#### 2. 解押 DAI
GToken.makeWithdrawRequest （申请提取，等待提取周期）

GToken.withdraw（提取）

#### 3. 下单（市价、限价）
user 申请下单 -> GNSTradingV6_3_1.openTrade -> GNSPriceAggregatorV6_3.getPrice -> ChainlinkClient.sendChainlinkRequestTo
中心化 执行订单 -> Oracle.fulfillOracleRequest(chainlink函数) -> GNSPriceAggregatorV6_3.fulfill

#### 4. 关单
市价单：closeTradeMarket

#### 5. 更新止盈止损
GNSTradingV6_3_1.updateTp
GNSTradingV6_3_1.updateSl

### 修改点
#### 1. 交易计算方式？
#### 2. 加仓减仓