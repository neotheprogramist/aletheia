import { writable } from 'svelte/store';
import { fetchTokenSymbol } from '$lib/utils/fetchTokenDecimals';
import { supportedTokens as initialTokens } from '$lib/config/tokens';

export const tokens = writable(structuredClone(initialTokens));

export async function initTokensWithSymbols() {
	const updated = await Promise.all(
		initialTokens.map(async (token) => {
			if (!token.symbol) {
				try {
					const symbol = await fetchTokenSymbol(token.address);
					return { ...token, symbol };
				} catch (e) {
					console.warn(`❌ Failed to fetch symbol for ${token.address}`, e);
				}
			}
			return token;
		})
	);
	tokens.set(updated);
}

export const selectedToken = writable(initialTokens[0].address);
