// src/lib/utils/operationsBackup.ts
import { openDB, withStore } from '$lib/db';
import type { Operation } from '$lib/db/operationsTypes';

/**
 * Read every record from the "operations" object store.
 */
async function getAllOperations(): Promise<Operation[]> {
	return withStore<Operation[]>('operations', 'readonly', (store) => store.getAll());
}

/**
 * Overwrite the entire "operations" store with the given array of Operation records.
 * First clears everything, then bulk‐puts each Operation back.
 */
async function overwriteOperations(records: Operation[]): Promise<void> {
	const db = await openDB();

	// 1) Clear the store in a single transaction
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction('operations', 'readwrite');
		const store = tx.objectStore('operations');
		store.clear();
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});

	// 2) Re‐insert all records in a new transaction
	//    We return store.getAll() solely to satisfy the <T> generic;
	//    we disregard its result.
	await withStore<Operation[]>('operations', 'readwrite', (store) => {
		for (const rec of records) {
			store.put(rec);
		}
		return store.getAll();
	});
}

/**
 * Export all operations as a JSON string, converting any BigInt fields into strings.
 */
export async function exportOperations(): Promise<string> {
	// 1) Pull everything
	const ops = await getAllOperations();

	// 2) Build payload
	const payload = {
		metadata: {
			exportedAt: new Date().toISOString()
		},
		operations: ops
	};

	// 3) Use a replacer so that any BigInt value becomes a string
	function replacer(_key: string, value: unknown) {
		if (typeof value === 'bigint') {
			return value.toString();
		}
		return value;
	}

	return JSON.stringify(payload, replacer, 2);
}

/**
 * Import (restore) from a JSON string that was previously created by `exportOperations()`.
 * This will completely replace the "operations" store.
 */
export async function importOperations(jsonString: string): Promise<void> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonString);
	} catch {
		throw new Error('Invalid JSON');
	}

	// Narrow `parsed` down to a record with an `operations` property of unknown type:
	if (typeof parsed !== 'object' || parsed === null || !('operations' in parsed)) {
		throw new Error('JSON does not contain a valid “operations” array');
	}

	const asRecord = parsed as Record<string, unknown>;
	if (!Array.isArray(asRecord.operations)) {
		throw new Error('JSON does not contain a valid “operations” array');
	}

	// We trust that each item in the array conforms to Operation.
	const ops = asRecord.operations as Operation[];
	await overwriteOperations(ops);
}
