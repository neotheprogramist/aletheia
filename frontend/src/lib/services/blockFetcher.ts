import { get, readable } from 'svelte/store';
import { provider } from '$lib/stores/provider';

export interface BlockUpdate {
	blockNumber: number;
	timestamp: number;
}

const POLL_INTERVAL = 2_000;

// A readable store that emits only the latest block update
export const blockUpdates = readable<BlockUpdate | null>(null, (set) => {
	const rpc = get(provider);

	let lastSeen = -1;
	let active = true;

	// Polling loop that emits new block if it appears
	async function poll() {
		if (!active) return;

		try {
			const current = await rpc.getBlockNumber();

			if (current > lastSeen) {
				const block = await rpc.getBlock(current);
				const update: BlockUpdate = {
					blockNumber: current,
					timestamp: Number(block.timestamp)
				};
				lastSeen = current;
				set(update);
			}
		} catch (err) {
			console.error('[blockFetcher] polling error:', err);
		}

		setTimeout(poll, POLL_INTERVAL);
	}

	// Immediately fetch and emit the latest block once on startup
	(async () => {
		try {
			lastSeen = await rpc.getBlockNumber();
			const block = await rpc.getBlock(lastSeen);
			set({
				blockNumber: lastSeen,
				timestamp: Number(block.timestamp)
			});
			poll();
		} catch (err) {
			console.error('[blockFetcher] init error:', err);
		}
	})();

	// Stop polling when the store is no longer subscribed
	return () => {
		active = false;
	};
});
