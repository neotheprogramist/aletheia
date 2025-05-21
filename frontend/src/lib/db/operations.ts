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

/** Testing purposes */
export function clearAllOperations() {
	return withStore('readwrite', (store) => store.clear());
}
