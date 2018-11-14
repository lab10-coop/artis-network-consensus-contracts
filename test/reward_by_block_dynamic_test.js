const PoaNetworkConsensus = artifacts.require('./mockContracts/PoaNetworkConsensusMock');
const ProxyStorage = artifacts.require('./mockContracts/ProxyStorageMock');
const EternalStorageProxy = artifacts.require('./EternalStorageProxy');
const KeysManager = artifacts.require('./KeysManager');
const ValidatorMetadata = artifacts.require('./ValidatorMetadata');
const RewardByBlock = artifacts.require('./mockContracts/RewardByBlockMock');

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(web3.BigNumber))
  .should();

const ERROR_MSG = 'VM Exception while processing transaction: revert';

contract('RewardByBlock [all features]', function (accounts) {
  let poaNetworkConsensus, proxyStorage;
  let blockRewardAmount, emissionFundsAmount, emissionFundsAddress;
  let coinbase;
  let masterOfCeremony;
  let miningKey;
  let miningKey2;
  let miningKey3;
  let payoutKey;
  let payoutKey2;
  let payoutKey3;
  let systemAddress;

  beforeEach(async () => {
    coinbase = accounts[0];
    masterOfCeremony = accounts[0];
    miningKey = accounts[1];
    miningKey2 = accounts[2];
    miningKey3 = accounts[3];
    payoutKey = accounts[4];
    payoutKey2 = accounts[5];
    payoutKey3 = accounts[6];
    systemAddress = accounts[7];
    votingToChangeKeys = accounts[9];

    poaNetworkConsensus = await PoaNetworkConsensus.new(masterOfCeremony, []);

    proxyStorage = await ProxyStorage.new();
    const proxyStorageEternalStorage = await EternalStorageProxy.new(0, proxyStorage.address);
    proxyStorage = await ProxyStorage.at(proxyStorageEternalStorage.address);
    await proxyStorage.init(poaNetworkConsensus.address).should.be.fulfilled;

    await poaNetworkConsensus.setProxyStorage(proxyStorage.address);

    keysManager = await KeysManager.new();
    const keysManagerEternalStorage = await EternalStorageProxy.new(proxyStorage.address, keysManager.address);
    keysManager = await KeysManager.at(keysManagerEternalStorage.address);
    await keysManager.init(
      "0x0000000000000000000000000000000000000000"
    ).should.be.fulfilled;

    const validatorMetadata = await ValidatorMetadata.new();
    const validatorMetadataEternalStorage = await EternalStorageProxy.new(proxyStorage.address, validatorMetadata.address);

    await proxyStorage.initializeAddresses(
      keysManagerEternalStorage.address,
      votingToChangeKeys,
      accounts[9],
      accounts[9],
      accounts[9],
      accounts[9],
      validatorMetadataEternalStorage.address,
      accounts[9]
    );

    await addMiningKey(miningKey);
    await addMiningKey(miningKey2);
    await addMiningKey(miningKey3);
    await addPayoutKey(payoutKey, miningKey);
    await addPayoutKey(payoutKey2, miningKey2);
    await addPayoutKey(payoutKey3, miningKey3);
    await poaNetworkConsensus.setSystemAddress(coinbase);
    await poaNetworkConsensus.finalizeChange().should.be.fulfilled;
    await poaNetworkConsensus.setSystemAddress('0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE');

    rewardByBlock = await RewardByBlock.new();
    rewardByBlockOldImplementation = rewardByBlock.address;
    rewardByBlockEternalStorage = await EternalStorageProxy.new(proxyStorage.address, rewardByBlock.address);
    rewardByBlock = await RewardByBlock.at(rewardByBlockEternalStorage.address);

    blockRewardAmount = web3.toWei(1, 'ether');
    emissionFundsAmount = web3.toWei(1, 'ether');
    emissionFundsAddress = '0x0000000000000000000000000000000000000000';
  });

  describe('dynamic payout', async () => {
    it('should fail with amounts equal or higher than the base block award', async () => {
      const full_reward = web3.toWei('1', 'ether');
      const double_reward = web3.toWei('2', 'ether');

      // global override
      await rewardByBlock.setBlockRewardOverride(full_reward).should.be.rejectedWith(ERROR_MSG);
      await rewardByBlock.setBlockRewardOverride(double_reward).should.be.rejectedWith(ERROR_MSG);

      // per-account override
      await rewardByBlock.setBlockRewardOverrideForAccount(miningKey, full_reward).should.be.rejectedWith(ERROR_MSG);
      await rewardByBlock.setBlockRewardOverrideForAccount(miningKey, double_reward).should.be.rejectedWith(ERROR_MSG);
    });

    it('should succeed with amounts lower than the block reward', async () => {
      const half_reward = web3.toWei('0.5', 'ether');

      // global override
      await rewardByBlock.setBlockRewardOverride(half_reward).should.be.fulfilled;

      // per-account override
      await rewardByBlock.setBlockRewardOverrideForAccount(miningKey, half_reward).should.be.fulfilled;
    });
    
    it('getBlockRewardAmountForAccount should respect global override', async () => {
      const half_reward = web3.toWei('0.5', 'ether');

      await rewardByBlock.setBlockRewardOverride(half_reward).should.be.fulfilled;
      let reward = await rewardByBlock.getBlockRewardAmountForAccount.call(miningKey);
      reward.should.be.bignumber.equal(half_reward);
    });

    it('specific override should trump global override', async () => {
      const half_reward = web3.toWei('0.5', 'ether');
      const quater_reward = web3.toWei('0.25', 'ether');

      await rewardByBlock.setBlockRewardOverride(half_reward).should.be.fulfilled;
      await rewardByBlock.setBlockRewardOverrideForAccount(miningKey, quater_reward).should.be.fulfilled;

      (await rewardByBlock.getBlockRewardAmountForAccount.call(miningKey)).should.be.bignumber.equal(quater_reward);

      // but other accounts should have global reward applied
      (await rewardByBlock.getBlockRewardAmountForAccount.call(miningKey2)).should.be.bignumber.equal(half_reward);
    });

    it('setting to 0 should reset to full award for global override', async () => {
      const half_reward = web3.toWei('0.5', 'ether');

      await rewardByBlock.setBlockRewardOverride(half_reward).should.be.fulfilled;
      (await rewardByBlock.getBlockRewardAmountForAccount.call(miningKey)).should.be.bignumber.equal(half_reward);

      await rewardByBlock.setBlockRewardOverride(0).should.be.fulfilled;
      (await rewardByBlock.getBlockRewardAmountForAccount.call(miningKey)).should.be.bignumber.equal(blockRewardAmount);
    });

    it('setting to 0 should reset to full award for per-address override', async () => {
      const half_reward = web3.toWei('0.5', 'ether');

      await rewardByBlock.setBlockRewardOverrideForAccount(miningKey, half_reward).should.be.fulfilled;
      (await rewardByBlock.getBlockRewardAmountForAccount.call(miningKey)).should.be.bignumber.equal(half_reward);

      await rewardByBlock.setBlockRewardOverrideForAccount(miningKey, 0).should.be.fulfilled;
      (await rewardByBlock.getBlockRewardAmountForAccount.call(miningKey)).should.be.bignumber.equal(blockRewardAmount);
    });

    it('global override should have an effect on actual payouts', async () => {
      await rewardByBlock.setSystemAddress(systemAddress);
      // test original payout amount
      let result = await rewardByBlock.reward(
        [miningKey],
        [0],
        {from: systemAddress}
      ).should.be.fulfilled;
      result.logs[0].event.should.be.equal('Rewarded');
      result.logs[0].args.rewards[0].toString().should.be.equal(blockRewardAmount.toString());

      const half_reward = web3.toWei('0.5', 'ether');
      await rewardByBlock.setBlockRewardOverride(half_reward).should.be.fulfilled;
      
      result = await rewardByBlock.reward(
        [miningKey],
        [0],
        {from: systemAddress}
      ).should.be.fulfilled;
      result.logs[0].event.should.be.equal('Rewarded');
      result.logs[0].args.rewards[0].toString().should.be.equal(half_reward);
    });
  })
});

async function addMiningKey(_key) {
  const {logs} = await keysManager.addMiningKey(_key, {from: votingToChangeKeys});
  logs[0].event.should.be.equal("MiningKeyChanged");
}

async function addPayoutKey(_key, _miningKey) {
  const {logs} = await keysManager.addPayoutKey(_key, _miningKey, {from: votingToChangeKeys});
  logs[0].event.should.be.equal("PayoutKeyChanged");
}