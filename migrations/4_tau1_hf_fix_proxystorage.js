/*
 * In the previous HF, only PoaNetworkConsensus, ProxyStorage and RewardByBlock were replaced.
 * However - as it turns out - all contracts using EternalStorage need to he replaced,
 * because their reference to proxyStorage can't be updated.
 * It's basically 2-way pointers (from proxyStorage to contracts and back) which became inconsistent.
 */

const fs = require('fs');
const solc = require('solc');
const PoaNetworkConsensus = artifacts.require("./PoaNetworkConsensus.sol");
const ProxyStorage = artifacts.require("./ProxyStorage.sol");
const KeysManager = artifacts.require("./KeysManager.sol");
const BallotsStorage = artifacts.require("./BallotsStorage.sol");
const ValidatorMetadata = artifacts.require("./ValidatorMetadata.sol");
const VotingToChangeKeys = artifacts.require("./VotingToChangeKeys");
const VotingToChangeMinThreshold = artifacts.require("./VotingToChangeMinThreshold");
const VotingToChangeProxyAddress = artifacts.require("./VotingToChangeProxyAddress");
const VotingToManageEmissionFunds = artifacts.require("./VotingToManageEmissionFunds");
const EmissionFunds = artifacts.require("./EmissionFunds");
const RewardByBlock = artifacts.require("./RewardByBlock");
const EternalStorageProxy = artifacts.require("./eternal-storage/EternalStorageProxy.sol");
const Web3 = require('web3');

const getWeb3Latest = () => {
 return new Web3(web3.currentProvider);
};

