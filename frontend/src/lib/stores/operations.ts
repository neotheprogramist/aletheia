import { writable, derived, get } from 'svelte/store';
import { getAllByStatus } from '$lib/db/operationsDb';
import { loadDisplayDeposits, loadEmptyDisplayDeposits, type DisplayOperation } from '$lib/utils/loadDepositsForToken';
import type { Operation, OperationStatus } from '$lib/privacy/types';

interface OperationsState {
	allOperations: Operation[];
	isLoading: boolean;
	lastUpdated: number;
}

const initialState: OperationsState = {
	allOperations: [],
	isLoading: false,
	lastUpdated: 0
};

export const operationsStore = writable<OperationsState>(initialState);

/**
 * Reactive store for operations filtered by token and status
 */
export function createTokenOperationsStore(tokenAddress: string, status: OperationStatus = 'confirmed') {
	return derived(operationsStore, ($operations) => {
		const filteredOps = $operations.allOperations.filter(op => 
			op.status === status && 
			op.data && 
			typeof op.data === 'object' && 
			'tokenAddress' in op.data &&
			BigInt(op.data.tokenAddress) === BigInt(tokenAddress)
		);
		
		return {
			operations: filteredOps,
			isLoading: $operations.isLoading,
			lastUpdated: $operations.lastUpdated
		};
	});
}

/**
 * Reactive store for display operations (with formatted amounts)
 */
export function createDisplayOperationsStore(tokenAddress: string) {
	const { subscribe, set } = writable({
		deposits: [] as DisplayOperation[],
		isLoading: false,
		lastUpdated: 0
	});

	// Subscribe to operations changes and update display operations
	const unsubscribe = operationsStore.subscribe(async ($operations) => {
		console.log(`[displayOperationsStore] 🔄 Operations changed for token ${tokenAddress}, processing ${$operations.allOperations.length} operations...`);
		
		set({
			deposits: [],
			isLoading: true,
			lastUpdated: $operations.lastUpdated
		});

		try {
			const confirmedOps = $operations.allOperations.filter(op => op.status === 'confirmed');
			console.log(`[displayOperationsStore] ✅ Found ${confirmedOps.length} confirmed operations`);
			
			const displayOps = await loadDisplayDeposits(confirmedOps, tokenAddress);
			console.log(`[displayOperationsStore] 📊 Generated ${displayOps.length} display operations for token ${tokenAddress}`);
			
			set({
				deposits: displayOps,
				isLoading: false,
				lastUpdated: $operations.lastUpdated
			});
		} catch (error) {
			console.error('[displayOperationsStore] ❌ Error loading display operations:', error);
			set({
				deposits: [],
				isLoading: false,
				lastUpdated: $operations.lastUpdated
			});
		}
	});

	return {
		subscribe,
		destroy: unsubscribe
	};
}

/**
 * Load all operations from database and update store
 */
export async function refreshOperations() {
	operationsStore.update(state => ({ ...state, isLoading: true }));
	
	try {
		const [pending, confirmed, nullified, aborted] = await Promise.all([
			getAllByStatus('pending'),
			getAllByStatus('confirmed'),
			getAllByStatus('nullified'),
			getAllByStatus('aborted')
		]);
		
		const allOperations = [...pending, ...confirmed, ...nullified, ...aborted];
		
		operationsStore.update(state => ({
			...state,
			allOperations,
			isLoading: false,
			lastUpdated: Date.now()
		}));
	} catch (error) {
		console.error('Error refreshing operations:', error);
		operationsStore.update(state => ({ ...state, isLoading: false }));
	}
}

/**
 * Add a new operation to the store (optimistic update)
 */
export function addOperation(operation: Operation) {
	operationsStore.update(state => ({
		...state,
		allOperations: [...state.allOperations, operation],
		lastUpdated: Date.now()
	}));
}

/**
 * Update an existing operation in the store (optimistic update)
 */
export function updateOperationInStore(hash: string, updates: Partial<Operation>) {
	console.log(`[operationsStore] 🔄 Updating operation ${hash} with:`, updates);
	operationsStore.update(state => ({
		...state,
		allOperations: state.allOperations.map(op => 
			op.hash === hash ? { ...op, ...updates } : op
		),
		lastUpdated: Date.now()
	}));
}

/**
 * Remove operations with specific hashes from the store (optimistic update)
 */
export function removeOperationsFromStore(hashes: string[]) {
	operationsStore.update(state => ({
		...state,
		allOperations: state.allOperations.filter(op => !hashes.includes(op.hash)),
		lastUpdated: Date.now()
	}));
}

/**
 * Get current operations state
 */
export function getOperationsState() {
	return get(operationsStore);
}

/**
 * Initialize operations store on app start
 */
export function initOperationsStore() {
	return refreshOperations();
}