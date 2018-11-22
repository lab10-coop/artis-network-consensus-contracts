const fs = require('fs');
const solc = require('solc');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("https://core.poa.network"));

main();

async function main() {
	console.log('RewardByBlock compilation...');
	const compiled = solc.compile({
		sources: {
			'': fs.readFileSync('../contracts/RewardByBlock.sol').toString()
		}
	}, 1, function (path) {
		return {contents: fs.readFileSync('../contracts/' + path).toString()}
	});
	const abi = JSON.parse(compiled.contracts[':RewardByBlock'].interface);
	let bytecode = compiled.contracts[':RewardByBlock'].bytecode;
	
	const contract = new web3.eth.Contract(abi);
	const deploy = await contract.deploy({data: '0x' + bytecode, arguments: []});
	bytecode = await deploy.encodeABI();
	
	console.log('RewardByBlock bytecode:');
	console.log('');
	console.log(bytecode);
}

// node blockreward-bytecode.js
