// src/lib/utils/fetchExtensionFee.ts
import { provider } from '$lib/stores/provider';
import { get } from 'svelte/store';
import { fromLowHigh } from './toLowHigh';

/**
 * Calls `get_fee_for_extension` on the pools contract,
 * which returns [low, high] hex strings, and returns a hex (wei) fee.
 */
export async function fetchExtensionFee(
	poolsContract: string,
	extensionAddress: string
): Promise<bigint> {
	const rpc = get(provider);

	const result = await rpc.callContract(
		{
			contractAddress: poolsContract,
			entrypoint: 'get_fee_for_extension',
			calldata: [extensionAddress]
		},
		'latest'
	);

	if (!result || result.length < 2) {
		throw new Error(`Unexpected fee response: ${result}`);
	}

	const [lowHex, highHex] = result as [string, string];

	return fromLowHigh(lowHex, highHex);
}

export async function fetchMergeFee(poolsContract: string): Promise<bigint> {
	const rpc = get(provider);

	const result = await rpc.callContract(
		{
			contractAddress: poolsContract,
			entrypoint: 'get_fee_for_merge',
			calldata: []
		},
		'latest'
	);

	if (!result || result.length < 1) {
		throw new Error(`Unexpected fee response: ${result}`);
	}

	const [hex] = result as [string, string];

	return BigInt(hex);
}