module.exports = function(deployer, network, accounts) {
  if (network === 'tau1') {
    let masterOfCeremony;
    let poaNetworkConsensusAddress = process.env.POA_NETWORK_CONSENSUS_ADDRESS;
    let poaNetworkConsensus, emissionFunds;
    let proxyStorage, proxyStorageImplAddress;
    let keysManager, keysManagerImplAddress;
    let ballotsStorage, ballotsStorageImplAddress;
    let validatorMetadata, validatorMetadataImplAddress;
    let votingToChangeKeys, votingToChangeKeysImplAddress;
    let votingToChangeMinThreshold, votingToChangeMinThresholdImplAddress;
    let votingToChangeProxyAddress, votingToChangeProxyAddressImplAddress;
    let votingToManageEmissionFunds, votingToManageEmissionFundsImplAddress;
    let rewardByBlock, rewardByBlockImplAddress;

    let oldPoaNetworkConsensus, oldProxyStorage, oldRewardByBlock;

    const neededCollateral = web3.toWei(4500000);
    const minBallotDuration = 600; // 10 min

    console.log('trying');

    if(! process.env.DEPLOY_POA) {
      console.log('check failed');
      throw new Error('This migration runs only with env var DEPLOY_POA set!');
    }

    if(! poaNetworkConsensusAddress) {
      throw new Error('env var POA_NETWORK_CONSENSUS_ADDRESS needs to be set!');
    }

    deployer.then(async function() {
      // instantiates old PoaNetworkConsensus and reads needed data from it
      let validators = [];
      if (poaNetworkConsensusAddress) {
      console.log(`instantiating old PoaNetworkConsensus at ${poaNetworkConsensusAddress}`);
        poaNetworkConsensus = PoaNetworkConsensus.at(poaNetworkConsensusAddress);
        masterOfCeremony = await poaNetworkConsensus.masterOfCeremony.call();
        validators = await poaNetworkConsensus.getValidators.call();
        const mocIndex = validators.indexOf(masterOfCeremony.toLowerCase());
        if (mocIndex > -1) {
          validators.splice(mocIndex, 1);
        }
        oldPoaNetworkConsensus = poaNetworkConsensus;
      }

      // keep only the first 2 validators (+ moc = 3)
      // side effect: consumed "initial keys" are gone (since the KeysManager stays the same)
      poaNetworkConsensus = await PoaNetworkConsensus.new(masterOfCeremony, validators.slice(0, 2), neededCollateral);
      console.log(`created new consensus at ${poaNetworkConsensus.address}`);
      poaNetworkConsensusAddress = poaNetworkConsensus.address;

      // Deploy ProxyStorage (can't update the address of PoaNetworkConsensus in the existing one)
      proxyStorage = await ProxyStorage.new();
	    console.log(`ProxyStorage Logic deployed at ${proxyStorage.address}`);
      proxyStorageImplAddress = proxyStorage.address;
      proxyStorage = await EternalStorageProxy.new(
        "0x0000000000000000000000000000000000000000",
        proxyStorageImplAddress
      );
	    console.log(`ProxyStorage Data deployed at ${proxyStorage.address}`);
      proxyStorage = ProxyStorage.at(proxyStorage.address);
      await proxyStorage.init(poaNetworkConsensusAddress);
      await poaNetworkConsensus.setProxyStorage(proxyStorage.address);

      // ***********************************************
      // re-deploying all contracts using EternalStorage
      // ***********************************************

      // Deploy KeysManager
      keysManager = await KeysManager.new();
      keysManagerImplAddress = keysManager.address;
      keysManager = await EternalStorageProxy.new(
        proxyStorage.address,
        keysManagerImplAddress
      );
      keysManager = KeysManager.at(keysManager.address);
      await keysManager.init(previousKeysManager);

      // Deploy BallotsStorage
      ballotsStorage = await BallotsStorage.new();
      ballotsStorageImplAddress = ballotsStorage.address;
      ballotsStorage = await EternalStorageProxy.new(
        proxyStorage.address,
        ballotsStorageImplAddress
      );
      ballotsStorage = BallotsStorage.at(ballotsStorage.address);
      // params: threshold_keys, threshold_metadata_change
      await ballotsStorage.init([2, 2]);

      // Deploy ValidatorMetadata
      validatorMetadata = await ValidatorMetadata.new();
      validatorMetadataImplAddress = validatorMetadata.address;
      validatorMetadata = await EternalStorageProxy.new(
        proxyStorage.address,
        validatorMetadataImplAddress
      );
      validatorMetadata = ValidatorMetadata.at(validatorMetadata.address);

      // Deploy VotingToChangeKeys
      votingToChangeKeys = await VotingToChangeKeys.new();
      votingToChangeKeysImplAddress = votingToChangeKeys.address;
      votingToChangeKeys = await EternalStorageProxy.new(
        proxyStorage.address,
        votingToChangeKeysImplAddress
      );
      votingToChangeKeys = VotingToChangeKeys.at(votingToChangeKeys.address);
      await votingToChangeKeys.init(minBallotDuration);
      await votingToChangeKeys.migrateDisable();

      // Deploy VotingToChangeMinThreshold
      votingToChangeMinThreshold = await VotingToChangeMinThreshold.new();
      votingToChangeMinThresholdImplAddress = votingToChangeMinThreshold.address;
      votingToChangeMinThreshold = await EternalStorageProxy.new(
        proxyStorage.address,
        votingToChangeMinThresholdImplAddress
      );
      votingToChangeMinThreshold = VotingToChangeMinThreshold.at(
        votingToChangeMinThreshold.address
      );
      await votingToChangeMinThreshold.init(2);
      await votingToChangeMinThreshold.migrateDisable();

      // Deploy VotingToChangeProxyAddress
      votingToChangeProxyAddress = await VotingToChangeProxyAddress.new();
      votingToChangeProxyAddressImplAddress = votingToChangeProxyAddress.address;
      votingToChangeProxyAddress = await EternalStorageProxy.new(
        proxyStorage.address,
        votingToChangeProxyAddressImplAddress
      );
      votingToChangeProxyAddress = VotingToChangeProxyAddress.at(
        votingToChangeProxyAddress.address
      );
      await votingToChangeProxyAddress.init(minBallotDuration);
      await votingToChangeProxyAddress.migrateDisable();

      // Deploy VotingToManageEmissionFunds
      votingToManageEmissionFunds = await VotingToManageEmissionFunds.new();
      votingToManageEmissionFundsImplAddress = votingToManageEmissionFunds.address;
      votingToManageEmissionFunds = await EternalStorageProxy.new(
        proxyStorage.address,
        votingToManageEmissionFundsImplAddress
      );
      votingToManageEmissionFunds = VotingToManageEmissionFunds.at(
        votingToManageEmissionFunds.address
      );

      // Deploy EmissionFunds
      emissionFunds = await EmissionFunds.new(votingToManageEmissionFunds.address);

      // Deploy RewardByBlock
      const contractsFolder = 'contracts/';
      let rewardByBlockCode = fs.readFileSync(`${contractsFolder}RewardByBlock.sol`).toString();
      rewardByBlockCode = rewardByBlockCode.replace('emissionFunds = 0x0000000000000000000000000000000000000000', `emissionFunds = ${emissionFunds.address}`);
      const rewardByBlockCompiled = await compileContract(contractsFolder, 'RewardByBlock', rewardByBlockCode);
      const rewardByBlockBytecode = `0x${rewardByBlockCompiled.bytecode}`;
      const rewardByBlockGasEstimate = web3.eth.estimateGas({data: rewardByBlockBytecode});
      const rewardByBlockImpl = web3.eth.contract(rewardByBlockCompiled.abi);
      const rewardByBlockImplAddress = await getRewardByBlockAddress(rewardByBlockBytecode, rewardByBlockCompiled.abi, rewardByBlockGasEstimate)
      if (!rewardByBlockImplAddress) {
        throw new Error('Cannot deploy RewardByBlock');
      }
      rewardByBlock = await EternalStorageProxy.new(
        proxyStorage.address,
        rewardByBlockImplAddress
      );
      const rewardByBlockInstance = rewardByBlockImpl.at(rewardByBlock.address);
      const emissionFundsAddress = await rewardByBlockInstance.emissionFunds.call();

      if (emissionFunds.address != emissionFundsAddress) {
        throw new Error('RewardByBlock.emissionFunds() returns invalid address');
      }

      // Initialize VotingToManageEmissionFunds
      await votingToManageEmissionFunds.init(
        moment.utc().add(10, 'minutes').unix(),
        3600, // emissionReleaseThreshold: 1 hour
        1500, // distributionThreshold: 25 minutes
        emissionFunds.address
      );

      // Initialize ProxyStorage
      await proxyStorage.initializeAddresses(
        keysManager.address,
        votingToChangeKeys.address,
        votingToChangeMinThreshold.address,
        votingToChangeProxyAddress.address,
        votingToManageEmissionFunds.address,
        ballotsStorage.address,
        validatorMetadata.address,
        rewardByBlock.address
      );

      if (!!process.env.SAVE_TO_FILE === true) {
        const contracts = {
          "VOTING_TO_CHANGE_KEYS_ADDRESS": votingToChangeKeys.address,
          "VOTING_TO_CHANGE_MIN_THRESHOLD_ADDRESS": votingToChangeMinThreshold.address,
          "VOTING_TO_CHANGE_PROXY_ADDRESS": votingToChangeProxyAddress.address,
          "VOTING_TO_MANAGE_EMISSION_FUNDS_ADDRESS": votingToManageEmissionFunds.address,
          "BALLOTS_STORAGE_ADDRESS": ballotsStorage.address,
          "KEYS_MANAGER_ADDRESS": keysManager.address,
          "METADATA_ADDRESS": validatorMetadata.address,
          "PROXY_ADDRESS": proxyStorage.address,
          "POA_ADDRESS": poaNetworkConsensusAddress,
          "EMISSION_FUNDS_ADDRESS": emissionFunds.address,
          "REWARD_BY_BLOCK_ADDRESS": rewardByBlock.address,
          "MOC": masterOfCeremony
        };

        fs.writeFileSync('./contracts_4.json', JSON.stringify(contracts, null, 2));
      }

      console.log(
        '\nDone. ADDRESSES:',
        `
  VotingToChangeKeys.address (implementation) ........ ${votingToChangeKeysImplAddress}
  VotingToChangeKeys.address (storage) ............... ${votingToChangeKeys.address}
  VotingToChangeMinThreshold.address (implementation). ${votingToChangeMinThresholdImplAddress}
  VotingToChangeMinThreshold.address (storage) ....... ${votingToChangeMinThreshold.address}
  VotingToChangeProxyAddress.address (implementation). ${votingToChangeProxyAddressImplAddress}
  VotingToChangeProxyAddress.address (storage) ....... ${votingToChangeProxyAddress.address}
  VotingToManageEmissionFunds.address (implementation) ${votingToManageEmissionFundsImplAddress}
  VotingToManageEmissionFunds.address (storage) ...... ${votingToManageEmissionFunds.address}
  BallotsStorage.address (implementation) ............ ${ballotsStorageImplAddress}
  BallotsStorage.address (storage) ................... ${ballotsStorage.address}
  KeysManager.address (implementation) ............... ${keysManagerImplAddress}
  KeysManager.address (storage) ...................... ${keysManager.address}
  ValidatorMetadata.address (implementation) ......... ${validatorMetadataImplAddress}
  ValidatorMetadata.address (storage) ................ ${validatorMetadata.address}
  ProxyStorage.address (implementation) .............. ${proxyStorageImplAddress}
  ProxyStorage.address (storage) ..................... ${proxyStorage.address}
  PoaNetworkConsensus.address ........................ ${poaNetworkConsensusAddress}
  EmissionFunds.address .............................. ${emissionFunds.address}
  RewardByBlock.address (implementation) ............. ${rewardByBlockImplAddress}
  RewardByBlock.address (storage) .................... ${rewardByBlock.address}
        `
      )
    }).catch(function(error) {
      console.error(error);
    });
  }
};

