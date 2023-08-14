pragma solidity >=0.8.0;

interface IliquityCallback {
    function addLiquityCallback(uint256 amountIndex, uint256 amountStable, bytes calldata data) external;

    function removeLiquityCallback(address pairToken,uint256 amount, bytes calldata data) external;
}
