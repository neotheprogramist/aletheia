import { provider } from '$lib/stores/provider';
import { get } from 'svelte/store';

export async function fetchTokenDecimals(token: string): Promise<number> {
	const rpc = get(provider);
	const [decimalsRaw] =
		(await rpc.callContract({ contractAddress: token, entrypoint: 'decimals' }, 'latest')) ?? [];

	const decimals = Number(decimalsRaw);
	if (!decimalsRaw || isNaN(decimals)) {
		throw new Error(`Invalid decimals: ${decimalsRaw}`);
	}
	return decimals;
}

export async function fetchTokenSymbol(token: string): Promise<string> {
	const rpc = get(provider);
	const [feltHex] = await rpc.callContract(
		{ contractAddress: token, entrypoint: 'symbol' },
		'latest'
	);

	if (!feltHex || typeof feltHex !== 'string') {
		throw new Error('No symbol result');
	}

	// hex → bytes → ASCII
	const hex = BigInt(feltHex).toString(16);
	const paddedHex = hex.length % 2 === 1 ? '0' + hex : hex;
	const bytes = paddedHex.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? [];
	const symbol = String.fromCharCode(...bytes).replace(/\0/g, '');

	if (!symbol || !/^[a-zA-Z0-9]+$/.test(symbol)) {
		throw new Error(`Invalid symbol: ${symbol}`);
	}

	return symbol;
}
