// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IAddressesProvider.sol";
import "../interfaces/IRiskReserve.sol";
import "../libraries/Roleable.sol";

contract RiskReserve is IRiskReserve, Roleable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    mapping(address => int256) public assetReservedAmount;

    address public addressDao;
    address public addressPositionManager;

    constructor(
        address _addressDao,
        IAddressesProvider addressProvider
    ) Roleable(addressProvider) {
        addressDao = _addressDao;
    }

    modifier onlyDao() {
        require(msg.sender == addressDao, 'onlyDao');
        _;
    }

    modifier onlyPositionManager() {
        require(msg.sender == addressPositionManager, 'onlyPositionManager');
        _;
    }

    function updateDaoAddress(address newAddress) external override onlyPoolAdmin {
        address oldAddress = addressDao;
        addressDao = newAddress;
        emit UpdatedDaoAddress(msg.sender, oldAddress, addressDao);
    }

    function updatePositionManagerAddress(address newAddress) external override onlyPoolAdmin {
        address oldAddress = addressDao;
        addressPositionManager = newAddress;
        emit UpdatedPositionManagerAddress(msg.sender, oldAddress, addressPositionManager);
    }

    function increase(address asset, uint256 amount) external override onlyPositionManager {
        assetReservedAmount[asset] += int256(amount);
    }

    function decrease(address asset, uint256 amount) external override onlyPositionManager {
        assetReservedAmount[asset] -= int256(amount);
    }

    function recharge(address asset, uint256 amount) external override {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        assetReservedAmount[asset] += int256(amount);
    }

    function withdraw(address asset, uint256 amount, address to) external override onlyDao {
        require(int256(amount) <= assetReservedAmount[asset], 'insufficient reserved amount');
        require(amount <= IERC20(asset).balanceOf(address(this)), 'insufficient balance');

        if (amount > 0) {
            IERC20(asset).safeTransfer(to, amount);
        }
        emit Withdraw(msg.sender, asset, amount, to);
    }

    function rescue(address asset, address to) external override onlyPoolAdmin {
        IERC20(asset).safeTransfer(to, IERC20(asset).balanceOf(address(this)));
    }
}
