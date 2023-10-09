// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import "../interfaces/IAddressesProvider.sol";

contract Upgradeable is Initializable, UUPSUpgradeable {
    IAddressesProvider public immutable ADDRESS_PROVIDER;

    constructor(IAddressesProvider addressProvider) initializer {
        ADDRESS_PROVIDER = addressProvider;
    }

    // function initialize() public initializer {
    //     // __Ownable_init();
    //     // __UUPSUpgradeable_init();
    // }

    function _authorizeUpgrade(address newImplementation) internal virtual override {
        require(msg.sender == ADDRESS_PROVIDER.timelock(), "Unauthorized access");
    }
}
