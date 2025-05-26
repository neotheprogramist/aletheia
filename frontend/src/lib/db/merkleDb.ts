const DB_NAME = 'privacy-pools-data';
const STORE_NAME = 'merkle_leaves';
const DB_VERSION = 3;

export interface MerkleLeaf {
	index: number;
	hash: string;
	block_number: number;
}

/**
 * Opens or upgrades the IndexedDB and returns a database instance.
 */
export function openMerkleDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);

		req.onerror = () => reject(req.error);
		req.onsuccess = () => resolve(req.result);

		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'index' });
				store.createIndex('by_block_number', 'block_number', { unique: false });
			}
		};
	});
}

export async function withMerkleStore<T>(
	mode: IDBTransactionMode,
	callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openMerkleDB();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, mode);
		const store = tx.objectStore(STORE_NAME);
		const req = callback(store);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
