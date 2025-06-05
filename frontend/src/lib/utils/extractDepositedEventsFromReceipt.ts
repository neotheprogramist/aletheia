/**
 * Given a StarkNet transaction‐receipt object (typed as `any` here),
 * find all `Deposited` events with a particular token address and return
 * an array of `{ token: string, amount: bigint }`.
 *
 * This version compares token addresses as BigInt so that
 * “0x049…” and “0x49…” are treated identically.
 */
export function extractDepositedEventsFromReceipt(
	receipt: any,
	depositedSelector: string,
	tokenAddressFilter: string
): Array<{ token: string; amount: bigint }> {
	if (!receipt.events || !Array.isArray(receipt.events)) {
		throw new Error('Receipt has no `events` array');
	}

	// Pre‐compute the filter address as a BigInt (automatically ignores leading zeros)
	const filterAddrBI = BigInt(tokenAddressFilter);

	return receipt.events
		.filter((ev: any) => {
			// 1) First key must be the Deposited selector
			if (!Array.isArray(ev.keys) || ev.keys[0] !== depositedSelector) {
				return false;
			}

			// 2) Compare second key (event token) to filterAddrBI as BigInt
			//    This handles “0x049…” vs “0x49…” equivalently.
			try {
				const eventTokenBI = BigInt(ev.keys[1]);
				return eventTokenBI === filterAddrBI;
			} catch {
				return false;
			}
		})
		.map((ev: any) => {
			// ev.data = [ low128_felt, high128_felt ]
			const low128 = BigInt(ev.data[0]);
			const high128 = BigInt(ev.data[1]);

			// reconstruct full u256: (high128 << 128) | low128
			const amount = (high128 << 128n) | low128;

			return {
				// Return the raw “keys[1]” string so you still know how it was emitted
				token: ev.keys[1],
				amount
			};
		});
}
