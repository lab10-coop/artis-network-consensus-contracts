pragma solidity ^0.4.24;

import "./interfaces/IRewardByBlock.sol";
import "./interfaces/IKeysManager.sol";
import "./interfaces/IProxyStorage.sol";
import "./eternal-storage/EternalStorage.sol";
import "./libs/SafeMath.sol";


contract RewardByBlock is EternalStorage, IRewardByBlock {
    using SafeMath for uint256;

    bytes32 internal constant EXTRA_RECEIVERS = keccak256("extraReceivers");
    bytes32 internal constant PROXY_STORAGE = keccak256("proxyStorage");
    bytes32 internal constant MINTED_TOTALLY = keccak256("mintedTotally");

    bytes32 internal constant BRIDGE_AMOUNT = "bridgeAmount";
    bytes32 internal constant EXTRA_RECEIVER_AMOUNT = "extraReceiverAmount";
    bytes32 internal constant MINTED_FOR_ACCOUNT = "mintedForAccount";
    bytes32 internal constant MINTED_FOR_ACCOUNT_IN_BLOCK = "mintedForAccountInBlock";
    bytes32 internal constant MINTED_IN_BLOCK = "mintedInBlock";
    bytes32 internal constant MINTED_TOTALLY_BY_BRIDGE = "mintedTotallyByBridge";

    bytes32 internal constant BLOCK_REWARD_OVERRIDE = "blockRewardOverride";
    bytes32 internal constant BLOCK_REWARD_OVERRIDE_FOR_ACCOUNT = "blockRewardOverrideForAccount";

    // solhint-disable const-name-snakecase
    // These values must be changed before deploy
    // default block reward - can be overridden
    uint256 public constant blockRewardAmount = 1 ether;
    // only once the emissionFunds is activated. Before it's 0
    uint256 public constant emissionFundsAmount = 1 ether;
    address public constant emissionFunds = 0x0000000000000000000000000000000000000000;
    uint256 public constant bridgesAllowedLength = 3;
    // solhint-enable const-name-snakecase

    event AddedReceiver(uint256 amount, address indexed receiver, address indexed bridge);
    event Rewarded(address[] receivers, uint256[] rewards);

    modifier onlyBridgeContract {
        require(_isBridgeContract(msg.sender));
        _;
    }

    modifier onlyKeysManager() {
        require(msg.sender == getKeysManager());
        _;
    }

    modifier onlySystem {
        require(msg.sender == 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE);
        _;
    }

    function addExtraReceiver(uint256 _amount, address _receiver)
        external
        onlyBridgeContract
    {
        require(_amount != 0);
        require(_receiver != address(0));
        uint256 oldAmount = extraReceiverAmount(_receiver);
        if (oldAmount == 0) {
            _addExtraReceiver(_receiver);
        }
        _setExtraReceiverAmount(oldAmount.add(_amount), _receiver);
        _setBridgeAmount(bridgeAmount(msg.sender).add(_amount), msg.sender);
        emit AddedReceiver(_amount, _receiver, msg.sender);
    }

    /// allows to set the block reward for validators (miners) to a lower amount.
    /// set to 0 in order to disable the override
    function setBlockRewardOverride(uint256 _amount)
        public
        onlyKeysManager
    {
        require(_amount < blockRewardAmount);
        _setBlockRewardOverride(_amount);
    }

    /// allows to set the block reward for a specific validator (miner) to a lower amount
    /// takes precedence over the generic override
    /// set to 0 in order to disable the override
    function setBlockRewardOverrideForAccount(address _account, uint256 _amount)
        public
        onlyKeysManager
    {
        require(_amount < blockRewardAmount);
        _setBlockRewardOverrideForAccount(_account, _amount);
    }


    function reward(address[] benefactors, uint16[] kind)
        external
        onlySystem
        returns (address[], uint256[])
    {
        require(benefactors.length == kind.length);
        require(benefactors.length == 1);
        require(kind[0] == 0);

        address miningKey = benefactors[0];

        if (miningKey == address(0)) {
            // Return empty arrays
            return (new address[](0), new uint256[](0));
        }

        require(_isMiningActive(miningKey));

        uint256 extraLength = extraReceiversLength();

        address[] memory receivers = new address[](extraLength.add(2));
        uint256[] memory rewards = new uint256[](receivers.length);

        receivers[0] = _getPayoutByMining(miningKey);
        rewards[0] = getBlockRewardAmountForAccount(miningKey);
        receivers[1] = emissionFunds;
        rewards[1] = getEmissionFundsAmount();

        uint256 i;
        
        for (i = 0; i < extraLength; i++) {
            address extraAddress = extraReceiverByIndex(i);
            uint256 extraAmount = extraReceiverAmount(extraAddress);
            _setExtraReceiverAmount(0, extraAddress);
            receivers[i.add(2)] = extraAddress;
            rewards[i.add(2)] = extraAmount;
        }

        for (i = 0; i < receivers.length; i++) {
            _setMinted(rewards[i], receivers[i]);
        }

        for (i = 0; i < bridgesAllowedLength; i++) {
            address bridgeAddress = bridgesAllowed()[i];
            uint256 bridgeAmountForBlock = bridgeAmount(bridgeAddress);

            if (bridgeAmountForBlock > 0) {
                _setBridgeAmount(0, bridgeAddress);
                _addMintedTotallyByBridge(bridgeAmountForBlock, bridgeAddress);
            }
        }

        _clearExtraReceivers();

        emit Rewarded(receivers, rewards);
    
        return (receivers, rewards);
    }

    function bridgesAllowed() public pure returns(address[bridgesAllowedLength]) {
        // These values must be changed before deploy
        return([
            address(0x0000000000000000000000000000000000000000),
            address(0x0000000000000000000000000000000000000000),
            address(0x0000000000000000000000000000000000000000)
        ]);
    }

    function emissionFundsActivationTimestamp() public pure returns(uint) {
        return ~uint(0); // never
    }

    function bridgeAmount(address _bridge) public view returns(uint256) {
        return uintStorage[
            keccak256(abi.encode(BRIDGE_AMOUNT, _bridge))
        ];
    }

    function extraReceiverByIndex(uint256 _index) public view returns(address) {
        return addressArrayStorage[EXTRA_RECEIVERS][_index];
    }

    function extraReceiverAmount(address _receiver) public view returns(uint256) {
        return uintStorage[
            keccak256(abi.encode(EXTRA_RECEIVER_AMOUNT, _receiver))
        ];
    }

    function extraReceiversLength() public view returns(uint256) {
        return addressArrayStorage[EXTRA_RECEIVERS].length;
    }

    function mintedForAccount(address _account)
        public
        view
        returns(uint256)
    {
        return uintStorage[
            keccak256(abi.encode(MINTED_FOR_ACCOUNT, _account))
        ];
    }

    function mintedForAccountInBlock(address _account, uint256 _blockNumber)
        public
        view
        returns(uint256)
    {
        return uintStorage[
            keccak256(abi.encode(MINTED_FOR_ACCOUNT_IN_BLOCK, _account, _blockNumber))
        ];
    }

    function mintedInBlock(uint256 _blockNumber) public view returns(uint256) {
        return uintStorage[
            keccak256(abi.encode(MINTED_IN_BLOCK, _blockNumber))
        ];
    }

    function mintedTotally() public view returns(uint256) {
        return uintStorage[MINTED_TOTALLY];
    }

    function mintedTotallyByBridge(address _bridge) public view returns(uint256) {
        return uintStorage[
            keccak256(abi.encode(MINTED_TOTALLY_BY_BRIDGE, _bridge))
        ];
    }

    function proxyStorage() public view returns(address) {
        return addressStorage[PROXY_STORAGE];
    }

    function getKeysManager() public view returns(address) {
        return IProxyStorage(proxyStorage()).getKeysManager();
    }

    /// get the currently active block reward amount for the given account
    function getBlockRewardAmountForAccount(address _account) public view returns(uint256) {
        uint256 specificOverride = uintStorage[
            keccak256(abi.encode(BLOCK_REWARD_OVERRIDE_FOR_ACCOUNT, _account))
        ];
        if(specificOverride != 0) {
            return specificOverride;
        } else {
            uint256 genericOverride = uintStorage[
                keccak256(abi.encode(BLOCK_REWARD_OVERRIDE))
            ];
            if(genericOverride != 0) {
                return genericOverride;
            }
        }
        return blockRewardAmount;
    }

    /// get the currently active amount for the emissionFunds
    /// returns 0 if not yet active
    function getEmissionFundsAmount() public view returns(uint256) {
        if(block.timestamp >= emissionFundsActivationTimestamp()) {
            return emissionFundsAmount;
        }
        return 0;
    }

    function _addExtraReceiver(address _receiver) private {
        addressArrayStorage[EXTRA_RECEIVERS].push(_receiver);
    }

    function _addMintedTotallyByBridge(uint256 _amount, address _bridge) private {
        bytes32 hash = keccak256(abi.encode(MINTED_TOTALLY_BY_BRIDGE, _bridge));
        uintStorage[hash] = uintStorage[hash].add(_amount);
    }

    function _clearExtraReceivers() private {
        addressArrayStorage[EXTRA_RECEIVERS].length = 0;
    }

    function _getPayoutByMining(address _miningKey)
        private
        view
        returns (address)
    {
        IKeysManager keysManager = IKeysManager(
            IProxyStorage(proxyStorage()).getKeysManager()
        );
        address payoutKey = keysManager.getPayoutByMining(_miningKey);
        return (payoutKey != address(0)) ? payoutKey : _miningKey;
    }

    function _isBridgeContract(address _addr) private pure returns(bool) {
        address[bridgesAllowedLength] memory bridges = bridgesAllowed();
        
        for (uint256 i = 0; i < bridges.length; i++) {
            if (_addr == bridges[i]) {
                return true;
            }
        }

        return false;
    }

    function _isMiningActive(address _miningKey)
        private
        view
        returns (bool)
    {
        IKeysManager keysManager = IKeysManager(
            IProxyStorage(proxyStorage()).getKeysManager()
        );
        return keysManager.isMiningActive(_miningKey);
    }

    function _setBridgeAmount(uint256 _amount, address _bridge) private {
        uintStorage[
            keccak256(abi.encode(BRIDGE_AMOUNT, _bridge))
        ] = _amount;
    }

    function _setExtraReceiverAmount(uint256 _amount, address _receiver) private {
        uintStorage[
            keccak256(abi.encode(EXTRA_RECEIVER_AMOUNT, _receiver))
        ] = _amount;
    }

    function _setMinted(uint256 _amount, address _account) private {
        bytes32 hash;

        hash = keccak256(abi.encode(MINTED_FOR_ACCOUNT_IN_BLOCK, _account, block.number));
        uintStorage[hash] = _amount;

        hash = keccak256(abi.encode(MINTED_FOR_ACCOUNT, _account));
        uintStorage[hash] = uintStorage[hash].add(_amount);

        hash = keccak256(abi.encode(MINTED_IN_BLOCK, block.number));
        uintStorage[hash] = uintStorage[hash].add(_amount);

        hash = MINTED_TOTALLY;
        uintStorage[hash] = uintStorage[hash].add(_amount);
    }

    function _setBlockRewardOverride(uint256 _amount) private {
        if(_amount == 0) {
            delete uintStorage[keccak256(abi.encode(BLOCK_REWARD_OVERRIDE))];
        } else {
            uintStorage[keccak256(abi.encode(BLOCK_REWARD_OVERRIDE))] = _amount;
        }
    }

    function _setBlockRewardOverrideForAccount(address _account, uint256 _amount) private {
        if(_amount == 0) {
            delete uintStorage[keccak256(abi.encode(BLOCK_REWARD_OVERRIDE_FOR_ACCOUNT, _account))];
        } else {
            uintStorage[keccak256(abi.encode(BLOCK_REWARD_OVERRIDE_FOR_ACCOUNT, _account))] = _amount;
        }
    }
}
