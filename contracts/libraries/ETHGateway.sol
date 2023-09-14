// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import '../interfaces/IWETH.sol';

abstract contract ETHGateway {
    using SafeERC20 for IERC20;

    address public immutable WETH;

    constructor(address _weth) {
        WETH = _weth;
    }

    receive() external payable {
        require(msg.sender == WETH, 'Not WETH');
    }

    function safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, 'err-transfer-eth');
    }

    function unwrapWETH(uint256 amountMinimum, address recipient) external payable {
        uint256 balanceWETH9 = IWETH(WETH).balanceOf(address(this));
        require(balanceWETH9 >= amountMinimum, 'Insufficient WETH');

        if (balanceWETH9 > 0) {
            IWETH(WETH).withdraw(balanceWETH9);
            safeTransferETH(recipient, balanceWETH9);
        }
    }

    function sweepToken(address token, uint256 amountMinimum, address recipient) external payable {
        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        require(balanceToken >= amountMinimum, 'Insufficient token');

        if (balanceToken > 0) {
            IERC20(token).safeTransfer(recipient, balanceToken);
        }
    }

    // function refundETH() private payable {
    //     if (address(this).balance > 0) safeTransferETH(msg.sender, address(this).balance);
    // }

    function pay(address token, address payer, address recipient, uint256 value) internal {
        if (token == WETH && address(this).balance >= value) {
            IWETH(WETH).deposit{value: value}(); // wrap only what is needed to pay
            IWETH(WETH).transfer(recipient, value);
        } else if (payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            IERC20(token).safeTransfer(recipient, value);
        } else {
            // pull payment
            IERC20(token).safeTransferFrom(payer, recipient, value);
        }
    }
}
