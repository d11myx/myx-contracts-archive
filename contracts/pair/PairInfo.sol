// SPDX-License-Identifier: MIT
import "../libraries/access/Handleable.sol";
import '../trading/interfaces/StorageInterfaceV5.sol';
import "../token/interfaces/IPairToken.sol";
import "../token/PairToken.sol";
import './interfaces/IPairInfo.sol';
import './interfaces/IPairLiquidity.sol';

pragma solidity 0.8.17;

contract PairInfo is IPairInfo, Handleable {

    mapping(address => mapping(address => uint256)) public pairIndexes;

    mapping(uint256 => Pair) public pairs;

    mapping(address => mapping(address => bool)) public isPairListed;

    uint256 public pairsCount;

    IPairLiquidity public pairLiquidity;

    // Events
    event PairAdded(address indexed indexToken, address indexed stableToken, address lpToken, uint256 index);

    function initialize() external initializer {
        __Handleable_init();
    }

    function setPairLiquidity(IPairLiquidity _pairLiquidity) external onlyHandler {
        pairLiquidity = _pairLiquidity;
    }

    // Manage pairs
    function addPair(Pair calldata _pair) external onlyHandler {
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
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), "pair not existed");

        pair.enable = _pair.enable;
        pair.minLeverage = _pair.minLeverage;
        pair.maxLeverage = _pair.maxLeverage;
        pair.minSize = _pair.minSize;
        pair.maxSize = _pair.maxSize;
        pair.kOfSwap = _pair.kOfSwap;
        pair.initPairRatio = _pair.initPairRatio;
    }

    function updateFee(uint256 _pairIndex, Fee calldata _fee) external onlyHandler {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), "pair not existed");

        pair.fee = _fee;
    }

    function updateTradingFeeDistribute(uint256 _pairIndex, TradingFeeDistribute calldata _tradingFeeDistribute) external onlyHandler {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), "pair not existed");

        pair.tradingFeeDistribute = _tradingFeeDistribute;
    }

    function updateFundingFeeDistribute(uint256 _pairIndex, FundingFeeDistribute calldata _fundingFeeDistribute) external onlyHandler {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), "pair not existed");

        pair.fundingFeeDistribute = _fundingFeeDistribute;
    }

    function getPair(uint256 _pairIndex) external view override returns(Pair memory) {
        return pairs[_pairIndex];
    }

    function getFee(uint256 _pairIndex) external view override returns(Fee memory) {
        return pairs[_pairIndex].fee;
    }

    function getTradingFeeDistribute(uint256 _pairIndex) external view override returns(TradingFeeDistribute memory) {
        return pairs[_pairIndex].tradingFeeDistribute;
    }

    function getFundingFeeDistribute(uint256 _pairIndex) external view override returns(FundingFeeDistribute memory) {
        return pairs[_pairIndex].fundingFeeDistribute;
    }

}