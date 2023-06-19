// SPDX-License-Identifier: MIT
import "../libraries/access/Handleable.sol";
import '../trading/interfaces/StorageInterfaceV5.sol';
import "../token/interfaces/IPairToken.sol";
import "../token/PairToken.sol";
import './interfaces/IPairStorage.sol';
import './interfaces/IPairVault.sol';

pragma solidity 0.8.17;

contract PairsStorage is IPairStorage, Handleable {

    // Params (constant)
    uint256 constant MIN_LEVERAGE = 2;
    uint256 constant MAX_LEVERAGE = 100;

    IPairVault public pairVault;

    mapping(address => mapping(address => uint256)) public pairIndexes;

    mapping(uint256 => Pair) public pairs;

    mapping(uint256 => bool) public isPairListed;

    uint256 public pairsCount;


    // Events
    event PairAdded(address indexed indexToken, address indexed stableToken, address lpToken, uint256 index);

    function initialize() external initializer {
        __Handleable_init();
    }

    function setPairVault(IPairVault _pairVault) public onlyOwner {
        pairVault = _pairVault;
    }

    // Manage pairs
    function addPair(Pair calldata _pair) public onlyOwner {
        address indexToken = _pair.indexToken;
        address stableToken = _pair.stableToken;

        uint256 pairIndex = pairIndexes[indexToken][stableToken];

        require(pairs[pairIndex].indexToken == address(0), 'pair existed');

        pairs[pairsCount] = _pair;

        require(indexToken != stableToken, 'identical address');
        require(indexToken != address(0) && stableToken != address(0), 'zero address');
        isPairListed[pairsCount] = true;

        address pairToken = pairVault.createPair(indexToken, stableToken);

        emit PairAdded(indexToken, stableToken, pairToken, pairsCount++);
    }

    function updatePair(uint256 _pairIndex, Pair calldata _pair) external onlyOwner {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), "pair not existed");

        pair.spreadP = _pair.spreadP;
        pair.k = _pair.k;
        pair.minLeverage = _pair.minLeverage;
        pair.maxLeverage = _pair.maxLeverage;
        pair.maxCollateralP = _pair.maxCollateralP;
    }

    function updateFee(uint256 _pairIndex, Fee calldata _fee) external onlyOwner {
        Pair storage pair = pairs[_pairIndex];
        require(pair.indexToken != address(0) && pair.stableToken != address(0), "pair not existed");

        pair.fee = _fee;
    }


    function getPair(uint256 _pairIndex) external view override returns(Pair memory) {
        return pairs[_pairIndex];
    }


}