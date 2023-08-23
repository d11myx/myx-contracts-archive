pragma solidity >=0.8.0;

interface IPoolTokenFactory {
    //function getPoolToken(address indexToken, address stableToken) external view returns(address);

    function createPoolToken(address indexToken, address stableToken) external returns (address);
}
