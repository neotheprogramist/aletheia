import {
	PUBLIC_ETH_TOKEN_ADDRESS,
	PUBLIC_STRK_TOKEN_ADDRESS,
	PUBLIC_USDC_TOKEN_ADDRESS
} from '$env/static/public';

export interface PoolConfig {
	token0: string;
	token1: string;
}
/**
 * A list of pools that the application will interact with.
 * Each entry includes key_hash, token0, token1, fee, tick_spacing, and extension.
 */
export const supportedPools: PoolConfig[] = [
	// STRK -> USDC, USDC -> STRK
	{
		token0: PUBLIC_STRK_TOKEN_ADDRESS,
		token1: PUBLIC_USDC_TOKEN_ADDRESS
	},
	// STRK -> ETH, ETH -> STRK
	{
		token0: PUBLIC_STRK_TOKEN_ADDRESS,
		token1: PUBLIC_ETH_TOKEN_ADDRESS
	},
	// ETH -> USDC, USDC -> ETH
	{
		token0: PUBLIC_USDC_TOKEN_ADDRESS,
		token1: PUBLIC_ETH_TOKEN_ADDRESS
	}
];
