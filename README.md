### 合约地址
- [remote config](./scripts/config/remote_config.json)
- RPC: http://18.166.30.91:8545/
- ChainId: 31337

### 测试账户
```text
Account #0 (admin): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

Account #2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (10000 ETH)
Private Key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

Account #3: 0x90F79bf6EB2c4f870365E785982E1f101E93b906 (10000 ETH)
Private Key: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

Account #4: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 (10000 ETH)
Private Key: 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a

Account #5: 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (10000 ETH)
Private Key: 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba

Account #6: 0x976EA74026E726554dB657fA54763abd0C3a0aa9 (10000 ETH)
Private Key: 0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e

Account #7: 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 (10000 ETH)
Private Key: 0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356

Account #8: 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f (10000 ETH)
Private Key: 0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97

Account #9: 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720 (10000 ETH)
Private Key: 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6

Account #10 (keeper): 0xBcd4042DE499D14e55001CcbB24a551F3b954096 (10000 ETH)
Private Key: 0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897

Account #11 (keeper): 0x71bE63f3384f5fb98995898A86B02Fb2426c5788 (10000 ETH)
Private Key: 0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82

Account #12 (keeper): 0xFABB0ac9d68B0B445fB7357272Ff202C5651694a (10000 ETH)
Private Key: 0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1

Account #13 (keeper): 0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec (10000 ETH)
Private Key: 0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd

Account #14 (keeper): 0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097 (10000 ETH)
Private Key: 0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa

Account #15 (keeper): 0xcd3B766CCDd6AE721141F452C550Ca635964ce71 (10000 ETH)
Private Key: 0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61

Account #16 (keeper): 0x2546BcD3c84621e976D8185a91A922aE77ECEc30 (10000 ETH)
Private Key: 0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0

Account #17 (keeper): 0xbDA5747bFD65F08deb54cb465eB87D40e51B197E (10000 ETH)
Private Key: 0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd

Account #18 (keeper): 0xdD2FD4581271e230360230F9337D5c0430Bf44C0 (10000 ETH)
Private Key: 0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0

Account #19 (keeper): 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 (10000 ETH)
Private Key: 0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e

```

### 合约接口

#### event code
```text
contract: TradingRouter
event: CancelDecreaseOrder id: b225fd6bcccad9342bc10ccc7e25ef77175b77348c8393d669ac2dbc98a1ae29
event: CancelIncreaseOrder id: 7e93a6b00cb3caacf000d7018943b12e2b4ad29e7849df14ebd51caf4fd739b8
event: CreateDecreaseOrder id: e71a68544c2c9cf2a006d283baa849468003198fa8d8026335170198a30349dd
event: CreateIncreaseOrder id: e83629b11df9fcc6b9ebc666eb284c939d1710576a8d3eac23474d70fae8d478

contract: ExecuteRouter
event: ExecuteDecreaseOrder id: 9b4ff42a2fc7960edd49c603150f69894e46d386129c040ae7519a427fee0613
event: ExecuteIncreaseOrder id: 462ad18c79032b6336d456416b46e1012c8ed1c03cd3ff073957ae8834539e72
event: LiquidatePosition id: aac40228c5d58dfc6360c331165fa5a8fa13f51c87a6124cb1999a4c6117bb79

contract: TradingVault
event: ClosePosition id: 1ffb81f32d2d371994fb39b875fbe035d34386083d2a85a3cf2894709c4581a2
event: DecreasePosition id: f1d296a817e8ecfa2709fcd52c61a6dddc7e87ed697b3ba601e88dbee8849c20
event: IncreasePosition id: 07777c9f149d310fb8670fb9752de106d0ebc29093eb6df2be370406a7d742a3
event: UpdateFundingRate id: 30ee8c76a6febcb0400fb07183d873b5c18cf9e5ca6a47104676795b989c606d
event: UpdatePosition id: 9a23c22b6372bd11ffa0aced0db638ca7c144fc3996ecc8fbe3f9a639ef285ad
```

#### 开仓
- TradingRouter
```text
// 创建开仓请求（前端用户)
createIncreaseOrder(IncreasePositionRequest memory request)

// 取消订单（前端用户）
TradingRouter.cancelIncreaseOrder(uint256 _orderId, TradeType _tradeType)

struct IncreasePositionRequest {
    address account;               // 当前用户
    uint256 pairIndex;             // 币对index
    TradeType tradeType;           // 0: MARKET, 1: LIMIT
    int256 collateral;             // 1e18 保证金数量，负数表示减仓
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
// 设置price并执行市价订单
setPricesWithBitsAndExecuteMarketOrders(
    uint256 _priceBits,
    uint256 _timestamp,
    uint256 _increaseEndIndex,  // 开仓市价单终止index
    uint256 _decreaseEndIndex   // 减仓市价单终止index
)

// 设置price并执行限价订单
setPricesWithBitsAndExecuteLimitOrders(
    uint256 _priceBits,
    uint256 _timestamp,
    uint256[] memory _increaseOrderIds,
    uint256[] memory _decreaseOrderIds
)

// 批量执行市价开仓（keeper: Account 0 / Account 1）, endIndex: 终止index
executeIncreaseMarkets(uint256 _endIndex)

// 批量执行限价开仓
executeIncreaseLimitOrders(uint256[] memory _orderIds)

// 执行限价开仓(keeper)
executeIncreaseOrder(uint256 _orderId, TradeType tradeType)
```

#### 减仓
- TradingRouter
```text
// 创建减仓请求（前端用户)
createIncreaseOrder(IncreasePositionRequest memory request)

// 请求体
struct DecreasePositionRequest {
    address account;               // 当前用户
    uint256 pairIndex;
    TradeType tradeType;
    int256 collateral;             // 1e18 保证金数量，负数表示减仓
    uint256 triggerPrice;          // 限价触发价格
    uint256 sizeAmount;            // 关单数量
    bool isLong;
}

// 取消订单（前端用户）
cancelDecreaseOrder(uint256 _orderId, TradeType _tradeType)
```

- ExecuteRouter
```text

// 批量执行市价减仓（keeper: Account 0 / Account 1）, endIndex: 终止index
executeDecreaseMarkets(uint256 _endIndex)

// 批量执行限价减仓
executeDecreaseLimitOrders(uint256[] memory _orderIds)

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
// 设置price并执行清算
setPricesWithBitsAndLiquidatePositions(
    uint256 _priceBits,
    uint256 _timestamp,
    bytes32[] memory _positionKeys
)

// _positionKeys 仓位key数组
function liquidatePositions(bytes32[] memory _positionKeys)
```

#### ADL
- ExecuteRouter
```text
// 设置price并执行ADL
setPricesWithBitsAndExecuteADL(
    uint256 _priceBits,
    uint256 _timestamp,
    bytes32[] memory _positionKeys,
    uint256[] memory _sizeAmounts,
    uint256 _orderId,
    ITradingRouter.TradeType _tradeType
)

// 执行ADL及减仓订单
function executeADLAndDecreaseOrder(
    bytes32[] memory _positionKeys,         // 待执行ADL仓位key
    uint256[] memory _sizeAmounts,          // 待执行ADL仓位数量
    uint256 _orderId,                       // 待执行订单
    ITradingRouter.TradeType _tradeType
)
```

#### 手续费
- TradingVault
```text
// 获取交易手续费
function getTradingFee(uint256 _pairIndex, bool _isLong, uint256 _sizeAmount)

// 获取资金费率
function getFundingFee(
    bool _increase,         // 加仓true，减仓false
    address _account,
    uint256 _pairIndex,
    bool _isLong,
    uint256 _sizeAmount     // 待修改仓位数
)
```
