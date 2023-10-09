// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

contract Upgradeable is Initializable, UUPSUpgradeable {
    constructor() initializer {}

    function initialize() public initializer {
        // __Ownable_init();
        // __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override {
        //todo add hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // require(_msgSender() == owner(), "Unauthorized access");
        // console.log("_authorizeUpgrade executed for admin:", _msgSender());
        // console.log("New implementation address:", newImplementation);
    }
}