function getRewardByBlockAddress(bytecode, abi, estimatedGas) {
  return new Promise((resolve, reject) => {
    const deployOpts = {
      data: bytecode,
    };
    const sendOpts = {
      from: web3.eth.coinbase,
      gas: estimatedGas
    };
    const web3Latest = getWeb3Latest();
    const contractInstance = new web3Latest.eth.Contract(abi);
    const deploy = contractInstance.deploy(deployOpts);
    deploy.send(sendOpts)
    .on('receipt', async (receipt) => {
      resolve(receipt.contractAddress);
    })
    .on('error', async (err) => {
      console.log(err);
      reject(err);
    });
  });
}

async function compileContract(dir, contractName, contractCode) {
  const compiled = solc.compile({
    sources: {
      '': (contractCode || fs.readFileSync(`${dir}${contractName}.sol`).toString())
    }
  }, 1, function (path) {
    let content;
    try {
      content = fs.readFileSync(`${dir}${path}`);
    } catch (e) {
      if (e.code == 'ENOENT') {
        content = fs.readFileSync(`${dir}../${path}`);
      }
    }
    return {
      contents: content.toString()
    }
  });
  const compiledContract = compiled.contracts[`:${contractName}`];
  const abi = JSON.parse(compiledContract.interface);
  const bytecode = compiledContract.bytecode;
  return {abi, bytecode};
}
