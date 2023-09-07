// SPDX-License-Identifier: MIT

import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

import '../interfaces/IOraclePriceFeed.sol';
import '../interfaces/IPriceFeed.sol';
import '../interfaces/IOraclePrice.sol';
import '../interfaces/IChainlinkFlags.sol';
import '../interfaces/IAddressesProvider.sol';
import '../interfaces/IRoleManager.sol';

// import 'hardhat/console.sol';

pragma solidity 0.8.20;

contract OraclePriceFeed is IOraclePriceFeed {
    using SafeMath for uint256;

    uint256 public constant PRICE_PRECISION = 10 ** 30;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant MAX_SPREAD_BASIS_POINTS = 50;
    uint256 public constant MAX_ADJUSTMENT_INTERVAL = 2 hours;
    uint256 public constant MAX_ADJUSTMENT_BASIS_POINTS = 20;

    // Identifier of the Sequencer offline flag on the Flags contract
    address private constant FLAG_ARBITRUM_SEQ_OFFLINE =
        address(bytes20(bytes32(uint256(keccak256('chainlink.flags.arbitrum-seq-offline')) - 1)));

    address public chainlinkFlags;

    address public indexPriceFeed;

    IAddressesProvider addressProvider;

    mapping(address => address) public priceFeeds;
    mapping(address => uint256) public priceDecimals;

    constructor(IAddressesProvider _addressProvider) {
        addressProvider = _addressProvider;
    }

    modifier onlyKeeper() {
        require(IRoleManager(addressProvider.roleManager()).isKeeper(msg.sender), 'onlyKeeper');
        _;
    }

    modifier onlyPoolAdmin() {
        require(IRoleManager(addressProvider.roleManager()).isPoolAdmin(msg.sender), 'onlyPoolAdmin');
        _;
    }

    function setChainlinkFlags(address _chainlinkFlags) external onlyPoolAdmin {
        chainlinkFlags = _chainlinkFlags;
    }

    function setIndexPriceFeed(address _secondaryPriceFeed) external onlyPoolAdmin {
        indexPriceFeed = _secondaryPriceFeed;
    }

    function setTokenConfig(address _token, address _priceFeed, uint256 _priceDecimals) external onlyPoolAdmin {
        priceFeeds[_token] = _priceFeed;
        priceDecimals[_token] = _priceDecimals;
    }

    function getPrice(address _token) public view override returns (uint256) {
        uint256 price = getPrimaryPrice(_token);
        require(price > 0, 'invalid price');
        return price;
    }

    function getPrimaryPrice(address _token) public view returns (uint256) {
        address priceFeedAddress = priceFeeds[_token];
        require(priceFeedAddress != address(0), 'invalid price feed');

        if (chainlinkFlags != address(0)) {
            bool isRaised = IChainlinkFlags(chainlinkFlags).getFlag(FLAG_ARBITRUM_SEQ_OFFLINE);
            if (isRaised) {
                // If flag is raised we shouldn't perform any critical operations
                revert('Chainlink feeds are not being updated');
            }
        }

        IPriceFeed priceFeed = IPriceFeed(priceFeedAddress);

        uint256 price = 0;
        int256 _p = priceFeed.latestAnswer();
        require(_p > 0, 'invalid price');
        price = uint256(_p);

        require(price > 0, 'could not fetch price');

        uint256 _priceDecimals = priceDecimals[_token];
        return price.mul(PRICE_PRECISION).div(10 ** _priceDecimals);
    }

    //     function getIndexPrice(address _token, uint256 _referencePrice) public view returns (uint256) {
    //         if (indexPriceFeed == address(0)) {
    //             return _referencePrice;
    //         }
    //         return IOraclePrice(indexPriceFeed).getPrice(_token);
    //     }
}
