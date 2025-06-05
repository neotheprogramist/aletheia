export interface TokenConfig {
	address: string;
	logoPath: string;
	symbol?: string;
}

export const supportedTokens: TokenConfig[] = [
	{
		address: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
		logoPath: '/tokens/0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d.png'
	},
	{
		address: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
		logoPath: '/tokens/0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7.png'
	},
	{
		address: '0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080',
		logoPath: '/tokens/0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080.png'
	}
];
