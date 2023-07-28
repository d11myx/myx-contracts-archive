// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./interfaces/ISecondaryPriceFeed.sol";
import "./interfaces/IFastPriceFeed.sol";
import "./interfaces/IVaultPriceFeed.sol";
import "../libraries/access/Governable.sol";

import "hardhat/console.sol";

pragma solidity 0.8.17;

contract FastPriceFeed is ISecondaryPriceFeed, IFastPriceFeed, Governable {
    using SafeMath for uint256;

    // fit data in a uint256 slot to save gas costs
    struct PriceDataItem {
        uint160 refPrice; // Chainlink price
        uint32 refTime; // last updated at time
        // uint32 cumulativeRefDelta; // cumulative Chainlink price delta
        // uint32 cumulativeFastDelta; // cumulative fast price delta
    }

    uint256 public constant PRICE_PRECISION = 10 ** 30;

    uint256 public constant CUMULATIVE_DELTA_PRECISION = 10 * 1000 * 1000;

    uint256 public constant MAX_REF_PRICE = type(uint160).max;
    uint256 public constant MAX_CUMULATIVE_REF_DELTA = type(uint32).max;
    uint256 public constant MAX_CUMULATIVE_FAST_DELTA = type(uint32).max;

    // uint256(~0) is 256 bits of 1s
    // shift the 1s by (256 - 32) to get (256 - 32) 0s followed by 32 1s
    uint256 constant public BITMASK_32 = uint256(~uint256(0)) >> (256 - 32);

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    uint256 public constant MAX_PRICE_DURATION = 30 minutes;

    bool public isInitialized;

    address public vaultPriceFeed;


    address public tokenManager;

    uint256 public override lastUpdatedAt;
    uint256 public override lastUpdatedBlock;

    uint256 public priceDuration;
    uint256 public maxPriceUpdateDelay;
    
    uint256 public minBlockInterval;
    uint256 public maxTimeDeviation;

    uint256 public priceDataInterval;

    // allowed deviation from primary price
    uint256 public maxDeviationBasisPoints;

    uint256 public minAuthorizations;


    mapping (address => bool) public isUpdater;

    mapping (address => uint256) public prices;
    mapping (address => PriceDataItem) public priceData;
    mapping (address => uint256) public maxCumulativeDeltaDiffs;

    mapping (address => bool) public isSigner;
    mapping (address => bool) public disableFastPriceVotes;

    // array of tokens used in setCompactedPrices, saves L1 calldata gas costs
    address[] public tokens;
    // array of tokenPrecisions used in setCompactedPrices, saves L1 calldata gas costs
    // if the token price will be sent with 3 decimals, then tokenPrecision for that token
    // should be 10 ** 3
    uint256[] public tokenPrecisions;

    event PriceUpdate(address token, uint256 price, address priceFeed);
    event DisableFastPrice(address signer);
    event EnableFastPrice(address signer);
    event PriceData(address token, uint256 refPrice, uint256 fastPrice);
    

    modifier onlySigner() {
        require(isSigner[msg.sender], "FastPriceFeed: forbidden");
        _;
    }

    modifier onlyUpdater() {
        require(isUpdater[msg.sender], "FastPriceFeed: forbidden");
        _;
    }

    modifier onlyTokenManager() {
        require(msg.sender == tokenManager, "FastPriceFeed: forbidden");
        _;
    }

    constructor(
      uint256 _priceDuration,
      uint256 _maxPriceUpdateDelay,
      uint256 _minBlockInterval,
      uint256 _maxDeviationBasisPoints,
      address _tokenManager
    )  {
        require(_priceDuration <= MAX_PRICE_DURATION, "FastPriceFeed: invalid _priceDuration");
        priceDuration = _priceDuration;
        maxPriceUpdateDelay = _maxPriceUpdateDelay;
        minBlockInterval = _minBlockInterval;
        maxDeviationBasisPoints = _maxDeviationBasisPoints;
        tokenManager = _tokenManager;
        gov = msg.sender;
    }

    function initialize(uint256 _minAuthorizations, address[] memory _signers, address[] memory _updaters) public onlyGov {
        require(!isInitialized, "FastPriceFeed: already initialized");
        isInitialized = true;

        minAuthorizations = _minAuthorizations;

        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            isSigner[signer] = true;
        }

        for (uint256 i = 0; i < _updaters.length; i++) {
            address updater = _updaters[i];
            isUpdater[updater] = true;
        }
    }

    function setUpdater(address _account, bool _isActive) external override onlyGov {
        isUpdater[_account] = _isActive;
    }

    function setVaultPriceFeed(address _vaultPriceFeed) external override onlyGov {
      vaultPriceFeed = _vaultPriceFeed;
    }

    function setMaxTimeDeviation(uint256 _maxTimeDeviation) external onlyGov {
        maxTimeDeviation = _maxTimeDeviation;
    }

    function setPriceDuration(uint256 _priceDuration) external override onlyGov {
        require(_priceDuration <= MAX_PRICE_DURATION, "FastPriceFeed: invalid _priceDuration");
        priceDuration = _priceDuration;
    }

    function setMaxPriceUpdateDelay(uint256 _maxPriceUpdateDelay) external override onlyGov {
        maxPriceUpdateDelay = _maxPriceUpdateDelay;
    }

    function setMinBlockInterval(uint256 _minBlockInterval) external override onlyGov {
        minBlockInterval = _minBlockInterval;
    }

    function setLastUpdatedAt(uint256 _lastUpdatedAt) external onlyGov {
        lastUpdatedAt = _lastUpdatedAt;
    }

    function setTokenManager(address _tokenManager) external onlyTokenManager {
        tokenManager = _tokenManager;
    }

    function setMaxDeviationBasisPoints(uint256 _maxDeviationBasisPoints) external override onlyTokenManager {
        maxDeviationBasisPoints = _maxDeviationBasisPoints;
    }

    function setMaxCumulativeDeltaDiffs(address[] memory _tokens,  uint256[] memory _maxCumulativeDeltaDiffs) external override onlyTokenManager {
        for (uint256 i = 0; i < _tokens.length; i++) {
            address token = _tokens[i];
            maxCumulativeDeltaDiffs[token] = _maxCumulativeDeltaDiffs[i];
        }
    }

    function setPriceDataInterval(uint256 _priceDataInterval) external override onlyTokenManager {
        priceDataInterval = _priceDataInterval;
    }

    function setMinAuthorizations(uint256 _minAuthorizations) external onlyTokenManager {
        minAuthorizations = _minAuthorizations;
    }

    function setTokens(address[] memory _tokens, uint256[] memory _tokenPrecisions) external onlyGov {
        require(_tokens.length == _tokenPrecisions.length, "FastPriceFeed: invalid lengths");
        tokens = _tokens;
        tokenPrecisions = _tokenPrecisions;
    }

    function setPrices(address[] memory _tokens, uint256[] memory _prices, uint256 _timestamp) external onlyUpdater {
        bool shouldUpdate = _setLastUpdatedValues(_timestamp);

        if (shouldUpdate) {
            
            address _vaultPriceFeed = vaultPriceFeed;

            for (uint256 i = 0; i < _tokens.length; i++) {
                address token = _tokens[i];
                _setPrice(token, _prices[i], _vaultPriceFeed);
            }
        }
    }

    function setCompactedPrices(uint256[] memory _priceBitArray, uint256 _timestamp) external onlyUpdater {
        bool shouldUpdate = _setLastUpdatedValues(_timestamp);

        if (shouldUpdate) {
            address _vaultPriceFeed = vaultPriceFeed;

            for (uint256 i = 0; i < _priceBitArray.length; i++) {
                uint256 priceBits = _priceBitArray[i];

                for (uint256 j = 0; j < 8; j++) {
                    uint256 index = i * 8 + j;
                    if (index >= tokens.length) { return; }

                    uint256 startBit = 32 * j;
                    uint256 price = (priceBits >> startBit) & BITMASK_32;

                    address token = tokens[i * 8 + j];
                    uint256 tokenPrecision = tokenPrecisions[i * 8 + j];
                    uint256 adjustedPrice = price.mul(PRICE_PRECISION).div(tokenPrecision);

                    _setPrice(token, adjustedPrice, _vaultPriceFeed);
                }
            }
        }
    }

    function setPricesWithBits(uint256 _priceBits, uint256 _timestamp) external onlyUpdater {
        _setPricesWithBits(_priceBits, _timestamp);
    }


   
    function getPrice(address _token, uint256 _refPrice, bool _maximise) external override view returns (uint256) {
        

        uint256 fastPrice = prices[_token];
        console.log("getPrice _token %s _refPrice %s fastPrice %s", _token, _refPrice, fastPrice);

        if (fastPrice == 0) { return _refPrice; }
        if (_refPrice == 0) { return fastPrice; }

        uint256 diffBasisPoints = _refPrice > fastPrice ? _refPrice.sub(fastPrice) : fastPrice.sub(_refPrice);
        diffBasisPoints = diffBasisPoints.mul(BASIS_POINTS_DIVISOR).div(_refPrice);

        // create a spread between the _refPrice and the fastPrice if the maxDeviationBasisPoints is exceeded
        // or if watchers have flagged an issue with the fast price
        bool hasSpread = !favorFastPrice(_token) || diffBasisPoints > maxDeviationBasisPoints;

        console.log("getPrice diffBasisPoints %s maxDeviationBasisPoints %s hasSpread %s", diffBasisPoints, maxDeviationBasisPoints, hasSpread);

        if (hasSpread) {
            // return the higher of the two prices
            if (_maximise) {
                return _refPrice > fastPrice ? _refPrice : fastPrice;
            }

            // return the lower of the two prices
            return _refPrice < fastPrice ? _refPrice : fastPrice;
        }

        return fastPrice;
    }

    function favorFastPrice(address _token) public view returns (bool) {
    

        return true;
    }

    function getPriceData(address _token) public view returns (uint256, uint256) {
        PriceDataItem memory data = priceData[_token];
        return (uint256(data.refPrice), uint256(data.refTime));
    }

    function _setPricesWithBits(uint256 _priceBits, uint256 _timestamp) private {
        bool shouldUpdate = _setLastUpdatedValues(_timestamp);

        if (shouldUpdate) {
            
            address _vaultPriceFeed = vaultPriceFeed;

            for (uint256 j = 0; j < 8; j++) {
                uint256 index = j;
                if (index >= tokens.length) { return; }

                uint256 startBit = 32 * j;
                uint256 price = (_priceBits >> startBit) & BITMASK_32;

                address token = tokens[j];
                uint256 tokenPrecision = tokenPrecisions[j];
                uint256 adjustedPrice = price.mul(PRICE_PRECISION).div(tokenPrecision);

                _setPrice(token, adjustedPrice, _vaultPriceFeed);
            }
        }
    }

    function _setPrice(address _token, uint256 _price, address _vaultPriceFeed) private {
        console.log("setPrice token %s price %s vaultPriceFeed %s", _token, _price, _vaultPriceFeed);
        if (_vaultPriceFeed != address(0)) {
            uint256 refPrice = IVaultPriceFeed(_vaultPriceFeed).getLatestPrimaryPrice(_token);
            uint256 fastPrice = prices[_token];

            (uint256 prevRefPrice, uint256 refTime) = getPriceData(_token);

            if (prevRefPrice > 0) {
                uint256 refDeltaAmount = refPrice > prevRefPrice ? refPrice.sub(prevRefPrice) : prevRefPrice.sub(refPrice);
                uint256 fastDeltaAmount = fastPrice > _price ? fastPrice.sub(_price) : _price.sub(fastPrice);

                
            }

            
            _setPriceData(_token, refPrice);
            emit PriceData(_token, refPrice, fastPrice);
        }

        prices[_token] = _price;
        _emitPriceEvent( _token, _price);
    }

    function _setPriceData(address _token, uint256 _refPrice) private {
        require(_refPrice < MAX_REF_PRICE, "FastPriceFeed: invalid refPrice");
        

        priceData[_token] = PriceDataItem(
            uint160(_refPrice),
            uint32(block.timestamp)
        );
    }

    function _emitPriceEvent( address _token, uint256 _price) private {
        
        emit PriceUpdate(_token, _price, msg.sender);
    }

    function _setLastUpdatedValues(uint256 _timestamp) private returns (bool) {
        if (minBlockInterval > 0) {
            require(block.number.sub(lastUpdatedBlock) >= minBlockInterval, "FastPriceFeed: minBlockInterval not yet passed");
        }

        uint256 _maxTimeDeviation = maxTimeDeviation;
        require(_timestamp > block.timestamp.sub(_maxTimeDeviation), "FastPriceFeed: _timestamp below allowed range");
        require(_timestamp < block.timestamp.add(_maxTimeDeviation), "FastPriceFeed: _timestamp exceeds allowed range");

        // do not update prices if _timestamp is before the current lastUpdatedAt value
        if (_timestamp < lastUpdatedAt) {
            return false;
        }

        lastUpdatedAt = _timestamp;
        lastUpdatedBlock = block.number;

        return true;
    }
}
