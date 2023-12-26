// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "../libraries/Roleable.sol";

import "../interfaces/IPriceFeed.sol";
import "../interfaces/IAddressesProvider.sol";

pragma solidity 0.8.19;

contract ChainlinkPriceFeed is IPriceFeed, Roleable {
    using SafeMath for uint256;

    event FeedUpdate(address asset, address feed);

    uint256 public immutable PRICE_DECIMALS = 30;
    uint256 private constant GRACE_PERIOD_TIME = 3600;

    uint256 public priceAge;

    // token -> sequencerUptimeFeed
    mapping(address => address) public sequencerUptimeFeeds;

    mapping(address => address) public dataFeeds;

    constructor(
        IAddressesProvider _addressProvider,
        address[] memory _assets,
        address[] memory _feeds
    ) Roleable(_addressProvider) {
        _setAssetPrices(_assets, _feeds);
        priceAge = 10;
    }

    modifier onlyTimelock() {
        require(msg.sender == ADDRESS_PROVIDER.timelock(), "only timelock");
        _;
    }

    function updatePriceAge(uint256 age) external onlyPoolAdmin {
        uint256 oldAge = priceAge;
        priceAge = age;
        emit PriceAgeUpdated(oldAge, priceAge);
    }

    function decimals() public pure override returns (uint256) {
        return PRICE_DECIMALS;
    }

    function setTokenConfig(address[] memory assets, address[] memory feeds) external onlyTimelock {
        _setAssetPrices(assets, feeds);
    }

    function _setAssetPrices(address[] memory assets, address[] memory feeds) private {
        require(assets.length == feeds.length, "inconsistent params length");
        for (uint256 i = 0; i < assets.length; i++) {
            require(assets[i] != address(0), "!0");
            dataFeeds[assets[i]] = feeds[i];
            emit FeedUpdate(assets[i], feeds[i]);
        }
    }

    function getPrice(address token) public view override returns (uint256) {
        (, uint256 price,,,) = latestRoundData(token);
        return price;
    }

    function getPriceSafely(address token) external view override returns (uint256) {
        (, uint256 price,, uint256 updatedAt,) = latestRoundData(token);
        if (block.timestamp > updatedAt + priceAge) {
            revert("invalid price");
        }
        return getPrice(token);
    }

    function latestRoundData(address token) public view returns (uint80 roundId, uint256 price, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) {
        address dataFeedAddress = dataFeeds[token];
        require(dataFeedAddress != address(0), "invalid data feed");

        if (sequencerUptimeFeeds[token] != address(0)) {
            checkSequencerStatus(token);
        }
        AggregatorV3Interface dataFeed = AggregatorV3Interface(dataFeedAddress);
        uint256 decimals = uint256(dataFeed.decimals());
        int256 answer;
        (roundId, answer, startedAt, updatedAt, answeredInRound) = dataFeed.latestRoundData();
        require(answer > 0, "invalid price");
        price = uint256(answer) * (10 ** (PRICE_DECIMALS - decimals));
    }

    function checkSequencerStatus(address token) public view {
        address sequencerAddress = sequencerUptimeFeeds[token];
        require(sequencerAddress != address(0), "invalid sequencer");

        AggregatorV3Interface sequencer = AggregatorV3Interface(sequencerAddress);
        (, int256 answer, uint256 startedAt,,) = sequencer.latestRoundData();

        // Answer == 0: Sequencer is up
        // Answer == 1: Sequencer is down
        bool isSequencerUp = answer == 0;
        if (!isSequencerUp) {
            revert("SequencerDown");
        }

        // Make sure the grace period has passed after the
        // sequencer is back up.
        uint256 timeSinceUp = block.timestamp - startedAt;
        if (timeSinceUp <= GRACE_PERIOD_TIME) {
            revert("GracePeriodNotOver");
        }
    }
}
