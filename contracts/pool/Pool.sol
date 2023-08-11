// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import '../libraries/Roleable.sol';
import '../token/interfaces/IPairToken.sol';
import '../token/PairToken.sol';
import '../interfaces/IPairInfo.sol';
import '../interfaces/IPairLiquidity.sol';
import '../interfaces/IPairInfo.sol';

contract Pool is IPairInfo, Roleable {

    uint256 public constant PERCENTAGE = 10000;
    uint256 public constant FUNDING_RATE_PERCENTAGE = 1000000;

    uint256 public pairsCount;

    mapping(address => mapping(address => uint256)) public pairIndexes;
    mapping(uint256 => Pair) public pairs;
    mapping(uint256 => TradingConfig) public tradingConfigs;
    mapping(uint256 => TradingFeeConfig) public tradingFeeConfigs;
    mapping(uint256 => FundingFeeConfig) public fundingFeeConfigs;
    mapping(address => mapping(address => bool)) public isPairListed;


    constructor(IAddressesProvider addressProvider) Roleable(addressProvider) {}

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
        require(_pair.expectIndexTokenP <= PERCENTAGE && _pair.addLpFeeP <= PERCENTAGE, "exceed 100%");

        pair.enable = _pair.enable;
        pair.kOfSwap = _pair.kOfSwap;
        pair.expectIndexTokenP = _pair.expectIndexTokenP;
        pair.addLpFeeP = _pair.addLpFeeP;
    }

    function updateTradingConfig(uint256 _pairIndex, TradingConfig calldata _tradingConfig) external onlyPoolAdmin {
        require(_tradingConfig.maintainMarginRate <= PERCENTAGE && _tradingConfig.priceSlipP <= PERCENTAGE
        && _tradingConfig.maxPriceDeviationP <= PERCENTAGE, "exceed 100%");
        tradingConfigs[_pairIndex] = _tradingConfig;
    }

    function updateTradingFeeConfig(
        uint256 _pairIndex,
        TradingFeeConfig calldata _tradingFeeConfig
    ) external onlyPoolAdmin {
        require(_tradingFeeConfig.takerFeeP <= PERCENTAGE && _tradingFeeConfig.makerFeeP <= PERCENTAGE, "exceed 100%");
        tradingFeeConfigs[_pairIndex] = _tradingFeeConfig;
    }

    function updateFundingFeeConfig(
        uint256 _pairIndex,
        FundingFeeConfig calldata _fundingFeeConfig
    ) external onlyPoolAdmin {
        require(_fundingFeeConfig.minFundingRate <= 0 && _fundingFeeConfig.minFundingRate >= -int256(FUNDING_RATE_PERCENTAGE), "exceed min funding rate 100%");
        require(_fundingFeeConfig.maxFundingRate >= 0 && _fundingFeeConfig.maxFundingRate <= int256(FUNDING_RATE_PERCENTAGE), "exceed max funding rate 100%");
        require(_fundingFeeConfig.fundingWeightFactor <= PERCENTAGE && _fundingFeeConfig.liquidityPremiumFactor <= PERCENTAGE
            &&  _fundingFeeConfig.lpDistributeP <= PERCENTAGE, "exceed 100%");

        fundingFeeConfigs[_pairIndex] = _fundingFeeConfig;
    }

    function updatePairMiner(uint256 _pairIndex, address _account, bool _enable) external onlyPoolAdmin {
        Pair memory pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), 'pair not existed');

        IPairToken(pair.pairToken).setMiner(_account, _enable);
    }
}
