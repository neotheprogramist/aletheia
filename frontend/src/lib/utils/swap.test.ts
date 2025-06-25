// frontend/src/lib/utils/swap.test.ts
import { describe, it, expect } from 'vitest';
import { buildSwapCalldata, fetchEkuboQuote, type EkuboQuoteResponse } from './swap';

describe('buildSwapCalldata', () => {
	it('should correctly encode real Ekubo API response', () => {
		// Exact response from Ekubo API for 0.1 STRK -> ETH swap
		const mockEkuboResponse: EkuboQuoteResponse = {
			total_calculated: '15536039172203',
			price_impact: -0.16894932,
			splits: [
				{
					amount_specified: '100000000000000000',
					amount_calculated: '15536039172203',
					route: [
						{
							pool_key: {
								token0: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
								token1: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
								fee: '0xc49ba5e353f7d00000000000000000',
								tick_spacing: 5982,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x18227127a68af1667d19509cea645d1',
							skip_ahead: 0
						}
					]
				}
			]
		};

		const inputToken = '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
		const secretAndNullifierHash = 123456789n;

		// Execute
		const calldata = buildSwapCalldata(mockEkuboResponse, inputToken, secretAndNullifierHash);
		console.log('real calldata', calldata);
	});

	it('should print calldata for large Ekubo API response', () => {
		const mockEkuboResponse: EkuboQuoteResponse = {
			total_calculated: '471614311717323',
			price_impact: -0.0025218467,
			splits: [
				{
					amount_specified: '5000000000000000000',
					amount_calculated: '235758300499845',
					route: [
						{
							pool_key: {
								token0: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x20c49ba5e353f80000000000000000',
								tick_spacing: 1000,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x503cf97aa8602cba70a30d6d756',
							skip_ahead: 0
						},
						{
							pool_key: {
								token0: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x20c49ba5e353f80000000000000000',
								tick_spacing: 354892,
								extension: '0x43e4f09c32d13d43a880e85f69f7de93ceda62d6cf2581a582c6db635548fdc'
							},
							sqrt_ratio_limit: '0xd66374d559cec6aec510970e832971fd5abbdcedca1d16b1',
							skip_ahead: 0
						}
					]
				},
				{
					amount_specified: '2500000000000000000',
					amount_calculated: '118023897898511',
					route: [
						{
							pool_key: {
								token0: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x20c49ba5e353f80000000000000000',
								tick_spacing: 1000,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x503cf281cbaec48aa2de25be176',
							skip_ahead: 0
						},
						{
							pool_key: {
								token0: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x0',
								tick_spacing: 1,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x33c320355bd80fe2c42f7ee6baa44',
							skip_ahead: 4027
						}
					]
				},
				{
					amount_specified: '1250000000000000000',
					amount_calculated: '58963483957917',
					route: [
						{
							pool_key: {
								token0: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x20c49ba5e353f80000000000000000',
								tick_spacing: 1000,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x503cef055dca62041d9f7083674',
							skip_ahead: 0
						},
						{
							pool_key: {
								token0: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x68db8bac710cb4000000000000000',
								tick_spacing: 354892,
								extension: '0x43e4f09c32d13d43a880e85f69f7de93ceda62d6cf2581a582c6db635548fdc'
							},
							sqrt_ratio_limit: '0xd66374d559cec6aec510970e832971fd5abbdcedca1d16b1',
							skip_ahead: 0
						}
					]
				},
				{
					amount_specified: '625000000000000000',
					amount_calculated: '29435627748397',
					route: [
						{
							pool_key: {
								token0: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x20c49ba5e353f80000000000000000',
								tick_spacing: 1000,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x503ced4726f54520c76679c45f0',
							skip_ahead: 0
						},
						{
							pool_key: {
								token0: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x0',
								tick_spacing: 1003,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x3ab67d9a70710c8adf20c25600689',
							skip_ahead: 0
						}
					]
				},
				{
					amount_specified: '312500000000000000',
					amount_calculated: '14719508072501',
					route: [
						{
							pool_key: {
								token0: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x20c49ba5e353f80000000000000000',
								tick_spacing: 1000,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x503cec680b91fbc689e37eb830f',
							skip_ahead: 0
						},
						{
							pool_key: {
								token0: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x0',
								tick_spacing: 1,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x33c6752601b96930b4f78caf3f443',
							skip_ahead: 502
						}
					]
				},
				{
					amount_specified: '156250000000000000',
					amount_calculated: '7357521935368',
					route: [
						{
							pool_key: {
								token0: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x20c49ba5e353f80000000000000000',
								tick_spacing: 1000,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x503cebf87de2285f34d8816a56d',
							skip_ahead: 0
						},
						{
							pool_key: {
								token0: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x0',
								tick_spacing: 1003,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x3ab6f8fd87e01c5583264dffe799d',
							skip_ahead: 0
						}
					]
				},
				{
					amount_specified: '78125000000000000',
					amount_calculated: '3678618265653',
					route: [
						{
							pool_key: {
								token0: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x20c49ba5e353f80000000000000000',
								tick_spacing: 1000,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x503cebc0b70ab2fcfa8ac8b4066',
							skip_ahead: 0
						},
						{
							pool_key: {
								token0: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x0',
								tick_spacing: 1,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x33c74a60a59818ffab1a635fa6d25',
							skip_ahead: 125
						}
					]
				},
				{
					amount_specified: '78125000000000000',
					amount_calculated: '3677353339131',
					route: [
						{
							pool_key: {
								token0: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x20c49ba5e353f80000000000000000',
								tick_spacing: 1000,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x503ceb88f0338b265f8c8047799',
							skip_ahead: 0
						},
						{
							pool_key: {
								token0: '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
								token1: '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
								fee: '0x0',
								tick_spacing: 1003,
								extension: '0x0'
							},
							sqrt_ratio_limit: '0x3ab736a9caeaa8777adc562459f57',
							skip_ahead: 0
						}
					]
				}
			]
		};

		const inputToken = '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
		const secretAndNullifierHash = 123456789n;

		const calldata = buildSwapCalldata(mockEkuboResponse, inputToken, secretAndNullifierHash);
		console.log('real calldata:', JSON.stringify(calldata, null, 2));
		console.log('real calldata len:', calldata.length);
	});
});

describe('buildSwapCalldata (integration with real Ekubo API)', () => {
	it('fetches real quote and builds calldata', async () => {
		// 1) Parametry swapu
		const amountInWei = 5000000000000000000n; // 5 tokens
		const inputToken = '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
		const outputToken = '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8';

		// 2) fetch live from Ekubo
		const ekubo: EkuboQuoteResponse = await fetchEkuboQuote(amountInWei, inputToken, outputToken);
		console.log('📊 EkuboQuoteResponse:', JSON.stringify(ekubo, null, 2));

		// 3) Build calldata
		const secretAndNullifierHash = 123456789n;
		const calldata = buildSwapCalldata(ekubo, inputToken, secretAndNullifierHash);

		// 4) Formatted as JSON
		console.log('\n📝 Generated calldata JSON:');
		console.log(JSON.stringify(calldata, null, 2));

		// 5) Asserts and sanity check
		expect(Array.isArray(calldata)).toBe(true);
		expect(calldata.length).toBeGreaterThan(8);
		expect(typeof calldata[0]).toBe('string');
		expect(calldata[0]).toMatch(/^0x[0-9a-f]+$/);
	});
});
