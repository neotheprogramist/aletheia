import { writable } from 'svelte/store';
import { RpcProvider, Account } from 'starknet';
import { PUBLIC_NODE_URL, PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS } from '$env/static/public';

const provider = new RpcProvider({ nodeUrl: PUBLIC_NODE_URL });

const PAYMASTER_ADDRESS = PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS;
const PAYMASTER_PRIVATE_KEY = '0x0';

const paymasterAccount = new Account(
	provider,
	PAYMASTER_ADDRESS,
	PAYMASTER_PRIVATE_KEY,
	undefined,
	'0x3'
);

export const paymasterWallet = writable<Account>(paymasterAccount);
