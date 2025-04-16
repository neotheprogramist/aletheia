/**
 * Sanitizes a user-provided amount string (with a decimal point) into a displayable string and a corresponding BigInt value.
 * The function supports tokens with any number of decimals (including 0).
 *
 * Process:
 * 1. Remove all non-digit and non-dot characters.
 * 2. If there are multiple dots, treat the first dot as the decimal separator and join the rest.
 * 3. Remove leading zeros unless the number is less than 1 (i.e. it starts with "0.").
 * 4. If the sanitized result is empty, return an empty display and 0.
 * 5. For tokens with 0 decimals, ignore any fractional part.
 * 6. For tokens with decimals > 0, limit the fractional part to up to 4 digits (or to the token's decimals if less than 4).
 * 7. Split the sanitized string into integer and fractional parts.
 * 8. If the integer part is empty, replace it with "0".
 * 9. For BigInt calculation, pad the fractional part to exactly the allowed number of digits.
 * 10. For display:
 *     - If token decimals are less than 4, always pad the fractional part.
 *     - If token decimals are 4 or more, use the original fractional part as provided (without extra padding)
 *       so that inputs like "12.3.45" yield "12.345" rather than "12.3450".
 * 11. Combine the parts and scale the BigInt to the full token precision.
 *
 * @param value The user-provided string.
 * @param decimals The number of decimal places for the token.
 * @returns An object containing the sanitized display string and the corresponding BigInt value.
 */
export function sanitizeAmount(value: string, decimals: number) {
	// Remove all characters except digits and dot
	let sanitized = value.replace(/[^0-9.]/g, '');

	// If there are multiple dots, treat the first as the decimal separator and join the rest
	if ((sanitized.match(/\./g) || []).length > 1) {
		const parts = sanitized.split('.');
		sanitized = parts[0] + '.' + parts.slice(1).join('');
	}

	// Remove leading zeros unless the number is less than 1 (i.e., starts with "0.")
	if (sanitized.startsWith('0') && sanitized.length > 1 && sanitized[1] !== '.') {
		sanitized = sanitized.replace(/^0+/, '');
	}

	// If the sanitized result is empty, return empty display and BigInt(0)
	if (sanitized === '') {
		return { displayValue: '', bigIntValue: BigInt('0') };
	}

	// For tokens with 0 decimals, ignore any fractional part
	if (decimals === 0) {
		sanitized = sanitized.split('.')[0];
		return { displayValue: sanitized, bigIntValue: BigInt(sanitized || '0') };
	}

	// For tokens with decimals > 0, allow a fractional part.
	// Limit the fractional part to up to 4 digits, or to the token's decimals if that is less.
	let parts = sanitized.split('.');
	const allowedFractionDigits = decimals < 4 ? decimals : 4;
	if (parts.length === 2) {
		parts[1] = parts[1].slice(0, allowedFractionDigits);
		sanitized = parts.join('.');
	}

	let [integerPart, fractionalPart = ''] = sanitized.split('.');
	// Ensure the integer part is at least "0"
	if (integerPart === '') {
		integerPart = '0';
	}

	// Save the original fractional part (as provided by the user, after limiting but before padding)
	const originalFractionalPart = fractionalPart;

	// For BigInt calculation, pad the fractional part to exactly allowedFractionDigits digits
	const fractionPadded = fractionalPart
		.padEnd(allowedFractionDigits, '0')
		.slice(0, allowedFractionDigits);
	const fullAmountStr = integerPart + fractionPadded;
	const bigIntValue = BigInt(fullAmountStr) * BigInt(10 ** (decimals - allowedFractionDigits));

	// Determine display value:
	// - If decimals < 4, always pad the fractional part (to exactly 'decimals' digits).
	// - If decimals >= 4, display the fractional part as provided (without extra padding).
	let displayValue;
	if (decimals < 4) {
		displayValue = integerPart + '.' + fractionPadded;
	} else {
		if (sanitized.includes('.')) {
			displayValue =
				integerPart + (originalFractionalPart !== '' ? '.' + originalFractionalPart : '.');
		} else {
			displayValue = integerPart;
		}
	}

	return { displayValue, bigIntValue };
}

/**
 * Called on input events for amount inputs to validate and normalize the input.
 * - Removes any non-digit characters except for a single dot.
 * - If more than one dot is present, combines the parts after the first dot.
 * - Calls the provided updateAmount function with the new value.
 * @param event The input event.
 * @param updateAmount A function that takes the new value of the input.
 */
export function validateAmountInput(event: Event, updateAmount: (value: string) => void) {
	const input = event.target as HTMLInputElement;
	let value = input.value.replace(/[^0-9.]/g, '');
	const parts = value.split('.');

	if (parts.length > 2) {
		value = parts[0] + '.' + parts.slice(1).join('');
	}

	updateAmount(value);
}
