import type { Operation } from '$lib/privacy/types';
import { withStore } from './operationsDb';

export function addOperation(op: Operation) {
	return withStore('readwrite', (store) => store.add(op));
}

export function getAllByStatus(status: Operation['status']) {
	return withStore('readonly', (store) => store.index('status').getAll(status));
}

export function getOperationByHash(hash: string) {
	return withStore<Operation | undefined>('readonly', (store) => store.get(hash));
}

export function updateOperation(op: Operation) {
	return withStore('readwrite', (store) => store.put(op));
}

export function deleteOperation(hash: string) {
	return withStore('readwrite', (store) => store.delete(hash));
}

/**
 * Fetches an operation by hash and returns details
 *   - secret
 *   - nullifier
 *   - amount
 *   - tokenAddress
 *
 * @param hash - operation hash
 */
export async function getOperationDetails(hash: string): Promise<
	| {
			secret: string;
			nullifier: string;
			amount: string;
			tokenAddress: string;
	  }
	| undefined
> {
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

/** Testing purposes */
export function clearAllOperations() {
	return withStore('readwrite', (store) => store.clear());
}
