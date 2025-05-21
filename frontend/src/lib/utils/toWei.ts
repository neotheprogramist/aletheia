/**
 * Converts human-readable amount string to a BigInt representing the token amount in wei.
 *
 * @param amountStr - the string input like "1.23" or "0,001"
 * @param decimals - how many decimals the token uses (e.g., 18)
 * @returns BigInt value in smallest unit (wei)
 * @throws if invalid input
 */
export function toWei(amountStr: string, decimals: number) {
	if (typeof amountStr !== 'string') {
		throw new Error('Amount must be a string');
	}

	const trimmed = amountStr.trim();
	if (!trimmed) {
		throw new Error('Amount cannot be empty');
	}

	if (!/^\d*([.,]\d*)?$/.test(trimmed)) {
		throw new Error('Invalid amount format');
	}

	const normalized = trimmed.replace(',', '.');
	const [whole, fraction = ''] = normalized.split('.');

	const fractionPadded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
	const raw = whole + fractionPadded;

	if (!/^\d+$/.test(raw)) {
		throw new Error('Invalid numeric value after processing');
	}

	const result = BigInt(raw.replace(/^0+/, '') || '0');
	if (result < 0n) {
		throw new Error('Amount must be positive');
	}

	return result;
}
