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

/**
 * Converts a BigInt value in smallest unit (wei) back to a decimal string.
 *
 * Examples:
 *   fromWei( BigInt("1230000000000000000"), 18 )  → "1.23"
 *   fromWei( BigInt("1000000000000000000"), 18 )  → "1"
 *   fromWei( BigInt("1"), 18 )                   → "0.000000000000000001"
 *
 * @param amountWei - the integer amount in smallest unit (wei)
 * @param decimals   - number of decimals the token uses (e.g. 18)
 * @returns a human‐readable string, with no trailing zeros in the fraction
 */
export function fromWei(amountWei: bigint, decimals: number): string {
	const s = amountWei.toString();
	// Ensure at least (decimals + 1) digits so we always have a whole part
	const padded = s.padStart(decimals + 1, '0');

	// Split into whole and fraction
	const wholePart = padded.slice(0, -decimals);
	let fracPart = padded.slice(-decimals);

	// Trim trailing zeros from fraction
	fracPart = fracPart.replace(/0+$/, '');

	// If no fraction remains, return just the whole part
	if (fracPart === '') {
		return wholePart;
	}

	return `${wholePart}.${fracPart}`;
}
