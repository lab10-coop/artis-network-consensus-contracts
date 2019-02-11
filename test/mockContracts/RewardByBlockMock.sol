pragma solidity ^0.4.24;

import './RewardByBlockMockBase.sol';

contract RewardByBlockMock is RewardByBlockMockBase {
    function emissionFundsActivationTimestamp() public pure returns(uint) {
        return 0; // always active
    }
}
