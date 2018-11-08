let PoaNetworkConsensus = artifacts.require('./PoaNetworkConsensus');
let ProxyStorageMock = artifacts.require('./mockContracts/ProxyStorageMock');
let EternalStorageProxy = artifacts.require('./EternalStorageProxy');
const ERROR_MSG = 'VM Exception while processing transaction: revert';
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(web3.BigNumber))
  .should();

let poaNetworkConsensus;
const collateral_size = 4500;
contract('PoaNetworkConsensus [all features]', function (accounts) {
  let proxyStorageMock;
  let masterOfCeremony;
  beforeEach(async () => {
    masterOfCeremony = accounts[9];
    await PoaNetworkConsensus.new('0x0000000000000000000000000000000000000000', [], collateral_size).should.be.rejectedWith(ERROR_MSG);
    poaNetworkConsensus = await PoaNetworkConsensus.new(masterOfCeremony, [], collateral_size).should.be.fulfilled;
    
    proxyStorageMock = await ProxyStorageMock.new();
    const proxyStorageEternalStorage = await EternalStorageProxy.new(0, proxyStorageMock.address);
    proxyStorageMock = await ProxyStorageMock.at(proxyStorageEternalStorage.address);
    await proxyStorageMock.init(poaNetworkConsensus.address).should.be.fulfilled;
    
    await poaNetworkConsensus.setProxyStorage(proxyStorageMock.address).should.be.fulfilled;
    await poaNetworkConsensus.setProxyStorage(proxyStorageMock.address).should.be.rejectedWith(ERROR_MSG);
    
    await proxyStorageMock.initializeAddresses(
      accounts[0],
      accounts[0],
      accounts[0],
      accounts[0],
      accounts[0],
      accounts[0],
      accounts[0],
      accounts[0]
    );
  });

  describe('default values', async () => {
    it('finalized should be false', async () => {
      let validators = await poaNetworkConsensus.getValidators.call();
      let finalized = await poaNetworkConsensus.finalized.call();
      validators.should.be.deep.equal([
        masterOfCeremony
      ]);
      finalized.should.be.false;
    });

    it('checks systemAddress', async () => {
      let systemAddress = await poaNetworkConsensus.systemAddress.call();
      systemAddress.should.be.equal('0xfffffffffffffffffffffffffffffffffffffffe');
    })
  })

  describe('validator collateral tests', async () => {
    it('should fail if no collateral', async () => {
      // try to add a validator without prior deposit
      // expected to fail
      await poaNetworkConsensus.addValidator(accounts[1], true, {from: accounts[1]}).should.be.rejectedWith(ERROR_MSG);      
      await addValidator(accounts[1], false);
    })
    it('should succeed with collateral', async () => {
      // deposit collateral
      await web3.eth.sendTransaction({
        from: accounts[1],
        to: poaNetworkConsensus.address,
        value: collateral_size
      });
      (await web3.eth.getBalance(poaNetworkConsensus.address)).should.be.bignumber.equal(
        collateral_size
      );
      
      // this time it should work
      await addValidator(accounts[1], true);
    })
  })
});

async function addValidator(_validator, _shouldBeSuccessful, options) {
  const result = await poaNetworkConsensus.addValidator(_validator, true, options);
  if (_shouldBeSuccessful) {
    result.logs[0].event.should.be.equal("InitiateChange");
  } else {
    result.logs.length.should.be.equal(0);
  }
}
