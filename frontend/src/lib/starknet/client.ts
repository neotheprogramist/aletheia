import {
	PUBLIC_ALETHEIA_CONTRACT_ADDRESS,
	PUBLIC_PRIVACY_LEAF_ADDED_SELECTOR
} from '$env/static/public';
import { provider } from '$lib/stores/provider';
import { fromLowHighHex } from '$lib/utils/toLowHigh';
import { get } from 'svelte/store';

/**
 * Fetches all "Deposit" events emitted by the Privacy Account contract in a given block range.
 * Logs each raw event for debugging and summary purposes.
 */
export async function getDepositsFromRange(from: number, to: number) {
	const filter = {
		from_block: { block_number: from },
		to_block: { block_number: to },
		address: PUBLIC_ALETHEIA_CONTRACT_ADDRESS,
		keys: [[PUBLIC_PRIVACY_LEAF_ADDED_SELECTOR]],
		chunk_size: 100
	};

	const events = [];
	let continuation_token: string | undefined;
	const rpc = get(provider);

	do {
		let retries = 3;
		let res;
		
		while (retries > 0) {
			try {
				res = await rpc.getEvents({ ...filter, continuation_token });
				break;
			} catch (err: any) {
				retries--;
				if (err.code === -32000 || err.message?.includes('503') || err.message?.includes('Unable to complete')) {
					console.warn(`[getDepositsFromRange] ⚠️ RPC error, retries left: ${retries}`, err.message);
					if (retries === 0) throw err;
					await new Promise(resolve => setTimeout(resolve, 1000 * (3 - retries)));
				} else {
					throw err;
				}
			}
		}

		if (res) {
			events.push(...res.events);
			continuation_token = res.continuation_token;
		}
	} while (continuation_token);

	const deposits = events.map((ev) => {
		const commitment = fromLowHighHex(ev.data[0], ev.data[1], false);

		const block_number = Number(ev.block_number);
		return { hash: commitment, block_number };
	});

	return deposits;
}
