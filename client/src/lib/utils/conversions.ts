export function computeLowHighBits(value: bigint) {
	const mask = 2n ** 128n - 1n;
	const low = `0x${(value & mask).toString(16)}`;
	const high = `0x${((value >> 128n) & mask).toString(16)}`;
	return [low, high];
}
