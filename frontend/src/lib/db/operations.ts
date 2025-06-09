import type { Operation } from '$lib/privacy/types';
import {
	addOperation,
	clearAllOperations,
	deleteOperation,
	getAllByStatus,
	getOperationByHash,
	updateOperation
} from './operationsDb';

export function addOperationEntry(op: Operation) {
	return addOperation(op);
}

export function listOperationsByStatus(status: Operation['status']) {
	return getAllByStatus(status);
}

export function fetchOperation(hash: string) {
	return getOperationByHash(hash);
}

export function modifyOperation(op: Operation) {
	return updateOperation(op);
}

export function removeOperation(hash: string) {
	return deleteOperation(hash);
}

export function clearOperations() {
	return clearAllOperations();
}

// your getOperationDetails(...) stays the same
/**
 * Fetches an operation by hash and returns details
 *   - secret
 *   - nullifier
 *   - amount
 *   - tokenAddress
 *
 * @param hash - operation hash
 */
export async function getOperationDetails(hash: string) {
	const op = await getOperationByHash(hash);
	if (!op) return undefined;

	const { secret, nullifier } = op;

	if (!op.data) return undefined;
	const { amount, tokenAddress } = op.data as {
		amount: string | bigint;
		tokenAddress: string;
	};

	return {
		secret,
		nullifier,
		amount: amount.toString(),
		tokenAddress
	};
}

export async function getFullOperation(hash: string) {
	const op = await getOperationByHash(hash);
	return op ?? undefined;
}
