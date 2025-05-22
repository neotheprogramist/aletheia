export function toLowHigh(value: bigint) {
	const mask = 2n ** 128n - 1n;
	const low = `0x${(value & mask).toString(16)}`;
	const high = `0x${((value >> 128n) & mask).toString(16)}`;
	return [low, high];
}

export function fromLowHigh(low: string | bigint, high: string | bigint) {
	const lo = typeof low === 'string' ? BigInt(low) : low;
	const hi = typeof high === 'string' ? BigInt(high) : high;
	return (hi << 128n) | lo;
}

export function fromLowHighHex(low: string, high: string, padding = true) {
	const combined = fromLowHigh(low, high);
	return padding ? `0x${combined.toString(16).padStart(64, '0')}` : `0x${combined.toString(16)}`;
}
