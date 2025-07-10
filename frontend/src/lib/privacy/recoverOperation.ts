import { get } from 'svelte/store';
import { zkLibraries } from '$lib/stores/zkLibraries';
import type { Operation } from './types';

export interface RecoverParams {
	/** Master seed/nonce used for generation */
	masterNonce: bigint;
	/** Operation index */
	index: number;
	/** Operation data (amount, tokenAddress) */
	data: {
		amount: bigint;
		tokenAddress: string;
	};
}

/**
 * Recover operation data from master seed and parameters
 * This can be used to regenerate operations for backup/recovery
 */
export function recoverOperation(params: RecoverParams): Operation {
	const { masterNonce, index, data } = params;

	// Get Garaga instance
	const { garaga } = get(zkLibraries);
	if (!garaga) throw new Error('Garaga not initialized');

	// Regenerate secret, nullifier & hash using same algorithm as generateOperation
	const secret = garaga.poseidonHashBN254(BigInt(index), masterNonce);
	const nullifier = garaga.poseidonHashBN254(secret, secret);
	const hash = garaga.poseidonHashBN254(secret, nullifier);

	// Regenerate commitment
	const preCommitment = garaga.poseidonHashBN254(hash, data.amount);
	const commitment = garaga.poseidonHashBN254(preCommitment, BigInt(data.tokenAddress));

	return {
		index,
		secret: secret.toString(),
		nullifier: nullifier.toString(),
		hash: hash.toString(),
		commitment: commitment.toString(),
		data,
		status: 'pending'
	};
}

/**
 * Batch recover multiple operations
 */
export function recoverOperations(masterNonce: bigint, operations: Array<{
	index: number;
	data: { amount: bigint; tokenAddress: string };
}>): Operation[] {
	return operations.map(op => recoverOperation({
		masterNonce,
		index: op.index,
		data: op.data
	}));
}