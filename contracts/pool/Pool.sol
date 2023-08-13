// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;


import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';
import '@openzeppelin/contracts/utils/Address.sol';

import '../libraries/PrecisionUtils.sol';
import '../libraries/Roleable.sol';
import '../libraries/Int256Utils.sol';
import '../interfaces/IPairToken.sol';
import './PairToken.sol';
import '../interfaces/IPairInfo.sol';
import '../interfaces/IPairInfo.sol';
import '../interfaces/IPairLiquidity.sol';
import '../interfaces/IPairInfo.sol';

contract Pool is IPairInfo, Roleable {
    using PrecisionUtils for uint256;
    using SafeERC20 for IERC20;
    using Int256Utils for int256;

    uint256 public constant PERCENTAGE = 10000;
    uint256 public constant FUNDING_RATE_PERCENTAGE = 1000000;

    mapping(uint256 => TradingConfig) public tradingConfigs;
    mapping(uint256 => TradingFeeConfig) public tradingFeeConfigs;
    mapping(uint256 => FundingFeeConfig) public fundingFeeConfigs;

    mapping(address => mapping(address => uint256)) public pairIndexes;
    mapping(address => mapping(address => bool)) public isPairListed;

    mapping(uint256 => Pair) public pairs;
    uint256 public pairsCount;
    mapping(uint256 => Vault) public vaults;

    address public pairLiquidity;
    address public pairVault;
    address public tradingVault;

    constructor(IAddressesProvider addressProvider) Roleable(addressProvider) {}

    modifier onlyPairLiquidityAndVault() {
        require(msg.sender == pairLiquidity || msg.sender == pairVault || msg.sender == tradingVault, 'forbidden');
        _;
    }

    function setPairLiquidityAndVault(address _pairLiquidity, address _pairVaule) external onlyPoolAdmin {
        pairLiquidity = _pairLiquidity;
        pairVault = _pairVaule;
    }

    modifier onlyTradingVault() {
        require(msg.sender == tradingVault, 'forbidden');
        _;
    }

    function setTradingVault(address _tradingVault) external onlyPoolAdmin {
        tradingVault = _tradingVault;
    }

    function getPair(uint256 _pairIndex) external view override returns (Pair memory) {
        return pairs[_pairIndex];
    }

    function getTradingConfig(uint256 _pairIndex) external view override returns (TradingConfig memory) {
        return tradingConfigs[_pairIndex];
    }

    function getTradingFeeConfig(uint256 _pairIndex) external view override returns (TradingFeeConfig memory) {
        return tradingFeeConfigs[_pairIndex];
    }

    function getFundingFeeConfig(uint256 _pairIndex) external view override returns (FundingFeeConfig memory) {
        return fundingFeeConfigs[_pairIndex];
    }

    // Manage pairs
    function addPair(address _indexToken, address _stableToken, address _pairLiquidity) external onlyPoolAdmin {
        require(_indexToken != _stableToken, 'identical address');
        require(_indexToken != address(0) && _stableToken != address(0), 'zero address');
        require(!isPairListed[_indexToken][_stableToken], 'pair already listed');

        address pairToken = _createPair(_indexToken, _stableToken, _pairLiquidity);

        isPairListed[_indexToken][_stableToken] = true;
        pairIndexes[_indexToken][_stableToken] = pairsCount;

        Pair storage pair = pairs[pairsCount];
        pair.indexToken = _indexToken;
        pair.stableToken = _stableToken;
        pair.pairToken = pairToken;

        emit PairAdded(_indexToken, _stableToken, pairToken, pairsCount++);
    }

    function _createPair(address indexToken, address stableToken, address pairLiquidity) private returns (address) {
        bytes memory bytecode = abi.encodePacked(type(PairToken).creationCode, abi.encode(indexToken, stableToken));
        bytes32 salt = keccak256(abi.encodePacked(indexToken, stableToken));
        address pairToken;
        assembly {
            pairToken := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IPairToken(pairToken).setMiner(pairLiquidity, true);
        return pairToken;
    }

    function updatePair(uint256 _pairIndex, Pair calldata _pair) external onlyPoolAdmin {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), 'pair not existed');
        require(_pair.expectIndexTokenP <= PERCENTAGE && _pair.addLpFeeP <= PERCENTAGE, 'exceed 100%');

        pair.enable = _pair.enable;
        pair.kOfSwap = _pair.kOfSwap;
        pair.expectIndexTokenP = _pair.expectIndexTokenP;
        pair.addLpFeeP = _pair.addLpFeeP;
    }

    function updateTradingConfig(uint256 _pairIndex, TradingConfig calldata _tradingConfig) external onlyPoolAdmin {
        require(
            _tradingConfig.maintainMarginRate <= PERCENTAGE &&
                _tradingConfig.priceSlipP <= PERCENTAGE &&
                _tradingConfig.maxPriceDeviationP <= PERCENTAGE,
            'exceed 100%'
        );
        tradingConfigs[_pairIndex] = _tradingConfig;
    }

    function updateTradingFeeConfig(
        uint256 _pairIndex,
        TradingFeeConfig calldata _tradingFeeConfig
    ) external onlyPoolAdmin {
        require(_tradingFeeConfig.takerFeeP <= PERCENTAGE && _tradingFeeConfig.makerFeeP <= PERCENTAGE, 'exceed 100%');
        tradingFeeConfigs[_pairIndex] = _tradingFeeConfig;
    }

    function updateFundingFeeConfig(
        uint256 _pairIndex,
        FundingFeeConfig calldata _fundingFeeConfig
    ) external onlyPoolAdmin {
        require(
            _fundingFeeConfig.minFundingRate <= 0 &&
                _fundingFeeConfig.minFundingRate >= -int256(FUNDING_RATE_PERCENTAGE),
            'exceed min funding rate 100%'
        );
        require(
            _fundingFeeConfig.maxFundingRate >= 0 &&
                _fundingFeeConfig.maxFundingRate <= int256(FUNDING_RATE_PERCENTAGE),
            'exceed max funding rate 100%'
        );
        require(
            _fundingFeeConfig.fundingWeightFactor <= PERCENTAGE &&
                _fundingFeeConfig.liquidityPremiumFactor <= PERCENTAGE &&
                _fundingFeeConfig.lpDistributeP <= PERCENTAGE,
            'exceed 100%'
        );

        fundingFeeConfigs[_pairIndex] = _fundingFeeConfig;
    }

    function updatePairMiner(uint256 _pairIndex, address _account, bool _enable) external onlyPoolAdmin {
        Pair memory pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), 'pair not existed');

        IPairToken(pair.pairToken).setMiner(_account, _enable);
    }

    function increaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexTotalAmount + _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount + _stableAmount;
    }

    function decreaseTotalAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        vault.indexTotalAmount = vault.indexTotalAmount - _indexAmount;
        vault.stableTotalAmount = vault.stableTotalAmount - _stableAmount;
    }

    function increaseReserveAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyTradingVault {
        Vault storage vault = vaults[_pairIndex];
        vault.indexReservedAmount = vault.indexReservedAmount + _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount + _stableAmount;
    }

    function decreaseReserveAmount(
        uint256 _pairIndex,
        uint256 _indexAmount,
        uint256 _stableAmount
    ) external onlyTradingVault {
        Vault storage vault = vaults[_pairIndex];
        vault.indexReservedAmount = vault.indexReservedAmount - _indexAmount;
        vault.stableReservedAmount = vault.stableReservedAmount - _stableAmount;
    }

    function transferTokenTo(address token, address to, uint256 amount) external onlyPairLiquidityAndVault {
        IERC20(token).safeTransfer(to, amount);
    }

    function getVault(uint256 _pairIndex) external view returns (Vault memory vault) {
        return vaults[_pairIndex];
    }

    function updateAveragePrice(uint256 _pairIndex, uint256 _averagePrice) external onlyPairLiquidityAndVault {
        vaults[_pairIndex].averagePrice = _averagePrice;
    }

    function increaseProfit(uint256 _pairIndex, uint256 _profit) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        vault.stableTotalAmount += _profit;
        vault.realisedPnl += int256(_profit);
    }

    function decreaseProfit(uint256 _pairIndex, uint256 _profit) external onlyPairLiquidityAndVault {
        Vault storage vault = vaults[_pairIndex];
        uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;

        require(_profit <= availableStable, 'stable token not enough');

        vault.stableTotalAmount -= _profit;
        vault.realisedPnl -= int256(_profit);
    }

    function swap(
        uint256 _pairIndex,
        bool _isBuy,
        uint256 _amountIn,
        uint256 _amountOut
    ) external onlyPairLiquidityAndVault {
        Vault memory vault = vaults[_pairIndex];

        if (_isBuy) {
            uint256 availableIndex = vault.indexTotalAmount - vault.indexReservedAmount;

            require(_amountOut <= availableIndex, 'swap index token not enough');

            this.increaseTotalAmount(_pairIndex, 0, _amountIn);
            this.decreaseTotalAmount(_pairIndex, _amountOut, 0);
        } else {
            uint256 availableStable = vault.stableTotalAmount - vault.stableReservedAmount;

            require(_amountOut <= availableStable, 'swap stable token not enough');

            this.increaseTotalAmount(_pairIndex, _amountIn, 0);
            this.decreaseTotalAmount(_pairIndex, 0, _amountOut);
        }
    }
}
