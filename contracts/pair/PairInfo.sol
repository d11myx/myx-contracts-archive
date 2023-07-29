// SPDX-License-Identifier: MIT
import "../libraries/access/Handleable.sol";
import "../token/interfaces/IPairToken.sol";
import "../token/PairToken.sol";
import './interfaces/IPairInfo.sol';
import './interfaces/IPairLiquidity.sol';

pragma solidity 0.8.17;

contract PairInfo is IPairInfo, Handleable {

    uint256 public constant PERCENTAGE = 10000;

    IPairLiquidity public pairLiquidity;

    uint256 public pairsCount;

    mapping(address => mapping(address => uint256)) public pairIndexes;

    mapping(uint256 => Pair) public pairs;

    mapping(uint256 => TradingConfig) public tradingConfigs;

    mapping(uint256 => TradingFeeConfig) public tradingFeeConfigs;

    mapping(uint256 => FundingFeeConfig) public fundingFeeConfigs;

    mapping(address => mapping(address => bool)) public isPairListed;


    // Events
    event PairAdded(address indexed indexToken, address indexed stableToken, address lpToken, uint256 index);

    function initialize() external initializer {
        __Handleable_init();
    }

    function setPairLiquidity(IPairLiquidity _pairLiquidity) external onlyHandler {
        pairLiquidity = _pairLiquidity;
    }

    // Manage pairs
    function addPair(
        Pair calldata _pair,
        TradingConfig calldata _tradingConfig,
        TradingFeeConfig calldata _tradingFeeConfig,
        FundingFeeConfig calldata _fundingFeeConfig
    ) external onlyHandler {
        address indexToken = _pair.indexToken;
        address stableToken = _pair.stableToken;

        uint256 pairIndex = pairIndexes[indexToken][stableToken];

        require(!isPairListed[indexToken][stableToken], 'pair already listed');

        pairIndexes[indexToken][stableToken] = pairsCount;

        require(indexToken != stableToken, 'identical address');
        require(indexToken != address(0) && stableToken != address(0), 'zero address');
        isPairListed[indexToken][stableToken] = true;

        address pairToken = _createPair(indexToken, stableToken);
        pairs[pairsCount] = _pair;
        pairs[pairsCount].pairToken = pairToken;

        require(_tradingFeeConfig.lpDistributeP + _tradingFeeConfig.keeperDistributeP + _tradingFeeConfig.treasuryDistributeP
            + _tradingFeeConfig.refererDistributeP == PERCENTAGE, "percentage exceed 100%");
        require(_fundingFeeConfig.lpDistributeP + _fundingFeeConfig.userDistributeP + _fundingFeeConfig.treasuryDistributeP == PERCENTAGE,
            "percentage exceed 100%");
        tradingConfigs[pairsCount] = _tradingConfig;
        tradingFeeConfigs[pairsCount] = _tradingFeeConfig;
        fundingFeeConfigs[pairsCount] = _fundingFeeConfig;

        emit PairAdded(indexToken, stableToken, pairToken, pairsCount++);
    }

    function _createPair(address indexToken, address stableToken) private returns (address) {
        bytes memory bytecode = abi.encodePacked(type(PairToken).creationCode, abi.encode(indexToken, stableToken, address(pairLiquidity)));
        bytes32 salt = keccak256(abi.encodePacked(indexToken, stableToken));
        address pairToken;
        assembly {
            pairToken := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        return pairToken;
    }

    function updatePair(uint256 _pairIndex, Pair calldata _pair) external onlyHandler {
        Pair memory pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), "pair not existed");

        pair.enable = _pair.enable;
        pair.kOfSwap = _pair.kOfSwap;
        pair.initPrice = _pair.initPrice;
        pair.addLpFeeP = _pair.addLpFeeP;
    }

    function updateTradingConfig(uint256 _pairIndex, TradingConfig calldata _tradingConfig) external onlyHandler {
        tradingConfigs[_pairIndex] = _tradingConfig;
    }

    function updateTradingFeeConfig(uint256 _pairIndex, TradingFeeConfig calldata _tradingFeeConfig) external onlyHandler {
        require(_tradingFeeConfig.lpDistributeP + _tradingFeeConfig.keeperDistributeP + _tradingFeeConfig.treasuryDistributeP
            + _tradingFeeConfig.refererDistributeP == PERCENTAGE, "percentage exceed 100%");
        tradingFeeConfigs[_pairIndex] = _tradingFeeConfig;
    }

    function updateFundingFeeConfig(uint256 _pairIndex, FundingFeeConfig calldata _fundingFeeConfig) external onlyHandler {
        require(_fundingFeeConfig.lpDistributeP + _fundingFeeConfig.userDistributeP + _fundingFeeConfig.treasuryDistributeP == PERCENTAGE,
            "percentage exceed 100%");
        fundingFeeConfigs[_pairIndex] = _fundingFeeConfig;
    }

    function getPair(uint256 _pairIndex) external view override returns(Pair memory) {
        return pairs[_pairIndex];
    }

    function getTradingConfig(uint256 _pairIndex) external view override returns(TradingConfig memory) {
        return tradingConfigs[_pairIndex];
    }

    function getTradingFeeConfig(uint256 _pairIndex) external view override returns(TradingFeeConfig memory) {
        return tradingFeeConfigs[_pairIndex];
    }

    function getFundingFeeConfig(uint256 _pairIndex) external view override returns(FundingFeeConfig memory) {
        return fundingFeeConfigs[_pairIndex];
    }

}
