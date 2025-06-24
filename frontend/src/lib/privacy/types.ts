/**
 * The four possible states an operation can be in.
 */
export type OperationStatus = 'pending' | 'confirmed' | 'nullified' | 'aborted';

/**
 * A single privacy operation, stored in IndexedDB.
 */
export interface Operation {
	/** Position in the overall operation sequence */
	index: number;

	/** The “secret” value, as a decimal string */
	secret: string;

	/** The nullifier, as a decimal string */
	nullifier: string;

	/** The hash that will be sent on-chain, as a decimal string */
	hash: string;

	/** The commitment of an operation */
	commitment: string | undefined;

	/** Optional user-provided data */
	data?: Record<string, unknown>;

	/** Current status (this is what we index on) */
	status: OperationStatus;
}
