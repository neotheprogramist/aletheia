import { describe, expect, it } from 'vitest';
import { toWei } from './toWei';

describe('toWei', () => {
	it('converts integer string to wei correctly', () => {
		expect(toWei('1', 18)).toBe(BigInt('1000000000000000000'));
		expect(toWei('10', 6)).toBe(BigInt('10000000'));
	});

	it('converts decimal string with dot to wei', () => {
		expect(toWei('1.5', 18)).toBe(BigInt('1500000000000000000'));
		expect(toWei('0.000001', 6)).toBe(BigInt('1'));
		expect(toWei('1.000000000000000001', 18)).toBe(BigInt('1000000000000000001'));
	});

	it('converts decimal string with comma to wei', () => {
		expect(toWei('1,5', 18)).toBe(BigInt('1500000000000000000'));
		expect(toWei('0,000001', 6)).toBe(BigInt('1'));
	});

	it('pads decimals correctly when fraction too short', () => {
		expect(toWei('1.2', 3)).toBe(BigInt('1200'));
		expect(toWei('1.23', 4)).toBe(BigInt('12300'));
	});

	it('truncates decimals when fraction too long', () => {
		expect(toWei('1.23456789', 4)).toBe(BigInt('12345'));
	});

	it('trims leading/trailing whitespace', () => {
		expect(toWei('  1.5 ', 18)).toBe(BigInt('1500000000000000000'));
	});

	it('accepts zero correctly', () => {
		expect(toWei('0', 18)).toBe(BigInt(0));
		expect(toWei('0.0000', 18)).toBe(BigInt(0));
	});

	it('throws on negative values', () => {
		expect(() => toWei('-1.5', 18)).toThrow();
		expect(() => toWei('-0.1', 18)).toThrow();
	});

	it('throws on invalid format', () => {
		expect(() => toWei('abc', 18)).toThrow();
		expect(() => toWei('1..2', 18)).toThrow();
		expect(() => toWei('1,2.3', 18)).toThrow();
		expect(() => toWei('1.2.3', 18)).toThrow();
		expect(() => toWei('', 18)).toThrow();
	});

	it('throws when not string', () => {
		// @ts-expect-error for test purposes
		expect(() => toWei(1.23, 18)).toThrow();
	});

	it('handles input with only decimal separator', () => {
		expect(toWei('.1', 2)).toBe(BigInt('10'));
		expect(toWei(',1', 2)).toBe(BigInt('10'));
		expect(toWei('1.', 2)).toBe(BigInt('100'));
		expect(toWei('1,', 2)).toBe(BigInt('100'));
	});

	it('handles large number input', () => {
		expect(toWei('1000000000.123456', 6)).toBe(BigInt('1000000000123456'));
		expect(toWei('123456789.987654321', 9)).toBe(BigInt('123456789987654321'));
	});

	it('removes leading zeros correctly', () => {
		expect(toWei('00001.000', 3)).toBe(BigInt('1000'));
		expect(toWei('0000.0001', 6)).toBe(BigInt('100'));
	});
});
