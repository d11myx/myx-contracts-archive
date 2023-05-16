// SPDX-License-Identifier: MIT
import './interfaces/StorageInterfaceV5.sol';
pragma solidity 0.8.7;

contract GNSTradingIncentives{

    StorageInterfaceV5 public immutable storageT;
    uint constant public WINNERS_COUNT = 1000;

	uint16[WINNERS_COUNT] public rewardsMatic;

	mapping(address => uint) public positionsByWinners;
	mapping(uint => address) public winnersByPosition;
	mapping(address => bool) public claimed;

	constructor(
		StorageInterfaceV5 _storageT, 
		uint16[WINNERS_COUNT] memory _rewardsMatic
	){
		storageT = _storageT;
		rewardsMatic = _rewardsMatic;
	}

	function setWinner(address _trader, uint _position) external{
		require(msg.sender == storageT.gov(), "GOV_ONLY");
		require(_trader != address(0), "ADDRESS_0");
		require(_position >= 1 && _position <= WINNERS_COUNT, "WRONG_POSITION");
		require(winnersByPosition[_position] == address(0), "POSITION_ALREADY_SET");
		require(positionsByWinners[_trader] == 0, "TRADER_ALREADY_SET");
		winnersByPosition[_position] = _trader;
		positionsByWinners[_trader] = _position;
	}

	function claimMatic() external{
		require(!claimed[msg.sender], "ALREADY_CLAIMED");

		uint position = positionsByWinners[msg.sender];
		require(position > 0, "NOT_WINNER");

		claimed[msg.sender] = true;
		payable(msg.sender).transfer(uint(rewardsMatic[position-1])*1e18);
	}

	// Receive MATIC rewards
	receive() external payable {  }
}