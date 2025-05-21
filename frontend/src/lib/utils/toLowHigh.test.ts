import { describe, expect, it } from 'vitest';
import { toLowHigh } from './toLowHigh';

describe('toLowHigh', () => {
	it('splits zero into low/high correctly', () => {
		expect(toLowHigh(0n)).toEqual(['0x0', '0x0']);
	});

	it('splits small numbers correctly (below 2^128)', () => {
		expect(toLowHigh(123456789n)).toEqual(['0x75bcd15', '0x0']);
	});

	it('splits exact 2^128 correctly', () => {
		expect(toLowHigh(2n ** 128n)).toEqual(['0x0', '0x1']);
	});

	it('splits number with both low and high bits', () => {
		const value = 2n ** 128n * 3n + 42n; // high = 3, low = 42
		expect(toLowHigh(value)).toEqual(['0x2a', '0x3']);
	});

	it('preserves hex formatting', () => {
		const [low, high] = toLowHigh(BigInt('0xffffffffffffffffffffffffffffffff')); // max 128-bit
		expect(low).toBe('0xffffffffffffffffffffffffffffffff');
		expect(high).toBe('0x0');
	});

	it('splits 2^256 - 1 correctly (max uint256)', () => {
		const maxUint256 = 2n ** 256n - 1n;
		const [low, high] = toLowHigh(maxUint256);
		expect(low).toBe('0xffffffffffffffffffffffffffffffff');
		expect(high).toBe('0xffffffffffffffffffffffffffffffff');
	});

	it('splits 2^128 - 1 correctly (max low)', () => {
		const value = 2n ** 128n - 1n;
		expect(toLowHigh(value)).toEqual(['0xffffffffffffffffffffffffffffffff', '0x0']);
	});

	it('splits 2^128 + 1 correctly', () => {
		const value = 2n ** 128n + 1n;
		expect(toLowHigh(value)).toEqual(['0x1', '0x1']);
	});

	it('splits large number from hex input correctly', () => {
		const value = BigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
		const [low, high] = toLowHigh(value);
		expect(low).toBe('0x1234567890abcdef1234567890abcdef');
		expect(high).toBe('0x1234567890abcdef1234567890abcdef');
	});

	it('always returns hex strings with 0x prefix', () => {
		const [low, high] = toLowHigh(42n);
		expect(low.startsWith('0x')).toBe(true);
		expect(high.startsWith('0x')).toBe(true);
	});
});
