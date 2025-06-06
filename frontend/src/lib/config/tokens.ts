import {
	PUBLIC_ETH_TOKEN_ADDRESS,
	PUBLIC_STRK_TOKEN_ADDRESS,
	PUBLIC_USDC_TOKEN_ADDRESS
} from '$env/static/public';

export interface TokenConfig {
	address: string;
	logoPath: string;
	symbol?: string;
}

export const supportedTokens: TokenConfig[] = [
	{
		address: PUBLIC_STRK_TOKEN_ADDRESS,
		logoPath: '/tokens/0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d.png'
	},
	{
		address: PUBLIC_ETH_TOKEN_ADDRESS,
		logoPath: '/tokens/0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7.png'
	},
	{
		address: PUBLIC_USDC_TOKEN_ADDRESS,
		logoPath: '/tokens/0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080.png'
	}
];
