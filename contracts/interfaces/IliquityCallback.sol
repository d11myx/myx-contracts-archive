pragma solidity >=0.8.0;

interface IliquityCallback {
    function addLiquityCallback(uint256 amountIndex, uint256 amountStable, bytes calldata data) external;
}
