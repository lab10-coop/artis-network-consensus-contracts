# ARTIS Network Consensus Contracts

This contracts are the core of the ARTIS governance system.  
They implement a hybrid PoA / PoS consensus system, validator set (aka _trustnodes_) voting and a block reward contract.  
The voting system allows to change and upgrade the system in a well defined and transparent way. Most importantly, it allows to upgrade the governance contracts itself (by using the [Proxy Pattern](https://blog.zeppelinos.org/proxy-patterns/)) without the need to rely on a trusted "admin" or on a rigid multisig mechanism.  

The contracts also take advantage of Parity specific APIs, like those for [Validator Set Contracts](https://wiki.parity.io/Validator-Set.html#contracts) and for [Block Reward Contracts](https://wiki.parity.io/Block-Reward-Contract.html).

The contracts were originally developed by poa.network, where they also underwent substantial security audits (see below).   
ARTIS specific changes were limited to the introduction of a collateral requirement for trustnodes.

## Security Audits
- [PoA Consensus Audit](https://github.com/poanetwork/poa-network-consensus-contracts/blob/master/audit/MixBytes/PoA%20Consensus%20Audit.pdf) by MixBytes
- [PoA Consensus Audit](https://github.com/poanetwork/poa-network-consensus-contracts/blob/master/audit/ChainSecurity/ChainSecurity_PoA.pdf) by ChainSecurity

## Run tests

Use node.js v8.

- `npm ci`
- `npm test`

The test script builds the contracts, starts an instance of [ganache-cli](https://github.com/trufflesuite/ganache-cli) in the background and then executes all tests (takes a while).

## Start a network

New networks are bootstrapped by a _Master of Ceremony_.  
The steps are described in https://github.com/poanetwork/wiki/wiki/Master-of-Ceremony-Setup.
