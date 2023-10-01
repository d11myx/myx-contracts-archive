// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IAddressesProvider.sol";
import "../libraries/Roleable.sol";

contract RiskReserve is Roleable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    mapping(address => int256) public assetReservedAmount;

    address public addressDao;
    address public addressPositionManager;

    event UpdatedDaoAddress(
        address sender,
        address oldAddress,
        address newAddress
    );

    event UpdatedPositionManagerAddress(
        address sender,
        address oldAddress,
        address newAddress
    );

    event Withdraw(
        address sender,
        address asset,
        uint256 amount,
        address to
    );

    constructor(
        address _addressDao,
        IAddressesProvider addressProvider
    ) Roleable(addressProvider) {
        addressDao = _addressDao;
    }

    modifier onlyDao() {
        require(msg.sender == addressDao, 'forbidden');
        _;
    }

    modifier onlyPositionManager() {
        require(msg.sender == addressPositionManager, 'forbidden');
        _;
    }

    function updateDaoAddress(address newAddress) external onlyPoolAdmin {
        address oldAddress = addressDao;
        addressDao = newAddress;
        emit UpdatedDaoAddress(msg.sender, oldAddress, addressDao);
    }

    function updatePositionManagerAddress(address newAddress) external onlyPoolAdmin {
        address oldAddress = addressDao;
        addressPositionManager = newAddress;
        emit UpdatedPositionManagerAddress(msg.sender, oldAddress, addressPositionManager);
    }

    function recharge(address asset, uint256 amount) external {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        assetReservedAmount[asset] += int256(amount);
    }

    function increase(address asset, uint256 amount) external onlyPositionManager {
        assetReservedAmount[asset] += int256(amount);
    }

    function decrease(address asset, uint256 amount) external onlyPositionManager {
        require(int256(amount) <= assetReservedAmount[asset], 'insufficient reserved amount');
        assetReservedAmount[asset] -= int256(amount);
    }

    function withdraw(address asset, uint256 amount, address to) external onlyDao {
        require(int256(amount) <= assetReservedAmount[asset], 'insufficient reserved amount');
        require(amount <= IERC20(asset).balanceOf(address(this)), 'insufficient balance');

        if (amount > 0) {
            IERC20(asset).safeTransfer(to, amount);
        }
        emit Withdraw(msg.sender, asset, amount, to);
    }

    function rescue(address asset, address to) external onlyPoolAdmin {
        IERC20(asset).safeTransfer(to, IERC20(asset).balanceOf(address(this)));
    }
}
