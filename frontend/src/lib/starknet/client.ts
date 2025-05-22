import {
	PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
	PUBLIC_TORNADO_DEPOSIT_SELECTOR
} from '$env/static/public';
import { provider } from '$lib/stores/provider';
import { fromLowHighHex } from '$lib/utils/toLowHigh';
import { get } from 'svelte/store';

/**
 * Fetches all "Deposit" events emitted by the Tornado contract in a given block range.
 * Logs each raw event for debugging and summary purposes.
 */
export async function getDepositsFromRange(
	from: number,
	to: number
): Promise<{ hash: string; block_number: number }[]> {
	const filter = {
		from_block: { block_number: from },
		to_block: { block_number: to },
		address: PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
		keys: [[PUBLIC_TORNADO_DEPOSIT_SELECTOR]],
		chunk_size: 100
	};

	const events = [];
	let continuation_token: string | undefined;
	const rpc = get(provider);

	do {
		const res = await rpc.getEvents({ ...filter, continuation_token });

		events.push(...res.events);
		continuation_token = res.continuation_token;
	} while (continuation_token);

	const deposits = events.map((ev) => {
		const commitment = fromLowHighHex(ev.data[0], ev.data[1]);

		const block_number = Number(ev.block_number);
		return { hash: commitment, block_number };
	});

	return deposits;
}
