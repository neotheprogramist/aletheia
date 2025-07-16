import { get, writable } from 'svelte/store';
import { Account } from 'starknet';
import { PUBLIC_ALETHEIA_CONTRACT_ADDRESS } from '$env/static/public';
import { provider } from './provider';

const rpc = get(provider);
if (!rpc) throw new Error('No provider');

const PAYMASTER_ADDRESS = PUBLIC_ALETHEIA_CONTRACT_ADDRESS;
const PAYMASTER_PRIVATE_KEY = '0x0';

const paymasterAccount = new Account(
	rpc,
	PAYMASTER_ADDRESS,
	PAYMASTER_PRIVATE_KEY,
	undefined,
	'0x3'
);

export const paymasterWallet = writable<Account>(paymasterAccount);
