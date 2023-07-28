
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import '@openzeppelin/contracts/access/Ownable.sol';
import './interfaces/IAddressProvider.sol';

contract PoolAddressesProvider is Ownable, IPoolAddressesProvider {
   
    bytes32 private constant ROLE_MANAGER = 'ROLE_MANAGER';
    bytes32 private constant PRICE_ORACLE = 'PRICE_ORACLE';

    mapping(bytes32 => address) private _addresses;
    
    function getAddress(bytes32 id) public view override returns (address) {
        return _addresses[id];
    }

    
    function setAddress(bytes32 id, address newAddress) public override onlyOwner {
        address oldAddress = _addresses[id];
        _addresses[id] = newAddress;
        emit AddressSet(id, oldAddress, newAddress);
    }

    function getPriceOracle() external view override returns (address) {
        return getAddress(PRICE_ORACLE);
    }


    function setPriceOracle(address newPriceOracle) external override onlyOwner {
        address oldPriceOracle = _addresses[PRICE_ORACLE];
        _addresses[PRICE_ORACLE] = newPriceOracle;
        emit AddressSet(PRICE_ORACLE,oldPriceOracle, newPriceOracle);
    }


    
    function getRoleManager() external view override returns (address) {
        return getAddress(ROLE_MANAGER);
    }

    
    function setRolManager(address newAddress) external override onlyOwner {
        address oldAclManager = _addresses[ROLE_MANAGER];
        setAddress(ROLE_MANAGER, newAddress);
        emit AddressSet(ROLE_MANAGER,oldAclManager, newAddress);
    }

    
  

}
