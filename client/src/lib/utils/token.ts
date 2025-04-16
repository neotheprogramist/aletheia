import { PUBLIC_PRIVACY_API } from '$env/static/public';

export async function fetchTokenDecimals(tokenAddress: string) {
	const response = await fetch(`${PUBLIC_PRIVACY_API}/asp/getTokenDecimals`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token_address: tokenAddress })
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch token decimals: ${response.statusText}`);
	}

	const data = await response.json();
	if (typeof data.decimals !== 'number') {
		throw new Error("Invalid response format: 'decimals' field is missing or incorrect");
	}

	return data.decimals;
}

export async function fetchTokenName(tokenAddress: string): Promise<string> {
	const response = await fetch(`${PUBLIC_PRIVACY_API}/asp/getTokenName`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token_address: tokenAddress })
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch token name: ${response.statusText}`);
	}

	const data = await response.json();

	return data.name;
}
