import { get } from 'svelte/store';
import { zkLibraries } from '$lib/stores/zkLibraries';
import { getAllByStatus, addOperation } from '$lib/db/operations';
import type { Operation, OperationStatus } from './types';

export interface ImportParams {
	/** Secret as decimal string */
	secret: string;
	/** Nullifier as decimal string */
	nullifier: string;
	/** Optional user metadata */
	data?: Record<string, unknown>;
}

/**
 * Import an externally-generated note into pending operations.
 * Computes its hash via Garaga, assigns next sequential index,
 * persists to IndexedDB and returns the hash.
 */
export async function importOperation(params: ImportParams) {
	const { secret, nullifier, data } = params;

	// 1️⃣ Grab initialized Garaga
	const { garaga } = get(zkLibraries);
	if (!garaga) throw new Error('Garaga not initialized');

	// 2️⃣ Compute the unique on-chain hash
	const secretBn = BigInt(secret);
	const nullifierBn = BigInt(nullifier);
	const hash = garaga.poseidonHashBN254(secretBn, nullifierBn).toString();

	// 3️⃣ Compute next index across all statuses
	const statuses: OperationStatus[] = ['confirmed', 'pending', 'nullified', 'aborted'];
	const counts = await Promise.all(
		statuses.map((s) => getAllByStatus(s).then((ops) => ops.length))
	);
	const index = counts.reduce((sum, n) => sum + n, 0);

	// 4️⃣ Build Operation record
	const op: Operation = {
		index,
		secret,
		nullifier,
		hash,
		data,
		status: 'pending'
	};

	// 5️⃣ Persist it
	await addOperation(op);

	return { hash };
}
