// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';
import "./interfaces/IVaultPriceFeed.sol";
import "../interfaces/IPriceFeed.sol";
import "./interfaces/ISecondaryPriceFeed.sol";
import "./interfaces/IChainlinkFlags.sol";
import {Errors} from '../libraries/Errors.sol';
import "hardhat/console.sol";

pragma solidity 0.8.17;

contract VaultPriceFeed is IVaultPriceFeed {
    using SafeMath for uint256;

    uint256 public constant PRICE_PRECISION = 10 ** 30;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant MAX_SPREAD_BASIS_POINTS = 50;
    uint256 public constant MAX_ADJUSTMENT_INTERVAL = 2 hours;
    uint256 public constant MAX_ADJUSTMENT_BASIS_POINTS = 20;

    // Identifier of the Sequencer offline flag on the Flags contract
    address constant private FLAG_ARBITRUM_SEQ_OFFLINE = address(bytes20(bytes32(uint256(keccak256("chainlink.flags.arbitrum-seq-offline")) - 1)));


    address public chainlinkFlags;

    bool public isSecondaryPriceEnabled = true;

    // price round space
    uint256 public priceSampleSpace = 3;
    uint256 public maxStrictPriceDeviation = 0;
    address public secondaryPriceFeed;

    mapping (address => address) public priceFeeds;
    mapping (address => uint256) public priceDecimals;

    IAddressesProvider addressProvider;

    modifier onlyPoolAdmin() {
        require(IRoleManager(addressProvider.getRoleManager()).isPoolAdmin(msg.sender), Errors.CALLER_NOT_POOL_ADMIN);
        _;
    }

    constructor(IAddressesProvider _addressProvider)  {
        addressProvider =_addressProvider;
    }

    function setChainlinkFlags(address _chainlinkFlags) external onlyPoolAdmin {
        chainlinkFlags = _chainlinkFlags;
    }


    function setIsSecondaryPriceEnabled(bool _isEnabled) external override onlyPoolAdmin {
        isSecondaryPriceEnabled = _isEnabled;
    }

    function setSecondaryPriceFeed(address _secondaryPriceFeed) external onlyPoolAdmin {
        secondaryPriceFeed = _secondaryPriceFeed;
    }

    function setPriceSampleSpace(uint256 _priceSampleSpace) external override onlyPoolAdmin {
        require(_priceSampleSpace > 0, "VaultPriceFeed: invalid _priceSampleSpace");
        priceSampleSpace = _priceSampleSpace;
    }

    function setMaxStrictPriceDeviation(uint256 _maxStrictPriceDeviation) external override onlyPoolAdmin {
        maxStrictPriceDeviation = _maxStrictPriceDeviation;
    }

    function setTokenConfig(
        address _token,
        address _priceFeed,
        uint256 _priceDecimals
    ) external override onlyPoolAdmin {
        priceFeeds[_token] = _priceFeed;
        priceDecimals[_token] = _priceDecimals;

    }

    function getPrice(address _token, bool _maximise) public override view returns (uint256) {
        uint256 price = getPriceV1(_token, _maximise);

        return price;
    }

    function getPriceV1(address _token, bool _maximise) public view returns (uint256) {
        uint256 price = getPrimaryPrice(_token, _maximise);
        console.log("getPriceV1 getPrimaryPrice", price);


        if (isSecondaryPriceEnabled) {
            price = getSecondaryPrice(_token, price, _maximise);
            console.log("getPriceV1 getSecondaryPrice", price);
        }

        return price;
    }


    function getLatestPrimaryPrice(address _token) public override view returns (uint256) {
        address priceFeedAddress = priceFeeds[_token];
        require(priceFeedAddress != address(0), "VaultPriceFeed: invalid price feed");

        // todo IChainlinkPriceFeed
        IPriceFeed priceFeed = IPriceFeed(priceFeedAddress);

        int256 price = priceFeed.latestAnswer();
        require(price > 0, "VaultPriceFeed: invalid price");

        return uint256(price);
    }

    // _maximise: if get the max price in round
    function getPrimaryPrice(address _token, bool _maximise) public override view returns (uint256) {
        address priceFeedAddress = priceFeeds[_token];
        require(priceFeedAddress != address(0), "VaultPriceFeed: invalid price feed");

        if (chainlinkFlags != address(0)) {
            bool isRaised = IChainlinkFlags(chainlinkFlags).getFlag(FLAG_ARBITRUM_SEQ_OFFLINE);
            if (isRaised) {
                    // If flag is raised we shouldn't perform any critical operations
                revert("Chainlink feeds are not being updated");
            }
        }

        // todo IChainlinkPriceFeed
        IPriceFeed priceFeed = IPriceFeed(priceFeedAddress);

        uint256 price = 0;
        uint80 roundId = priceFeed.latestRound();

        for (uint80 i = 0; i < priceSampleSpace; i++) {
            console.log("getPrimaryPrice i %s priceSampleSpace %s roundId %s", i, priceSampleSpace, roundId);

            if (roundId <= i) { break; }
            uint256 p;

            if (i == 0) {
                int256 _p = priceFeed.latestAnswer();
                require(_p > 0, "VaultPriceFeed: invalid price");
                p = uint256(_p);
            } else {
                (, int256 _p, , ,) = priceFeed.getRoundData(roundId - i);
                require(_p > 0, "VaultPriceFeed: invalid price");
                p = uint256(_p);
            }
            console.log("getPrimaryPrice i %s price %s p %s", i, price, p);

            if (price == 0) {
                price = p;
                continue;
            }

            if (_maximise && p > price) {
                price = p;
                continue;
            }

            if (!_maximise && p < price) {
                price = p;
            }
        }

        require(price > 0, "VaultPriceFeed: could not fetch price");
        // normalise price precision
        uint256 _priceDecimals = priceDecimals[_token];
        return price.mul(PRICE_PRECISION).div(10 ** _priceDecimals);
    }

    function getSecondaryPrice(address _token, uint256 _referencePrice, bool _maximise) public view returns (uint256) {
        if (secondaryPriceFeed == address(0)) { return _referencePrice; }
        return ISecondaryPriceFeed(secondaryPriceFeed).getPrice(_token, _referencePrice);
    }


}
