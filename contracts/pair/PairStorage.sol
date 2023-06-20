// SPDX-License-Identifier: MIT
import "../libraries/access/Handleable.sol";
import '../trading/interfaces/StorageInterfaceV5.sol';
import "../token/interfaces/IPairToken.sol";
import "../token/PairToken.sol";
import './interfaces/IPairStorage.sol';
import './interfaces/IPairVault.sol';

pragma solidity 0.8.17;

contract PairStorage is IPairStorage, Handleable {

    // Params (constant)
    uint256 constant MIN_LEVERAGE = 2;
    uint256 constant MAX_LEVERAGE = 100;

    IPairVault public pairVault;

    mapping(address => mapping(address => uint256)) public pairIndexes;

    mapping(uint256 => Pair) public pairs;

    mapping(address => mapping(address => bool)) public isPairListed;

    uint256 public pairsCount;


    // Events
    event PairAdded(address indexed indexToken, address indexed stableToken, address lpToken, uint256 index);

    function initialize() external initializer {
        __Handleable_init();
    }

    function setPairVault(IPairVault _pairVault) external onlyHandler {
        pairVault = _pairVault;
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

        address pairToken = pairVault.createPair(indexToken, stableToken);
        pairs[pairsCount] = _pair;
        pairs[pairsCount].pairToken = pairToken;

        emit PairAdded(indexToken, stableToken, pairToken, pairsCount++);
    }

    function updatePair(uint256 _pairIndex, Pair calldata _pair) external onlyHandler {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), "pair not existed");

        pair.spreadP = _pair.spreadP;
        pair.k = _pair.k;
        pair.minLeverage = _pair.minLeverage;
        pair.maxLeverage = _pair.maxLeverage;
        pair.maxCollateralP = _pair.maxCollateralP;
        pair.enable = _pair.enable;
    }

    function updateFee(uint256 _pairIndex, Fee calldata _fee) external onlyHandler {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), "pair not existed");

        pair.fee = _fee;
    }


    function getPair(uint256 _pairIndex) external view override returns(Pair memory) {
        return pairs[_pairIndex];
    }


}