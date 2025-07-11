<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { provider } from '$lib/stores/provider';
	import { walletAddress } from '$lib/stores/wallet';
	import { fromWei } from '$lib/utils/toWei';
	import { fetchTokenSymbol, fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import type { TokenConfig } from '$lib/config/tokens';

	export let token: TokenConfig;
	export let showLabel = true;
	export let compact = false;

	let balance = '0';
	let symbol = '';
	let decimals = 18;
	let loading = true;
	let error = false;

	async function fetchBalance() {
		try {
			loading = true;
			error = false;
			
			const rpc = get(provider);
			const address = get(walletAddress);
			
			if (!rpc || !address || !token?.address) {
				balance = '0';
				loading = false;
				return;
			}

			// Fetch token metadata
			const [tokenSymbol, tokenDecimals] = await Promise.all([
				fetchTokenSymbol(token.address),
				fetchTokenDecimals(token.address)
			]);

			symbol = tokenSymbol;
			decimals = tokenDecimals;

			// Fetch balance
			const result = await rpc.callContract({
				contractAddress: token.address,
				entrypoint: 'balanceOf',
				calldata: [address]
			}, 'latest');

			if (result && result.length > 0) {
				const balanceWei = BigInt(result[0]);
				balance = fromWei(balanceWei, decimals);
			} else {
				balance = '0';
			}
		} catch (err) {
			console.error('Error fetching balance:', err);
			error = true;
			balance = '0';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchBalance();
	});

	// Reactive statement to refetch when token or wallet changes
	$: if (token?.address && $walletAddress) {
		fetchBalance();
	}

	function formatBalance(bal: string): string {
		const num = parseFloat(bal);
		if (num === 0) return '0';
		if (num < 0.0001) return '< 0.0001';
		if (num < 1) return num.toFixed(4);
		if (num < 1000) return num.toFixed(2);
		if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
		return (num / 1000000).toFixed(1) + 'M';
	}
</script>

<div class="balance-card" class:compact>
	{#if showLabel}
		<div class="balance-label">
			Wallet Balance
		</div>
	{/if}
	
	<div class="balance-content">
		{#if loading}
			<div class="balance-loading">
				<div class="spinner"></div>
				<span>Loading...</span>
			</div>
		{:else if error}
			<div class="balance-error">
				<span class="error-icon">⚠️</span>
				<span>Error loading balance</span>
			</div>
		{:else}
			<div class="balance-display">
				<div class="balance-amount">
					{formatBalance(balance)}
				</div>
				<div class="balance-symbol">
					{symbol}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.balance-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 16px;
		transition: all 0.2s ease;
	}

	.balance-card.compact {
		padding: 12px;
	}

	.balance-label {
		font-size: 12px;
		color: var(--color-text-secondary);
		margin-bottom: 8px;
		font-weight: 500;
	}

	.balance-content {
		display: flex;
		align-items: center;
		min-height: 32px;
	}

	.balance-loading {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--color-text-secondary);
		font-size: 14px;
	}

	.balance-error {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--color-error);
		font-size: 14px;
	}

	.balance-display {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.balance-amount {
		font-size: 18px;
		font-weight: 600;
		color: var(--color-text);
	}

	.balance-symbol {
		font-size: 14px;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-border);
		border-top: 2px solid var(--color-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.error-icon {
		font-size: 16px;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.balance-card {
			padding: 12px;
		}
		
		.balance-amount {
			font-size: 16px;
		}
	}
</style>