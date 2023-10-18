// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IWETH.sol";

abstract contract ETHGateway {
    using SafeERC20 for IERC20;

    address public immutable WETH;

    constructor(address _weth) {
        WETH = _weth;
    }

    receive() external payable {
        require(msg.sender == WETH, "Not WETH");
    }

    function safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "err-transfer-eth");
    }

    function wrapWETH() external payable {
        IWETH(WETH).deposit{value: msg.value}(); // wrap only what is needed to pay
        IWETH(WETH).transfer(msg.sender, msg.value);
    }

    function unwrapWETH(uint256 amount) external payable {
        IWETH(WETH).withdraw(amount);
        safeTransferETH(msg.sender, amount);
    }
}
