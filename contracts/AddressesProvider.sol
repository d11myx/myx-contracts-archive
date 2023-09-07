// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.20;

import '@openzeppelin/contracts/access/Ownable.sol';
import './interfaces/IAddressesProvider.sol';
import './libraries/Errors.sol';

contract AddressesProvider is Ownable, IAddressesProvider {
    bytes32 private constant TIMELOCK = 'TIMELOCK';
    bytes32 private constant ROLE_MANAGER = 'ROLE_MANAGER';
    bytes32 private constant PRICE_ORACLE = 'PRICE_ORACLE';
    bytes32 private constant INDEX_PRICE_ORACLE = 'INDEX_PRICE_ORACLE';

    address public override timelock;
    address public override priceOracle;
    address public override indexPriceOracle;

    mapping(bytes32 => address) private _addresses;

    constructor(address _timelock) {
        timelock = _timelock;
    }

    modifier onlyTimelock() {
        require(msg.sender == timelock, 'only timelock');
        _;
    }

    function getAddress(bytes32 id) public view returns (address) {
        return _addresses[id];
    }

    function roleManager() external view override returns (address) {
        return getAddress(ROLE_MANAGER);
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

    function initOracle(address newPriceOracle, address newIndexPriceOracle) external onlyOwner {
        require(priceOracle == address(0) && indexPriceOracle == address(0), 'first init');
        require(newPriceOracle != address(0) && newIndexPriceOracle != address(0), '!0');
        priceOracle = newPriceOracle;
        indexPriceOracle = newIndexPriceOracle;
        emit AddressSet(PRICE_ORACLE, address(0), newPriceOracle);
        emit AddressSet(INDEX_PRICE_ORACLE, address(0), newIndexPriceOracle);
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

    function setRolManager(address newAddress) external onlyOwner {
        require(newAddress != address(0), Errors.NOT_ADDRESS_ZERO);
        address oldAclManager = _addresses[ROLE_MANAGER];
        setAddress(ROLE_MANAGER, newAddress);
        emit AddressSet(ROLE_MANAGER, oldAclManager, newAddress);
    }
}
