import { addLeaf, deleteLeafByIndex, getAllLeaves } from './merkleDb';

export async function db_add_leaf(hash: string, block_number: number) {
	const all = await getAllLeaves();
	const newIndex = all.length > 0 ? Math.max(...all.map((l) => l.index)) + 1 : 1;
	await addLeaf({ index: newIndex, hash, block_number });
}

export async function get_latest_db_block_number() {
	const all = await getAllLeaves();
	if (all.length === 0) return 0;
	return all.reduce((a, b) => (a.block_number > b.block_number ? a : b)).block_number;
}

export async function delete_latest_db_block_number(targetBlock: number) {
	const all = await getAllLeaves();
	for (const leaf of all.filter((l) => l.block_number === targetBlock)) {
		await deleteLeafByIndex(leaf.index);
	}
}

export function get_all_leafs() {
	return getAllLeaves();
}
