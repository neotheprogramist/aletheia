import { get, readable } from 'svelte/store';
import { provider } from '$lib/stores/provider';

export interface BlockUpdate {
	blockNumber: number;
	timestamp: number;
}

// A readable store that emits only the latest block update via WebSocket
export const blockUpdates = readable<BlockUpdate | null>(null, (set) => {
	const rpc = get(provider);

	let subscriptionId: string | null = null;
	let active = true;
	let ws: WebSocket | null = null;
	let lastEmittedBlock = -1;

	// WebSocket connection setup
	async function setupWebSocket() {
		if (!active) return;

		try {
			// Get WebSocket URL from provider
			const wsUrl = rpc.channel.nodeUrl.replace('http', 'ws');

			ws = new WebSocket(wsUrl);

			ws.onopen = async () => {
				// Subscribe to new block headers
				const subscribeMessage = {
					jsonrpc: '2.0',
					method: 'starknet_subscribeNewHeads',
					params: [],
					id: 1
				};

				ws?.send(JSON.stringify(subscribeMessage));
			};

			ws.onmessage = async (event) => {
				try {
					const data = JSON.parse(event.data);

					if (data.id === 1 && data.result) {
						subscriptionId = data.result;
					} else if (data.method === 'starknet_subscription' && data.params) {
						const blockHeader = data.params.result;

						if (blockHeader) {
							const blockNumber = parseInt(blockHeader.block_number, 16);
							const timestamp = parseInt(blockHeader.timestamp, 16);

							// Only emit if this is a newer block than what we've already emitted
							if (blockNumber > lastEmittedBlock) {
								const update: BlockUpdate = {
									blockNumber,
									timestamp
								};

								lastEmittedBlock = blockNumber;
								set(update);
							} else {
							}
						}
					}
				} catch (err) {
					console.error('[blockFetcher] ❌ WebSocket message parsing error:', err);
					console.error('[blockFetcher] Raw message:', event.data);
				}
			};

			ws.onclose = (event) => {
				if (active) {
					const reconnectDelay = event.code === 1000 ? 1000 : 5000; // Normal close vs error

					setTimeout(setupWebSocket, reconnectDelay);
				}
			};

			ws.onerror = (err) => {
				console.error('[blockFetcher] ❌ WebSocket error:', err);
			};
		} catch (err) {
			console.error('[blockFetcher] ❌ WebSocket setup error:', err);
			if (active) {
				setTimeout(setupWebSocket, 5000);
			}
		}
	}

	// Immediately fetch and emit the latest block once on startup, then setup WebSocket
	(async () => {
		try {
			const current = await rpc.getBlockNumber();

			const block = await rpc.getBlock(current);

			const initialUpdate = {
				blockNumber: current,
				timestamp: Number(block.timestamp)
			};

			lastEmittedBlock = current;
			set(initialUpdate);

			setupWebSocket();
		} catch (err) {
			console.error('[blockFetcher] ❌ Initialization error:', err);
		}
	})();

	// Cleanup WebSocket when the store is no longer subscribed
	return () => {
		active = false;
		if (ws && subscriptionId) {
			const unsubscribeMessage = {
				jsonrpc: '2.0',
				method: 'starknet_unsubscribe',
				params: [subscriptionId],
				id: 2
			};
			ws.send(JSON.stringify(unsubscribeMessage));
		}
		if (ws) {
			ws.close();
		}
	};
});
