// SPDX-License-Identifier: MIT

import '@openzeppelin/contracts/utils/math/SafeMath.sol';

import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';
import '../interfaces/IIndexPriceFeed.sol';

import 'hardhat/console.sol';

pragma solidity 0.8.17;

contract IndexPriceFeed is IIndexPriceFeed {
    using SafeMath for uint256;

    uint256 public constant PRICE_PRECISION = 10 ** 30;

    uint256 public constant MAX_REF_PRICE = type(uint160).max;

    // uint256(~0) is 256 bits of 1s
    // shift the 1s by (256 - 32) to get (256 - 32) 0s followed by 32 1s
    uint256 public constant BITMASK_32 = uint256(~uint256(0)) >> (256 - 32);

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    uint256 public constant MAX_PRICE_DURATION = 30 minutes;

    uint256 public override lastUpdatedAt;

    uint256 public maxTimeDeviation;

    mapping(address => uint256) public prices;

    address[] public tokens;
    // array of tokenPrecisions used in setCompactedPrices, saves L1 calldata gas costs
    // if the token price will be sent with 3 decimals, then tokenPrecision for that token
    // should be 10 ** 3
    uint256[] public tokenPrecisions;

    IAddressesProvider addressProvider;

    constructor(IAddressesProvider _addressProvider) {
        addressProvider = _addressProvider;
    }

    modifier onlyKeeper() {
        require(IRoleManager(addressProvider.getRoleManager()).isKeeper(msg.sender), 'onlyKeeper');
        _;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(addressProvider.getRoleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }

    function setMaxTimeDeviation(uint256 _maxTimeDeviation) external onlyPoolAdmin {
        maxTimeDeviation = _maxTimeDeviation;
    }

    function setLastUpdatedAt(uint256 _lastUpdatedAt) external onlyPoolAdmin {
        lastUpdatedAt = _lastUpdatedAt;
    }

    function setTokens(address[] memory _tokens, uint256[] memory _tokenPrecisions) external onlyPoolAdmin {
        require(_tokens.length == _tokenPrecisions.length, 'invalid lengths');
        tokens = _tokens;
        tokenPrecisions = _tokenPrecisions;
    }

    function setPrices(address[] memory _tokens, uint256[] memory _prices, uint256 _timestamp) external onlyKeeper {
        bool shouldUpdate = _setLastUpdatedValues(_timestamp);

        if (shouldUpdate) {
            for (uint256 i = 0; i < _tokens.length; i++) {
                address token = _tokens[i];
                _setPrice(token, _prices[i]);
            }
        }
    }

    function setCompactedPrices(uint256[] memory _priceBitArray, uint256 _timestamp) external onlyKeeper {
        bool shouldUpdate = _setLastUpdatedValues(_timestamp);

        if (shouldUpdate) {
            for (uint256 i = 0; i < _priceBitArray.length; i++) {
                uint256 priceBits = _priceBitArray[i];

                for (uint256 j = 0; j < 8; j++) {
                    uint256 index = i * 8 + j;
                    if (index >= tokens.length) {
                        return;
                    }

                    uint256 startBit = 32 * j;
                    uint256 price = (priceBits >> startBit) & BITMASK_32;

                    address token = tokens[i * 8 + j];
                    uint256 tokenPrecision = tokenPrecisions[i * 8 + j];
                    uint256 adjustedPrice = price.mul(PRICE_PRECISION).div(tokenPrecision);

                    _setPrice(token, adjustedPrice);
                }
            }
        }
    }

    function setPricesWithBits(uint256 _priceBits, uint256 _timestamp) external onlyKeeper {
        _setPricesWithBits(_priceBits, _timestamp);
    }

    function getPrice(address _token) external view returns (uint256) {
        return prices[_token];
    }

    function _setPricesWithBits(uint256 _priceBits, uint256 _timestamp) private {
        bool shouldUpdate = _setLastUpdatedValues(_timestamp);

        if (shouldUpdate) {
            for (uint256 j = 0; j < 8; j++) {
                uint256 index = j;
                if (index >= tokens.length) {
                    return;
                }

                uint256 startBit = 32 * j;
                uint256 price = (_priceBits >> startBit) & BITMASK_32;

                address token = tokens[j];
                uint256 tokenPrecision = tokenPrecisions[j];
                uint256 adjustedPrice = price.mul(PRICE_PRECISION).div(tokenPrecision);

                _setPrice(token, adjustedPrice);
            }
        }
    }

    function _setPrice(address _token, uint256 _price) private {
        console.log('setPrice token %s price %s ', _token, _price);

        prices[_token] = _price;
        emit PriceUpdate(_token, _price, msg.sender);
    }

    function _setLastUpdatedValues(uint256 _timestamp) private returns (bool) {
        uint256 _maxTimeDeviation = maxTimeDeviation;
        require(_timestamp > block.timestamp.sub(_maxTimeDeviation), 'ts below range');
        require(_timestamp < block.timestamp.add(_maxTimeDeviation), 'ts exceeds range');

        // do not update prices if _timestamp is before the current lastUpdatedAt value
        if (_timestamp < lastUpdatedAt) {
            return false;
        }
        lastUpdatedAt = _timestamp;
        return true;
    }
}
