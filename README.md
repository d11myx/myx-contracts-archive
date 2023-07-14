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
contract: TradingRouter
event: CancelDecreaseOrder id: b225fd6bcccad9342bc10ccc7e25ef77175b77348c8393d669ac2dbc98a1ae29
event: CancelIncreaseOrder id: 7e93a6b00cb3caacf000d7018943b12e2b4ad29e7849df14ebd51caf4fd739b8
event: CreateDecreaseOrder id: 240a7e91666f2fb3e907c7db7dd66e21040249b32b8628e4bb9f23b87445e9ab
event: CreateIncreaseOrder id: e6823eabfaf51436458e4cb04c825180fdb8fd51e72dfb0ad5b4ce9997a60113
event: Initialized id: 7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb3847402498

contract: ExecuteRouter
event: ExecuteDecreaseOrder id: 9f3c33fd03495d1596e0a478a5bba66bbf00156695a90929fb38a4aba7191f57
event: ExecuteIncreaseOrder id: 9be92c13b352d3051c2f3fcb8f1010048a2055b1bd840f3fba594e564482d1c8
event: Initialized id: 7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb3847402498
event: LiquidatePosition id: e1febbdcc803d95366f46812f494fac1e36dce8da68a2c217faef524356e8c4a

contract: TradingVault
event: ClosePosition id: 1ffb81f32d2d371994fb39b875fbe035d34386083d2a85a3cf2894709c4581a2
event: DecreasePosition id: 62795973d742bdaf9fd1de818e338161d24339032ae04cf0420949325c3cfdae
event: IncreasePosition id: 40ade253e754e3746462b670f057f2ea521746ba0011c4f5753f9c8f57449998
event: Initialized id: 7f26b83ff96e1f2b6a682f133852f6798a09c465da95921460cefb3847402498
event: UpdateFundingRate id: 30ee8c76a6febcb0400fb07183d873b5c18cf9e5ca6a47104676795b989c606d
event: UpdatePosition id: 8ea8e63c641084715d661096cbd2ef37b340a8cdcd6c2d70e0b1e0ac235bc0f1
```

#### 开仓
- TradingRouter
```text
// 创建开仓请求（前端用户) 
createIncreaseOrder(IncreasePositionRequest memory request)

// 取消订单（前端用户）
TradingRouter.cancelIncreaseOrder(uint256 _orderId, TradeType _tradeType)
   
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
- ExecuteRouter
```text
// 批量执行市价开仓（keeper: Account 0 / Account 1）, endIndex: 终止index
executeIncreaseMarkets(uint256 _endIndex)

// 执行限价砍仓(keeper)
executeIncreaseOrder(uint256 _orderId, TradeType tradeType)
```

#### 关仓
- TradingRouter
```text
// 创建关仓请求（前端用户)
createIncreaseOrder(IncreasePositionRequest memory request)

// 请求体
struct DecreasePositionRequest {
    uint256 pairIndex;
    TradeType tradeType;
    uint256 triggerPrice;          // 限价触发价格
    uint256 sizeAmount;            // 关单数量
    bool isLong;
}

// 取消订单（前端用户）
cancelDecreaseOrder(uint256 _orderId, TradeType _tradeType)
```

- ExecuteRouter
```text
// 批量执行市价开仓（keeper: Account 0 / Account 1）, endIndex: 终止index
executeDecreaseMarkets(uint256 _endIndex)

// 执行限价砍仓(keeper)
executeDecreaseOrder(uint256 _orderId, TradeType tradeType)
```

#### 止盈止损
- TradingRouter
```text
// 单独创建止盈止损
createTpSl(CreateTpSlRequest memory _request)

struct CreateTpSlRequest {
    address account;
    uint256 pairIndex;             // 币对index
    bool isLong;
    uint256 tpPrice;               // 止盈价 1e30
    uint256 tp;                    // 止盈数量
    uint256 slPrice;               // 止损价 1e30
    uint256 sl;                    // 止损数量
}
```

#### 清算
- ExecuteRouter
```text
// _positionKeys 仓位key数组，_indexPrices 指数价格（与仓位一一对应）
function liquidatePositions(bytes32[] memory _positionKeys, uint256[] memory _indexPrices)
```