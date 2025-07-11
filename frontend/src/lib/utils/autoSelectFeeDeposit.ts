import { fetchExtensionFee, fetchMergeFee, fetchTransferFee } from './fetchFeeForExtension';
import { getDisplayDepositsForToken } from './loadDepositsForToken';
import { supportedTokens } from '$lib/config/tokens';
import { fromWei } from './toWei';
import type { DisplayOperation } from './loadDepositsForToken';

export interface FeeInfo {
	amount: bigint;
	formatted: string;
	symbol: string;
}

export interface AutoSelectedFee {
	feeInfo: FeeInfo;
	feeDeposit: DisplayOperation | null;
	hasEnoughBalance: boolean;
	availableStrkDeposits: DisplayOperation[];
}

// Get STRK token address (always first in supportedTokens)
const STRK_ADDRESS = supportedTokens[0].address;

/**
 * Automatically selects the optimal STRK deposit for fee payment
 */
export async function autoSelectFeeDeposit(
	requiredFee: bigint,
	excludeDeposits: DisplayOperation[] = []
): Promise<DisplayOperation | null> {
	// Load all confirmed STRK deposits
	const strkDeposits = await getDisplayDepositsForToken(STRK_ADDRESS);
	if (!strkDeposits || strkDeposits.length === 0) return null;

	// Filter out excluded deposits and insufficient amounts
	const excludeHashes = new Set(excludeDeposits.map(d => d.hash));
	const availableDeposits = strkDeposits
		.filter(d => !excludeHashes.has(d.hash))
		.filter(d => BigInt(d.data.amount) >= requiredFee);

	if (availableDeposits.length === 0) return null;

	// Find the deposit with the smallest amount that still covers the fee
	// This minimizes "change" and preserves larger deposits for future use
	return availableDeposits.reduce((best, current) => {
		const bestAmount = BigInt(best.data.amount);
		const currentAmount = BigInt(current.data.amount);
		
		// Prefer the deposit with the smallest amount that covers the fee
		return currentAmount < bestAmount ? current : best;
	});
}

/**
 * Preload fee information for different operation types
 */
export async function preloadFeeInfo(
	operationType: 'withdraw' | 'swap' | 'transfer' | 'merge',
	poolsContract: string,
	extensionAddress?: string
): Promise<FeeInfo> {
	let feeAmount: bigint;

	switch (operationType) {
		case 'withdraw':
		case 'swap':
			if (!extensionAddress) {
				throw new Error(`Extension address required for ${operationType}`);
			}
			feeAmount = await fetchExtensionFee(poolsContract, extensionAddress);
			break;
		case 'transfer':
			feeAmount = await fetchTransferFee(poolsContract);
			break;
		case 'merge':
			feeAmount = await fetchMergeFee(poolsContract);
			break;
		default:
			throw new Error(`Unsupported operation type: ${operationType}`);
	}

	return {
		amount: feeAmount,
		formatted: fromWei(feeAmount, 18), // STRK has 18 decimals
		symbol: 'STRK'
	};
}

/**
 * Complete auto-selection process: get fee info and select optimal deposit
 */
export async function autoSelectCompleteProcess(
	operationType: 'withdraw' | 'swap' | 'transfer' | 'merge',
	poolsContract: string,
	extensionAddress?: string,
	excludeDeposits: DisplayOperation[] = []
): Promise<AutoSelectedFee> {
	// Get fee information
	const feeInfo = await preloadFeeInfo(operationType, poolsContract, extensionAddress);
	
	// Get all available STRK deposits
	const availableStrkDeposits = await getDisplayDepositsForToken(STRK_ADDRESS) || [];
	
	// Auto-select the best fee deposit
	const feeDeposit = await autoSelectFeeDeposit(feeInfo.amount, excludeDeposits);
	
	// Check if we have enough balance
	const totalStrkBalance = availableStrkDeposits
		.filter(d => !excludeDeposits.some(ex => ex.hash === d.hash))
		.reduce((sum, d) => sum + BigInt(d.data.amount), 0n);
	
	return {
		feeInfo,
		feeDeposit,
		hasEnoughBalance: totalStrkBalance >= feeInfo.amount,
		availableStrkDeposits
	};
}

/**
 * Check if user has enough STRK balance for fee
 */
export async function checkStrkBalance(
	requiredFee: bigint,
	excludeDeposits: DisplayOperation[] = []
): Promise<boolean> {
	const strkDeposits = await getDisplayDepositsForToken(STRK_ADDRESS);
	if (!strkDeposits || strkDeposits.length === 0) return false;

	const excludeHashes = new Set(excludeDeposits.map(d => d.hash));
	const totalBalance = strkDeposits
		.filter(d => !excludeHashes.has(d.hash))
		.reduce((sum, d) => sum + BigInt(d.data.amount), 0n);

	return totalBalance >= requiredFee;
}