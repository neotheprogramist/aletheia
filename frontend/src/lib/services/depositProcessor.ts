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
	blockUpdates.subscribe(async (update) => {
		if (!initialized || !update) return;

		try {
			const toBlock = update.blockNumber;
			const fromBlock = await get_latest_db_block_number();

			if (toBlock <= fromBlock) return;

			await delete_latest_db_block_number(fromBlock);

			const deposits = await getDepositsFromRange(fromBlock, toBlock);

			for (const { hash, block_number } of deposits) {
				const pendingOps = await getAllByStatus('pending');
				const matchingOp = pendingOps.find(
					(op) => op.commitment && BigInt(op.commitment) === BigInt(hash)
				);

				if (matchingOp) {
					console.log(`✅ Found matching operation for deposit ${hash}`);
					await confirmOperation(matchingOp.hash);
					console.log(`✅ Confirmed operation ${matchingOp.hash}`);
				}

				await db_add_leaf(hash, block_number);
				merkleTree.addLeaf(BigInt(hash));
			}
		} catch (err) {
			console.error('❌ Error in fetcher:', err);
		}
	});
}
