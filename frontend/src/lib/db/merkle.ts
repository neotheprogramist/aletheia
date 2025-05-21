import type { MerkleLeaf } from './merkleDb';
import { withMerkleStore } from './merkleDb';

export async function db_add_leaf(hash: string, block_number: number): Promise<void> {
	const all = await get_all_leafs();
	const newIndex = all.length > 0 ? Math.max(...all.map((l) => l.index)) + 1 : 1;

	await withMerkleStore('readwrite', (store) => store.put({ index: newIndex, hash, block_number }));
}

export async function get_latest_db_block_number(): Promise<number> {
	const all = await get_all_leafs();
	if (all.length === 0) return 0;

	const latest = all.reduce((a, b) => (a.block_number > b.block_number ? a : b));
	return latest.block_number;
}

export async function delete_latest_db_block_number(targetBlock: number): Promise<void> {
	const all = await get_all_leafs();
	const leavesToDelete = all.filter((l) => l.block_number === targetBlock);

	await withMerkleStore('readwrite', (store) => {
		for (const leaf of leavesToDelete) {
			store.delete(leaf.index);
		}
		return store.count();
	});
}

export async function get_all_leafs(): Promise<MerkleLeaf[]> {
	return withMerkleStore<MerkleLeaf[]>('readonly', (store) => store.getAll()).then((res) =>
		res.sort((a, b) => a.index - b.index)
	);
}
