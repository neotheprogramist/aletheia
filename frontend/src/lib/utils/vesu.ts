// vesuUtils.ts

export type BigNumberString = {
	value: string;
	decimals: number;
};

export interface Asset {
	address: string;
	symbol: string;
	usdPrice: BigNumberString;
}

export interface Pair {
	collateralAssetAddress: string;
	debtAssetAddress: string;
	maxLTV: BigNumberString;
}

export interface PoolData {
	assets: Asset[];
	pairs: Pair[];
}

export interface ApiResponse {
	data: PoolData;
}

/**
 * Helper function that converts a BigNumberString (string + decimals) into a JavaScript number.
 *
 * @param strValue – the numeric value as a string (e.g., "125374240000000000")
 * @param decimals – how many decimal places the original value has (e.g., 18)
 * @returns the parsed number (e.g., 0.12537424)
 */
export function parseBigNumber(strValue: string, decimals: number): number {
	return parseFloat(strValue) / Math.pow(10, decimals);
}

/**
 * Asynchronous function that calculates how much collateral (in collateralToken)
 * must be deposited in order to borrow borrowAmount (as bigint) of borrowToken
 * from a given Vesu pool.
 *
 * @param poolId                – the Vesu pool identifier (string)
 * @param borrowTokenSymbol     – the symbol of the token to borrow (e.g., "STRK")
 * @param borrowAmount          – the amount of borrowToken to borrow (as bigint)
 * @param collateralTokenSymbol – the symbol of the token used as collateral (e.g., "USDC")
 * @returns the minimum amount of collateralToken required (as a number)
 */
export async function calculateRequiredCollateral(
	poolId: string,
	borrowTokenSymbol: string,
	borrowAmount: bigint,
	collateralTokenSymbol: string
): Promise<number> {
	// 1. Build the Vesu endpoint URL
	const url = `https://api.vesu.xyz/v1/pools/${poolId}`;

	// 2. Fetch data from the API
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
	}
	const json: ApiResponse = await response.json();
	const pool: PoolData = json.data;

	// 3. Find the Asset objects matching the provided symbols
	const assets: Asset[] = pool.assets;
	const borrowAsset = assets.find(
		(a) => a.symbol.toUpperCase() === borrowTokenSymbol.toUpperCase()
	);
	const collateralAsset = assets.find(
		(a) => a.symbol.toUpperCase() === collateralTokenSymbol.toUpperCase()
	);

	if (!borrowAsset) {
		throw new Error(`Asset with symbol "${borrowTokenSymbol}" not found`);
	}
	if (!collateralAsset) {
		throw new Error(`Asset with symbol "${collateralTokenSymbol}" not found`);
	}

	// 4. Convert USD prices from BigNumberString to a JavaScript number
	const borrowPriceUSD: number = parseBigNumber(
		borrowAsset.usdPrice.value,
		borrowAsset.usdPrice.decimals
	);
	const collateralPriceUSD: number = parseBigNumber(
		collateralAsset.usdPrice.value,
		collateralAsset.usdPrice.decimals
	);

	// 5. Look up the Pair where debtAssetAddress = borrowAsset.address
	//    and collateralAssetAddress = collateralAsset.address
	const pair = pool.pairs.find(
		(p) =>
			p.debtAssetAddress.toLowerCase() === borrowAsset.address.toLowerCase() &&
			p.collateralAssetAddress.toLowerCase() === collateralAsset.address.toLowerCase()
	);

	if (!pair) {
		throw new Error(
			`Pair debt=${borrowTokenSymbol} / collateral=${collateralTokenSymbol} not found`
		);
	}

	// 6. Convert maxLTV from BigNumberString to a number (e.g., 0.7 for 70%)
	const maxLTV: number = parseBigNumber(pair.maxLTV.value, pair.maxLTV.decimals);

	// 7. Convert borrowAmount (bigint) to a number so we can multiply by borrowPriceUSD
	const borrowAmountNum: number = Number(borrowAmount);
	if (isNaN(borrowAmountNum)) {
		throw new Error(`Invalid borrowAmount: ${borrowAmount.toString()}`);
	}

	// 8. Compute the USD value of the debt:
	//    debtValueUSD = borrowAmountNum * borrowPriceUSD
	const debtValueUSD: number = borrowAmountNum * borrowPriceUSD;

	// 9. Compute the minimum collateral needed:
	//    requiredCollateral = debtValueUSD / (collateralPriceUSD * maxLTV)
	const requiredCollateralFloat: number = debtValueUSD / (collateralPriceUSD * maxLTV);

	return requiredCollateralFloat;
}
