import { writable } from 'svelte/store';

// Master seed for deterministic operation generation
export const masterSeed = writable<bigint | null>(null);

// Key for localStorage
const MASTER_SEED_KEY = 'aletheia-master-seed';

/**
 * Generate a new master seed (256-bit random number)
 */
export function generateMasterSeed(): bigint {
	const seedBytes = crypto.getRandomValues(new Uint8Array(32));
	const seedHex = Array.from(seedBytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return BigInt(`0x${seedHex}`);
}

/**
 * Store master seed in localStorage (encrypted in the future)
 */
export function storeMasterSeed(seed: bigint): void {
	localStorage.setItem(MASTER_SEED_KEY, seed.toString());
	masterSeed.set(seed);
}

/**
 * Load master seed from localStorage
 */
export function loadMasterSeed(): bigint | null {
	const stored = localStorage.getItem(MASTER_SEED_KEY);
	if (!stored) return null;
	
	try {
		const seed = BigInt(stored);
		masterSeed.set(seed);
		return seed;
	} catch {
		return null;
	}
}

/**
 * Clear master seed from memory and storage
 */
export function clearMasterSeed(): void {
	localStorage.removeItem(MASTER_SEED_KEY);
	masterSeed.set(null);
}

/**
 * Get or create master seed
 */
export function getOrCreateMasterSeed(): bigint {
	const existing = loadMasterSeed();
	if (existing) return existing;
	
	const newSeed = generateMasterSeed();
	storeMasterSeed(newSeed);
	return newSeed;
}

/**
 * Export master seed as hex string for backup
 */
export function exportMasterSeed(): string | null {
	const seed = loadMasterSeed();
	return seed ? `0x${seed.toString(16)}` : null;
}

/**
 * Import master seed from hex string
 */
export function importMasterSeed(hexString: string): boolean {
	try {
		const seed = BigInt(hexString);
		storeMasterSeed(seed);
		return true;
	} catch {
		return false;
	}
}