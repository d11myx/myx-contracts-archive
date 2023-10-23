// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "../libraries/Upgradeable.sol";

import "../interfaces/ISpotSwap.sol";
import "../interfaces/IUniSwapV3Router.sol";

contract SpotSwap is ISpotSwap, Upgradeable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address public swapRouter;
    mapping(address => mapping(address => bytes)) public tokenPath;

    function initialize(IAddressesProvider addressProvider) public initializer {
        ADDRESS_PROVIDER = addressProvider;
    }

    function setSwapRouter(address _router) external onlyPoolAdmin {
        // IERC20(pair.indexToken).approve(swapRouter, amountInMaximum);
        swapRouter = _router;
    }

    function updateTokenPath(
        address tokenIn,
        address tokenOut,
        bytes memory path
    ) external onlyPoolAdmin {
        tokenPath[tokenIn][tokenOut] = path;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut) external {
        bytes memory path = tokenPath[tokenIn][tokenOut];
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        if (IERC20(tokenIn).allowance(address(this), swapRouter) == 0) {
            IERC20(tokenIn).safeApprove(swapRouter, type(uint256).max);
        }
        uint256 useAmountIn = IUniSwapV3Router(swapRouter).exactOutput(
            IUniSwapV3Router.ExactOutputParams({
                path: path,
                recipient: address(this),
                deadline: block.timestamp + 1000,
                amountOut: amountOut,
                amountInMaximum: amountIn
            })
        );
        uint256 blaOut = IERC20(tokenOut).balanceOf(address(this));
        if (blaOut >= amountOut) {
            IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
        } else {
            IERC20(tokenOut).safeTransfer(msg.sender, blaOut);
        }
        if (useAmountIn < amountIn) {
            IERC20(tokenIn).safeTransfer(msg.sender, amountIn.sub(useAmountIn));
        }
    }
}
