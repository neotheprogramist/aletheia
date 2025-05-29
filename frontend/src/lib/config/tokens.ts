export interface TokenConfig {
	address: string;
	logoPath: string;
	symbol?: string;
}

export const supportedTokens: TokenConfig[] = [
	{
		address: '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
		logoPath: '/tokens/0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d.png'
	}
];
