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
		token0: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d', // STRK
		token1: '0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080' // USDC
	},
	// STRK -> ETH, ETH -> STRK
	{
		token0: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d', // STRK
		token1: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7' // ETH
	},
	// ETH -> USDC, USDC -> ETH
	{
		token0: '0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080', // USDC
		token1: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7' // ETH
	}
];
