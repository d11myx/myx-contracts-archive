
### 交易流程

#### 1. 质押 DAI
GToken.deposit

#### 2. 解押 DAI
GToken.makeWithdrawRequest （申请提取，等待提取周期）

GToken.withdraw（提取）

#### 3. 下单（市价、限价）
user 申请下单 -> GNSTradingV6_3_1.openTrade
中心化 执行订单 -> Oracle.fulfillOracleRequest(chainlink函数) -> GNSPriceAggregatorV6_3.fulfill

#### 4. 关单
市价单：closeTradeMarket

#### 5. 更新止盈止损
GNSTradingV6_3_1.updateTp
GNSTradingV6_3_1.updateSl