### 合约地址
- [remote config](./scripts/config/remote_config.json)
- RPC: http://18.166.30.91:8545/
- ChainId: 31337

### 测试账户
```text
address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Account 0 (admin): 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Account 1 : 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

address: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
Account 2 : 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

address: 0x90F79bf6EB2c4f870365E785982E1f101E93b906
Account 3 : 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

address: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
Account 4 : 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

### 合约接口

#### event code
```text
// TradingRouter
CreateIncreaseOrder: e401f3643c085fcc483af85cb3d881f021e1e70c14822e020b6cd40a818fc509
CreateDecreaseOrder: 240a7e91666f2fb3e907c7db7dd66e21040249b32b8628e4bb9f23b87445e9ab
ExecuteIncreaseOrder: 9be92c13b352d3051c2f3fcb8f1010048a2055b1bd840f3fba594e564482d1c8
ExecuteDecreaseOrder: 901a7aef1ce7249bf77dee95854fe4b6c0af6cafad730906972e342e53428fbb,
CancelIncreaseOrder: 7e93a6b00cb3caacf000d7018943b12e2b4ad29e7849df14ebd51caf4fd739b8,
CancelDecreaseOrder: b225fd6bcccad9342bc10ccc7e25ef77175b77348c8393d669ac2dbc98a1ae29,

// TradingVault
IncreasePosition: dbab60fb9559e424fb3f4b5d1d1589bd0c174abedb3f0273928b28c5b28f57fe,
DecreasePosition: bd7ee4b394cd100896d9636764480e465e9f68c184a5b176ac7d49331e383195,
```

#### 开仓
```text
// 创建开仓请求（前端用户)
createIncreaseOrder(IncreasePositionRequest memory request)

struct IncreasePositionRequest {
    uint256 pairIndex;             // 币对index
    TradeType tradeType;           // 0: MARKET, 1: LIMIT
    uint256 collateral;            // 1e18 保证金数量
    uint256 openPrice;             // 1e30 市价可接受价格/限价开仓价格
    bool isLong;                   // 多/空
    uint256 sizeAmount;            // 仓位数量
    uint256 tpPrice;               // 止盈价 1e30
    uint256 tp;                    // 止盈数量
    uint256 slPrice;               // 止损价 1e30
    uint256 sl;                    // 止损数量
}

// 取消订单（前端用户）
cancelIncreaseOrder(uint256 _orderId, TradeType _tradeType)
   
// 批量执行市价开仓（keeper: Account 0 / Account 1）, endIndex: 终止index
executeIncreaseMarkets(uint256 _endIndex)

// 执行限价砍仓(keeper)
executeIncreaseOrder(uint256 _orderId, TradeType tradeType)

// 当前市价开仓请求最新index
uint256 public increaseMarketOrdersIndex;
// 当前市价关仓请求最新index
uint256 public decreaseMarketOrdersIndex;
// 当前市价开仓请求未执行起始index
uint256 public increaseMarketOrderStartIndex;
// 当前市价关仓请求未执行起始index
uint256 public decreaseMarketOrderStartIndex;
// 当前限价开仓请求最新index
uint256 public increaseLimitOrdersIndex;
// 当前限价关仓请求最新index
uint256 public decreaseLimitOrdersIndex;

```

#### 关仓
```text
// 创建关仓请求（前端用户)
createIncreaseOrder(IncreasePositionRequest memory request)

// 请求体
struct DecreasePositionRequest {
    uint256 pairIndex;
    TradeType tradeType;
    uint256 openPrice;             // 限价触发价格
    uint256 sizeAmount;            // 关单数量
    bool isLong;
    bool abovePrice;               // 高于或低于触发价格
                                   // 市价单：开多 true 空 false
                                   // 限价单：开多 false 空 true
                                   // 多单 止盈：false 止损：true
                                   // 空单 止盈：true 止损：false
}

// 取消订单（前端用户）
cancelDecreaseOrder(uint256 _orderId, TradeType _tradeType)
   
// 批量执行市价开仓（keeper: Account 0 / Account 1）, endIndex: 终止index
executeDecreaseMarkets(uint256 _endIndex)

// 执行限价砍仓(keeper)
executeDecreaseOrder(uint256 _orderId, TradeType tradeType)

```
