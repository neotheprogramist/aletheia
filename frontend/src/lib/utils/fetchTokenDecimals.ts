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
