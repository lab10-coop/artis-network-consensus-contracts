pragma solidity ^0.4.24;

import './RewardByBlockMockBase.sol';

contract RewardByBlockMockWithActivationTimestamp is RewardByBlockMockBase {
    modifier onlyKeysManager {
        _;
    }
}