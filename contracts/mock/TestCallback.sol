pragma solidity >=0.8.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/IPool.sol';
import '../interfaces/IliquityCallback.sol';
import '../interfaces/ISwapCallback.sol';

contract TestCallBack is IliquityCallback, ISwapCallback {
    address public tokenIndex;
    address public tokenStable;

    constructor(address _tokenIndex, address _tokenStable) {
        tokenIndex = _tokenIndex;
        tokenStable = _tokenStable;
    }

    function addLiquidity(address pool, uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external {
        IPool(pool).addLiquidity(msg.sender, _pairIndex, _indexAmount, _stableAmount, abi.encode(msg.sender));
    }

    function addLiquityCallback(uint256 amountIndex, uint256 amountStable, bytes calldata data) external override {
        address sender = abi.decode(data, (address));

        if (amountIndex > 0) {
            IERC20(tokenIndex).transferFrom(sender, msg.sender, uint256(amountIndex));
        }
        if (amountStable > 0) {
            IERC20(tokenStable).transferFrom(sender, msg.sender, uint256(amountStable));
        }
    }

    function removeLiquityCallback(address pairToken, uint256 amount, bytes calldata data) external {
        address sender = abi.decode(data, (address));
        IERC20(pairToken).transferFrom(sender, msg.sender, amount);
    }

    function swapCallback(
        address indexToken,
        address stableToken,
        uint256 indexAmount,
        uint256 stableAmount,
        bytes calldata data
    ) external {
        address sender = abi.decode(data, (address));

        if (indexAmount > 0) {
            IERC20(indexToken).transferFrom(sender, msg.sender, indexAmount);
        } else if (stableAmount > 0) {
            IERC20(stableToken).transferFrom(sender, msg.sender, stableAmount);
        }
    }
}
