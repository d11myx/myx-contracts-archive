pragma solidity >=0.8.0;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import '../interfaces/IliquityCallback.sol';

contract TestCallBack is IliquityCallback {
    address public tokenIndex;
    address public tokenStable;

    constructor(address _tokenIndex, address _tokenStable) {
        tokenIndex = _tokenIndex;
        tokenStable = _tokenStable;
    }

    function addLiquityCallback(uint256 amountIndex, uint256 amountStable, bytes calldata data) external override {
        address sender = abi.decode(data, (address));

        if (amountIndex > 0) {
            IERC20(tokenIndex).transferFrom(sender, msg.sender, uint256(amountIndex));
        } else if (amountStable > 0) {
            IERC20(tokenStable).transferFrom(sender, msg.sender, uint256(amountStable));
        } else {
            assert(amountIndex == 0 && amountStable == 0);
        }
    }
}
