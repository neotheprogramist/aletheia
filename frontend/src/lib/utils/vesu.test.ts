// vesuUtils.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calculateRequiredCollateral } from './vesu';

describe('calculateRequiredCollateral – basic scenarios', () => {
	const DUMMY_POOL_ID = 'dummy-pool';

	// Prepare fake “assets” and “pairs” so that:
	//   BORROW token has USD price = 2 USD
	//   COLL  token has USD price = 1 USD
	//   maxLTV = 0.5 for (BORROW / COLL)
	//
	// Then: borrowing 10 BORROW → debtValueUSD = 10 * 2 = 20 USD
	//       requiredCollateral = 20 / (1 * 0.5) = 40
	const dummyAssets = [
		{
			address: '0xAAA',
			symbol: 'BORROW',
			usdPrice: { value: '2000000000000000000', decimals: 18 } // 2.0 USD
		},
		{
			address: '0xBBB',
			symbol: 'COLL',
			usdPrice: { value: '1000000000000000000', decimals: 18 } // 1.0 USD
		}
	];
	const dummyPairs = [
		{
			debtAssetAddress: '0xAAA',
			collateralAssetAddress: '0xBBB',
			maxLTV: { value: '500000000000000000', decimals: 18 } // 0.5
		}
	];
	const baseResponse = {
		data: {
			assets: dummyAssets,
			pairs: dummyPairs
		}
	};

	beforeEach(() => {
		// Stub global.fetch to return our baseResponse
		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					json: () => Promise.resolve(baseResponse)
				})
			)
		);
	});

	afterEach(() => {
		// Restore any stubs/mocks
		vi.restoreAllMocks();
	});

	it('correctly computes required collateral under normal conditions', async () => {
		const result = await calculateRequiredCollateral(DUMMY_POOL_ID, 'BORROW', 10n, 'COLL');
		// We expect: debtValueUSD = 10 * 2 = 20 USD
		//            requiredCollateral = 20 / (1 * 0.5) = 40
		expect(result).toBeCloseTo(40, 8);
		expect(fetch).toHaveBeenCalledWith(`https://api.vesu.xyz/v1/pools/${DUMMY_POOL_ID}`);
	});

	it('throws if borrowTokenSymbol is not found in assets', async () => {
		await expect(
			calculateRequiredCollateral(DUMMY_POOL_ID, 'NOTEXIST', 5n, 'COLL')
		).rejects.toThrowError(/Asset with symbol "NOTEXIST" not found/);
	});

	it('throws if collateralTokenSymbol is not found in assets', async () => {
		await expect(
			calculateRequiredCollateral(DUMMY_POOL_ID, 'BORROW', 5n, 'NOPE')
		).rejects.toThrowError(/Asset with symbol "NOPE" not found/);
	});

	it('throws if the matching pair (debt/​collateral) does not exist', async () => {
		// Override fetch stub to return an empty pairs array
		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							data: {
								assets: dummyAssets,
								pairs: []
							}
						})
				})
			)
		);

		await expect(
			calculateRequiredCollateral(DUMMY_POOL_ID, 'BORROW', 5n, 'COLL')
		).rejects.toThrowError(/Pair debt=BORROW \/ collateral=COLL not found/);
	});
});
