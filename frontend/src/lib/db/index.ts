// Central IndexedDB setup + generic transaction helper

const DB_NAME = 'privacy-pools-data';
const DB_VERSION = 6;

// Our two stores
export type StoreName = 'merkle_leaves' | 'operations';

/**
 * Opens (and upgrades) the DB, ensuring both stores exist.
 */
export function openDB() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onerror = () => reject(req.error);
		req.onsuccess = () => resolve(req.result);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains('merkle_leaves')) {
				const s = db.createObjectStore('merkle_leaves', { keyPath: 'index' });
				s.createIndex('by_block_number', 'block_number', { unique: false });
			}
			if (!db.objectStoreNames.contains('operations')) {
				const s = db.createObjectStore('operations', { keyPath: 'hash' });
				s.createIndex('status', 'status', { unique: false });
			}
		};
	});
}

/**
 * Runs a transaction on `storeName` in mode `mode`, then calls your callback.
 */
export async function withStore<T>(
	storeName: StoreName,
	mode: IDBTransactionMode,
	callback: (store: IDBObjectStore) => IDBRequest<T>
) {
	const db = await openDB();
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(storeName, mode);
		const store = tx.objectStore(storeName);
		const req = callback(store);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
