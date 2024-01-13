// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAddressesProvider.sol";
import "./libraries/Errors.sol";

contract AddressesProvider is Ownable, Initializable, IAddressesProvider {
    bytes32 private constant TIMELOCK = "TIMELOCK";
    bytes32 private constant ROLE_MANAGER = "ROLE_MANAGER";
    bytes32 private constant PRICE_ORACLE = "PRICE_ORACLE";
    bytes32 private constant INDEX_PRICE_ORACLE = "INDEX_PRICE_ORACLE";
    bytes32 private constant FUNDING_RATE = "FUNDING_RATE";
    bytes32 private constant EXCUTION_LOGIC = "EXCUTION_LOGIC";
    bytes32 private constant LIQUIDATION_LOGIC = "LIQUIDATION_LOGIC";
    bytes32 private constant BACKTRACKER = "BACKTRACKER";

    address public immutable override WETH;
    address public override timelock;
    address public override priceOracle;
    address public override indexPriceOracle;
    address public override fundingRate;
    address public override executionLogic;

    address public override liquidationLogic;

    mapping(bytes32 => address) private _addresses;

    constructor(address _weth, address _timelock) {
        timelock = _timelock;
        WETH = _weth;
    }

    modifier onlyTimelock() {
        require(msg.sender == timelock, "only timelock");
        _;
    }

    function getAddress(bytes32 id) public view returns (address) {
        return _addresses[id];
    }

    function roleManager() external view override returns (address) {
        return getAddress(ROLE_MANAGER);
    }

    function backtracker() external view override returns (address) {
        return getAddress(BACKTRACKER);
    }

    function setTimelock(address newAddress) public onlyTimelock {
        address oldAddress = newAddress;
        timelock = newAddress;
        emit AddressSet(TIMELOCK, oldAddress, newAddress);
    }

    function setAddress(bytes32 id, address newAddress) public onlyOwner {
        address oldAddress = _addresses[id];
        _addresses[id] = newAddress;
        emit AddressSet(id, oldAddress, newAddress);
    }

    function initialize(
        address newPriceOracle,
        address newIndexPriceOracle,
        address newFundingRateAddress,
        address newExecutionLogic,
        address newLiquidationLogic,
        address _backtracker
    ) external onlyOwner initializer {
        require(
            newPriceOracle != address(0) &&
                newFundingRateAddress != address(0) &&
                newIndexPriceOracle != address(0),
            "!0"
        );
        priceOracle = newPriceOracle;
        fundingRate = newFundingRateAddress;
        indexPriceOracle = newIndexPriceOracle;
        executionLogic = newExecutionLogic;
        liquidationLogic = newLiquidationLogic;
        setAddress(BACKTRACKER, _backtracker);

        emit AddressSet(INDEX_PRICE_ORACLE, address(0), newIndexPriceOracle);
        emit AddressSet(FUNDING_RATE, address(0), newFundingRateAddress);
        emit AddressSet(PRICE_ORACLE, address(0), newPriceOracle);
        emit AddressSet(EXCUTION_LOGIC, address(0), newExecutionLogic);
        emit AddressSet(LIQUIDATION_LOGIC, address(0), newLiquidationLogic);
    }

    function setPriceOracle(address newPriceOracle) external onlyTimelock {
        address oldPriceOracle = _addresses[PRICE_ORACLE];
        priceOracle = newPriceOracle;
        emit AddressSet(PRICE_ORACLE, oldPriceOracle, newPriceOracle);
    }

    function setIndexPriceOracle(address newIndexPriceOracle) external onlyTimelock {
        address oldIndexPriceOracle = _addresses[INDEX_PRICE_ORACLE];
        indexPriceOracle = newIndexPriceOracle;
        emit AddressSet(INDEX_PRICE_ORACLE, oldIndexPriceOracle, newIndexPriceOracle);
    }

    function setFundingRate(address newFundingRate) external onlyTimelock {
        address oldFundingRate = _addresses[FUNDING_RATE];
        fundingRate = newFundingRate;
        emit AddressSet(FUNDING_RATE, oldFundingRate, fundingRate);
    }

    function setExecutionLogic(address newExecutionLogic) external onlyTimelock {
        address oldExecutionLogic = _addresses[EXCUTION_LOGIC];
        executionLogic = newExecutionLogic;
        emit AddressSet(EXCUTION_LOGIC, oldExecutionLogic, newExecutionLogic);
    }

    function setLiquidationLogic(address newLiquidationLogic) external onlyTimelock {
        address oldLiquidationLogic = _addresses[LIQUIDATION_LOGIC];
        liquidationLogic = newLiquidationLogic;
        emit AddressSet(LIQUIDATION_LOGIC, oldLiquidationLogic, newLiquidationLogic);
    }

    function setBacktracker(address newAddress) external onlyTimelock {
        require(newAddress != address(0), Errors.NOT_ADDRESS_ZERO);
        address oldBacktracker = _addresses[BACKTRACKER];
        _addresses[BACKTRACKER] = newAddress;
        emit AddressSet(BACKTRACKER, oldBacktracker, newAddress);
    }

    function setRolManager(address newAddress) external onlyOwner {
        require(newAddress != address(0), Errors.NOT_ADDRESS_ZERO);
        setAddress(ROLE_MANAGER, newAddress);
    }
}
