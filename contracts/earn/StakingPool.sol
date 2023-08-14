// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../token/interfaces/IBaseToken.sol";
import "./interfaces/IStakingPool.sol";

// staking pool for MYX / raMYX
contract StakingPool is IStakingPool, Pausable, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public stakeToken;
    address public stToken;

    uint256 public maxStakeAmount;

    mapping(address => uint256) public userStaked;

    uint256 public totalStaked;

    mapping (address => bool) public isHandler;

    event Stake(address indexed stakeToken, address indexed account, uint256 amount);
    event Unstake(address indexed stakeToken, address indexed account, uint256 amount);

    constructor(address _stakeToken, address _stToken) public {
        stakeToken = _stakeToken;
        stToken = _stToken;
    }

    modifier onlyHandler() {
        require(isHandler[msg.sender], 'StakingPool: handler forbidden');
        _;
    }

    function setHandler(address _handler, bool enable) external onlyOwner {
        isHandler[_handler] = enable;
    }

    function setMaxStakeAmount(uint256 _maxStakeAmount) external onlyOwner {
        maxStakeAmount = _maxStakeAmount;
    }

    function stake(uint256 amount) external whenNotPaused {
        _stake(msg.sender, msg.sender, amount);
    }

    function stakeForAccount(address funder, address account, uint256 amount) external override onlyHandler whenNotPaused {
        _stake(funder, account, amount);
    }

    function unstake(uint256 amount) external whenNotPaused {
        _unstake(msg.sender, msg.sender, amount);
    }

    function unstakeForAccount(address account, address receiver, uint256 amount) external override onlyHandler whenNotPaused {
        _unstake(account, receiver, amount);
    }

    function _stake(address funder, address account, uint256 amount) private {
        require(amount > 0, "StakingPool: invalid stake amount");
        require(userStaked[account] + amount <= maxStakeAmount, "StakingPool: exceed max stake amount");

        userStaked[account] = userStaked[account] + amount;
        totalStaked = totalStaked + amount;

        IERC20(stakeToken).safeTransferFrom(funder, address(this), amount);
        IBaseToken(stToken).mint(account, amount);

        emit Stake(stakeToken, account, amount);
    }

    function _unstake(address account, address receiver, uint256 amount) private {
        require(userStaked[account] > 0, "StakingPool: none staked");
        require(amount > 0 && amount <= userStaked[account], "StakingPool: invalid unstake amount");

        userStaked[account] = userStaked[account] - amount;
        totalStaked = totalStaked - amount;

        IERC20(stakeToken).safeTransfer(receiver, amount);
        IBaseToken(stToken).burn(account, amount);

        emit Unstake(stakeToken, account, amount);
    }

    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    function unpause() external onlyOwner whenPaused {
        _unpause();
    }
}
