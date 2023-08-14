pragma solidity >=0.8.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/IPool.sol';
import '../interfaces/IliquityCallback.sol';

contract TestCallBack is IliquityCallback {
    address public tokenIndex;
    address public tokenStable;

    constructor(address _tokenIndex, address _tokenStable) {
        tokenIndex = _tokenIndex;
        tokenStable = _tokenStable;
    }

    function addLiquidity(address pool, uint256 _pairIndex, uint256 _indexAmount, uint256 _stableAmount) external {
        IPool(pool).addLiquidity(_pairIndex, _indexAmount, _stableAmount, abi.encode(msg.sender));
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
}
