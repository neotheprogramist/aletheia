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
	let heartbeatInterval: NodeJS.Timeout | null = null;

	// WebSocket connection setup
	async function setupWebSocket() {
		if (!active) return;

		try {
			// Get WebSocket URL from provider
			const wsUrl = rpc.channel.nodeUrl.replace('http', 'ws');

			ws = new WebSocket(wsUrl);

			ws.onopen = async () => {
				console.log('[blockFetcher] ✅ WebSocket connected, subscribing to new blocks...');
				// Subscribe to new block headers
				const subscribeMessage = {
					jsonrpc: '2.0',
					method: 'starknet_subscribeNewHeads',
					params: [],
					id: 1
				};

				ws?.send(JSON.stringify(subscribeMessage));
				
				// Start heartbeat to monitor connection
				heartbeatInterval = setInterval(() => {
					if (ws?.readyState === WebSocket.OPEN) {
						console.log('[blockFetcher] 💓 WebSocket heartbeat - connection alive');
					} else {
						console.log(`[blockFetcher] 💔 WebSocket heartbeat - connection dead (state: ${ws?.readyState})`);
					}
				}, 30000); // Every 30 seconds
			};

			ws.onmessage = async (event) => {
				try {
					const data = JSON.parse(event.data);
					console.log(`[blockFetcher] 📨 WebSocket message received:`, data);

					if (data.id === 1 && data.result) {
						subscriptionId = data.result;
						console.log(`[blockFetcher] 📡 Subscribed to new blocks with ID: ${subscriptionId}`);
					} else if (data.method === 'starknet_subscriptionNewHeads' && data.params) {
						const blockHeader = data.params.result;
						console.log(`[blockFetcher] 🔍 Block header received:`, blockHeader);

						if (blockHeader) {
							const blockNumber = parseInt(blockHeader.block_number, 16);
							const timestamp = parseInt(blockHeader.timestamp, 16);
							console.log(`[blockFetcher] 🔔 Got block number ${blockNumber}, timestamp ${timestamp}`);

							// Only emit if this is a newer block than what we've already emitted
							if (blockNumber > lastEmittedBlock) {
								const update: BlockUpdate = {
									blockNumber,
									timestamp
								};

								lastEmittedBlock = blockNumber;
								console.log(`[blockFetcher] ⬆️ New block emitted: ${blockNumber} (prev: ${lastEmittedBlock > 0 ? lastEmittedBlock - 1 : 'none'})`);
								set(update);
							} else {
								console.log(`[blockFetcher] ⏭️ Block ${blockNumber} already processed (lastEmitted: ${lastEmittedBlock})`);
							}
						}
					} else {
						console.log(`[blockFetcher] 🤷 Unknown message type:`, data);
					}
				} catch (err) {
					console.error('[blockFetcher] ❌ WebSocket message parsing error:', err);
					console.error('[blockFetcher] Raw message:', event.data);
				}
			};

			ws.onclose = (event) => {
				console.log(`[blockFetcher] 🔌 WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
				if (heartbeatInterval) {
					clearInterval(heartbeatInterval);
					heartbeatInterval = null;
				}
				if (active) {
					const reconnectDelay = event.code === 1000 ? 1000 : 5000; // Normal close vs error
					console.log(`[blockFetcher] 🔄 Reconnecting in ${reconnectDelay}ms...`);
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
			console.log('[blockFetcher] 🚀 Initializing block fetcher...');
			const current = await rpc.getBlockNumber();

			const block = await rpc.getBlock(current);

			const initialUpdate = {
				blockNumber: current,
				timestamp: Number(block.timestamp)
			};

			lastEmittedBlock = current;
			console.log(`[blockFetcher] 📦 Initial block loaded: ${current}`);
			set(initialUpdate);

			setupWebSocket();
		} catch (err) {
			console.error('[blockFetcher] ❌ Initialization error:', err);
		}
	})();

	// Cleanup WebSocket when the store is no longer subscribed
	return () => {
		console.log('[blockFetcher] 🧹 Cleaning up WebSocket connection...');
		active = false;
		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
			heartbeatInterval = null;
		}
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
