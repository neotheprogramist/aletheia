// Operations store wrappers

import type { Operation } from './operationsTypes';
import { withStore } from './index';

/** Add a new operation */
export function addOperation(op: Operation) {
	return withStore('operations', 'readwrite', (store) => store.add(op));
}

/** Get all operations by status */
export function getAllByStatus(status: Operation['status']) {
	return withStore<Operation[]>('operations', 'readonly', (store) =>
		store.index('status').getAll(status)
	);
}

/** Fetch one operation by its hash key */
export function getOperationByHash(hash: string) {
	return withStore<Operation | undefined>('operations', 'readonly', (store) => store.get(hash));
}

/** Update or overwrite an operation */
export function updateOperation(op: Operation) {
	return withStore('operations', 'readwrite', (store) => store.put(op));
}

/** Delete an operation by its hash key */
export function deleteOperation(hash: string) {
	return withStore('operations', 'readwrite', (store) => store.delete(hash));
}

/** Clear all operations (for tests) */
export function clearAllOperations() {
	return withStore('operations', 'readwrite', (store) => store.clear());
}
