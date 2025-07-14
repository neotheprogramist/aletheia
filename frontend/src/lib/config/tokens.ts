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
		logoPath: `/tokens/${PUBLIC_STRK_TOKEN_ADDRESS}.png`,
		symbol: 'STRK'
	},
	{
		address: PUBLIC_ETH_TOKEN_ADDRESS,
		logoPath: `/tokens/${PUBLIC_ETH_TOKEN_ADDRESS}.png`,
		symbol: 'ETH'
	},
	{
		address: PUBLIC_USDC_TOKEN_ADDRESS,
		logoPath: `/tokens/${PUBLIC_USDC_TOKEN_ADDRESS}.png`,
		symbol: 'USDC'
	}
];
