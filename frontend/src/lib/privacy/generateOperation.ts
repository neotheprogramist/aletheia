import { get } from 'svelte/store';
import { zkLibraries } from '$lib/stores/zkLibraries';
import type { Operation, OperationStatus } from './types';
import { addOperation, getAllByStatus } from '$lib/db/operationsDb';

export interface GenerateParams {
	/** Any application-specific data to attach */
	data?: Record<string, unknown>;
}

/**
 * Generate a new privacy operation (deposit) using Garaga,
 * store it in IndexedDB under status = 'pending', and return { hash }
 * for on-chain submission.
 */
export async function generateOperation(params: GenerateParams) {
	const { data } = params;

	// Sprawdź czy to jest "pełna" operacja czy placeholder
	const isPlaceholder = !data || !data.tokenAddress || !data.amount;

	// 1 Generate a 256-bit seed
	const seedBytes = crypto.getRandomValues(new Uint8Array(32));
	const seedHex = Array.from(seedBytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	const seed = BigInt(`0x${seedHex}`);

	// 2 Get Garaga instance
	const { garaga } = get(zkLibraries);
	if (!garaga) throw new Error('Garaga not initialized');

	// 3 Count existing ops in all statuses to compute the next index
	const statuses: OperationStatus[] = ['confirmed', 'pending', 'nullified', 'aborted'];
	const counts = await Promise.all(
		statuses.map((s) => getAllByStatus(s).then((ops) => ops.length))
	);
	const index = counts.reduce((sum, n) => sum + n, 0);

	// 4 Compute secret, nullifier & hash
	const secret = garaga.poseidonHashBN254(garaga.poseidonHashBN254(seed, seed), BigInt(index));
	const nullifier = garaga.poseidonHashBN254(secret, secret);
	const hash = garaga.poseidonHashBN254(secret, nullifier);

	// 5 Compute commitment tylko jeśli mamy dane
	let commitment: string | undefined;
	if (!isPlaceholder && data) {
		const preCommitment = garaga.poseidonHashBN254(hash, data.amount as bigint);
		commitment = garaga
			.poseidonHashBN254(preCommitment, BigInt(data.tokenAddress as string))
			.toString();
	}

	// 6 Build the operation record
	const op: Operation = {
		index,
		secret: secret.toString(),
		nullifier: nullifier.toString(),
		hash: hash.toString(),
		commitment, // Could be undefined if placeholder (e.g. while execuyting swap we don't have this data in the beginning)
		data: data || {}, // Empty if no data
		status: 'pending'
	};

	// 7 Persist into IndexedDB
	await addOperation(op);

	// 8 Return the hash so your UI can submit it on-chain
	return { hash: hash.toString() };
}
