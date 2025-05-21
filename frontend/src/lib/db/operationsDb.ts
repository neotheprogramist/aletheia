const DB_NAME = 'privacy-pools-data';
const STORE_NAME = 'operations';
const DB_VERSION = 3;

/**
 * Opens or upgrades the IndexedDB and returns a database instance.
 */
export function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);

		req.onerror = () => reject(req.error);
		req.onsuccess = () => resolve(req.result);

		// If the store doesn't exist, create it using `hash` as the primary key
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
				store.createIndex('status', 'status', { unique: false });
			}
		};
	});
}

/**
 * Starts a transaction in STORE_NAME and executes the callback on the object store.
 */
export async function withStore<T>(
	mode: IDBTransactionMode,
	callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openDB();
	return await new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, mode);
		const store_1 = tx.objectStore(STORE_NAME);
		const req = callback(store_1);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
