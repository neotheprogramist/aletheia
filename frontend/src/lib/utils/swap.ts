import { PUBLIC_EKUBO_QUOTER } from '$env/static/public';

/**
 * Fetches a quote from the ekubo quoter API for a given input amount (amountInWei)
 * and token pair (tokenIn, tokenOut). Returns EkuboQuoteResponse.
 */
export async function fetchEkuboQuote(amountInWei: bigint, tokenIn: string, tokenOut: string) {
	const url = `${PUBLIC_EKUBO_QUOTER}/${amountInWei.toString()}/${tokenIn}/${tokenOut}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Ekubo quoter error: ${res.status} ${res.statusText}`);
	}
	return (await res.json()) as EkuboQuoteResponse;
}

export interface EkuboSplit {
	amount_specified: string; // how many input tokens go down this path, e.g. "2500000000000000000"
	amount_calculated: string; // how many output tokens this part produces, e.g. "493256"
	route: Array<{
		pool_key: {
			token0: string;
			token1: string;
			fee: string; // hex‐string u128
			tick_spacing: number; // u128
			extension: string; // address or "0x0"
		};
		sqrt_ratio_limit: string; // hex‐string u256
		skip_ahead: number; // u128
	}>;
}

export interface EkuboQuoteResponse {
	total_calculated: string; // sum of all amount_calculated
	price_impact: number; // percent impact
	splits: EkuboSplit[];
}

/**
 * Build calldata for SwapExtensionZk.execute.
 *
 * Serializes into:
 *   SwapParams { swaps: Array<Swap>, secret_and_nullifier_hash: u256 }
 *
 * Each Swap = { route: Array<RouteNode>, token_amount: TokenAmount }
 * where RouteNode = { pool_key { token0, token1, fee, tick_spacing, extension }, sqrt_ratio_limit, skip_ahead }
 * and TokenAmount = { token, amount (i129) }.
 *
 * The resulting array of felts is:
 * 1) [u128 = number_of_swaps]
 * 2) For each swap:
 *    a) [u128 = route_length]
 *    b) For each RouteNode (8 felts each):
 *       - token0 (felt252)
 *       - token1 (felt252)
 *       - fee (u128)
 *       - tick_spacing (u128)
 *       - extension (felt252)
 *       - sqrt_ratio_limit (u256 → low128, high128)
 *       - skip_ahead (u128)
 *    c) TokenAmount:
 *       - token (felt252)
 *       - amount (i129 → mag_u128, sign_felt)
 * 3) secret_and_nullifier_hash (u256 → low128, high128)
 * 4) Finally prefix with total number of felts (u128)
 */
export function buildSwapCalldata(
	ekubo: EkuboQuoteResponse,
	inputToken: string,
	secretAndNullifierHash: bigint
): string[] {
	// Helpers to encode into felt‐hex
	function encodeU128(decStr: string): string {
		const bi = BigInt(decStr);
		return '0x' + bi.toString(16).padStart(32, '0');
	}
	function encodeU256(value: bigint): [string, string] {
		const mask = (1n << 128n) - 1n;
		const low = `0x${(value & mask).toString(16).padStart(32, '0')}`;
		const high = `0x${((value >> 128n) & mask).toString(16).padStart(32, '0')}`;
		return [low, high];
	}
	function encodeI129(signedDec: string): [string, string] {
		let negative = false;
		let magStr = signedDec;
		if (signedDec.startsWith('-')) {
			negative = true;
			magStr = signedDec.slice(1);
		}
		const magFelt = encodeU128(magStr);
		const signFelt = negative ? '0x1' : '0x0';
		return [magFelt, signFelt];
	}

	// 1) Number of swaps (u128)
	const swaps = ekubo.splits;
	const swapsCountFelt = encodeU128(swaps.length.toString());

	// 2) Encode each Swap
	const swapsCalldata: string[] = [];
	swapsCalldata.push(swapsCountFelt);

	for (const split of swaps) {
		// a) Build routeNodes list as JS objects
		const routeNodes = split.route.map((node) => ({
			token0: node.pool_key.token0,
			token1: node.pool_key.token1,
			fee: BigInt(node.pool_key.fee).toString(),
			tick_spacing: BigInt(node.pool_key.tick_spacing).toString(),
			extension: node.pool_key.extension,
			sqrt_ratio_limit: BigInt(node.sqrt_ratio_limit),
			skip_ahead: BigInt(node.skip_ahead)
		}));

		// b) route_length (u128)
		swapsCalldata.push(encodeU128(routeNodes.length.toString()));
		// c) For each RouteNode, append 8 felts
		for (const rn of routeNodes) {
			// token0, token1
			swapsCalldata.push(rn.token0);
			swapsCalldata.push(rn.token1);
			// fee (u128)
			swapsCalldata.push(encodeU128(rn.fee));
			// tick_spacing (u128)
			swapsCalldata.push(encodeU128(rn.tick_spacing));
			// extension
			swapsCalldata.push(rn.extension);
			// sqrt_ratio_limit (u256 → low128, high128)
			const [sqrtLow, sqrtHigh] = encodeU256(rn.sqrt_ratio_limit);
			swapsCalldata.push(sqrtLow, sqrtHigh);
			// skip_ahead (u128)
			swapsCalldata.push(encodeU128(rn.skip_ahead.toString()));
		}

		// d) TokenAmount: token (felt252) + amount (i129 → 2 felts)
		swapsCalldata.push(inputToken);
		const [amtMag, amtSign] = encodeI129(split.amount_specified);
		swapsCalldata.push(amtMag, amtSign);
	}

	// 3) Append secret_and_nullifier_hash (u256 → low128, high128)
	const [secretLow, secretHigh] = encodeU256(secretAndNullifierHash);
	swapsCalldata.push(secretLow, secretHigh);

	// 4) Compute total_felts and prefix
	const totalFelts = swapsCalldata.length;
	const totalFeltsFelt = encodeU128(totalFelts.toString());

	return [totalFeltsFelt, ...swapsCalldata];
}
