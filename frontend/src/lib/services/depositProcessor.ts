import { blockUpdates } from '$lib/services/blockFetcher';
import {
	db_add_leaf,
	delete_latest_db_block_number,
	get_all_leafs,
	get_latest_db_block_number
} from '$lib/db/merkle';
import { get } from 'svelte/store';
import { zkLibraries } from '$lib/stores/zkLibraries';
import { HybridMerkleTree } from '$lib/merkle/hybridMerkleTree';
import { getDepositsFromRange } from '$lib/starknet/client';
import { getAllByStatus, updateOperation } from '$lib/db/operationsDb';
import { confirmOperation } from '$lib/privacy/confirmOperation';
import { refreshOperations } from '$lib/stores/operations';

export let merkleTree: HybridMerkleTree;
let initialized = false;
const MERKLE_HEIGHT = 32;

/**
 * Initializes the Merkle tree from stored IndexedDB leafs.
 */
export async function initMerkleTree() {
	const { garaga } = get(zkLibraries);
	if (!garaga) throw new Error('Garaga not loaded');
	const leafs = await get_all_leafs();
	const values = leafs.map((l) => BigInt(l.hash));
	merkleTree = new HybridMerkleTree(MERKLE_HEIGHT, values);
	initialized = true;
}

/**
 * Starts listening to new blocks and processes deposits.
 */
export function startDepositProcessor() {
	console.log('[depositProcessor] 🚀 Starting deposit processor...');
	
	blockUpdates.subscribe(async (update) => {
		if (!initialized || !update) return;

		try {
			console.log(`[depositProcessor] 📦 Processing block ${update.blockNumber}...`);
			const toBlock = update.blockNumber;
			const fromBlock = await get_latest_db_block_number();

			if (toBlock <= fromBlock) {
				console.log(`[depositProcessor] ⏭️ Block ${toBlock} already processed (fromBlock: ${fromBlock})`);
				return;
			}

			// Fetch deposits from fromBlock+1 to toBlock (exclusive start, inclusive end)
			const deposits = await getDepositsFromRange(fromBlock + 1, toBlock);
			console.log(`[depositProcessor] 💰 Found ${deposits.length} deposits in block range ${fromBlock + 1}-${toBlock}`);
			
			// Process deposits in block order to ensure no gaps
			const depositsByBlock = new Map<number, typeof deposits>();
			for (const deposit of deposits) {
				const blockNum = deposit.block_number;
				if (!depositsByBlock.has(blockNum)) {
					depositsByBlock.set(blockNum, []);
				}
				depositsByBlock.get(blockNum)!.push(deposit);
			}
			
			// Only process blocks that we actually have data for
			// This prevents gaps if API didn't return all blocks
			const processedBlocks = Array.from(depositsByBlock.keys()).sort((a, b) => a - b);
			let lastProcessedBlock = fromBlock;
			
			for (const blockNum of processedBlocks) {
				// Check for gaps - if there's a gap, stop processing to avoid inconsistency
				if (blockNum !== lastProcessedBlock + 1 && lastProcessedBlock !== fromBlock) {
					console.warn(`[depositProcessor] ⚠️ Gap detected: expected block ${lastProcessedBlock + 1}, got ${blockNum}. Stopping processing.`);
					break;
				}
				
				const blockDeposits = depositsByBlock.get(blockNum)!;
				for (const { hash, block_number } of blockDeposits) {
					await db_add_leaf(hash, block_number);
					merkleTree.addLeaf(BigInt(hash));
				}
				lastProcessedBlock = blockNum;
			}

			const pendingOps = await getAllByStatus('pending');
			console.log(`[depositProcessor] ⏳ Checking ${pendingOps.length} pending operations...`);

			const leafs = await get_all_leafs();
			const leafHashSet = new Set(leafs.map((l) => BigInt(l.hash)));

			let hasConfirmedOps = false;
			for (const op of pendingOps) {
				if (op.commitment && leafHashSet.has(BigInt(op.commitment))) {
					console.log(`[depositProcessor] ✅ Auto-confirming pending op ${op.hash} (commitment ${op.commitment})`);
					await confirmOperation(op.hash);
					hasConfirmedOps = true;
				}
			}
			
			// Refresh operations store if any operations were confirmed
			if (hasConfirmedOps) {
				console.log(`[depositProcessor] 🔄 Refreshing operations store...`);
				await refreshOperations();
			}
		} catch (err) {
			console.error('[depositProcessor] ❌ Error in depositProcessor:', err);
		}
	});
}
