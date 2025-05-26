// Merkle store wrappers

import type { MerkleLeaf } from '$lib/merkle/hybridMerkleTree';
import { withStore } from './index';

/** Add or overwrite a leaf by its index */
export function addLeaf(leaf: MerkleLeaf) {
	return withStore('merkle_leaves', 'readwrite', (store) => store.put(leaf));
}

/** Get all leaves sorted by index */
export function getAllLeaves() {
	return withStore<MerkleLeaf[]>('merkle_leaves', 'readonly', (store) => store.getAll()).then(
		(arr) => arr.sort((a, b) => a.index - b.index)
	);
}

/** Delete a leaf by its index */
export function deleteLeafByIndex(index: number) {
	return withStore('merkle_leaves', 'readwrite', (store) => store.delete(index));
}
