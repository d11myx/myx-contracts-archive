// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import './BaseToken.sol';

contract StMYX is BaseToken {
    constructor() ERC20('Staked MYX', 'stMYX') {}
}
