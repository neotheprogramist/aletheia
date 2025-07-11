<script lang="ts">
	import { walletAddress } from '$lib/stores/wallet';
	import { provider } from '$lib/stores/provider';
	import { get } from 'svelte/store';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { fromWei } from '$lib/utils/toWei';

	export let tokenAddress: string;
	export let tokenSymbol: string = '';

	let balance = '';
	let isLoading = true;

	async function fetchBalance() {
		isLoading = true;
		balance = '';

		try {
			const rpc = get(provider);
			const address = get(walletAddress);
			
			if (!rpc || !address || !tokenAddress) {
				balance = '0';
				return;
			}

			const result = await rpc.callContract({
				contractAddress: tokenAddress,
				entrypoint: 'balanceOf',
				calldata: [address]
			}, 'latest');

			if (result && result.length > 0) {
				const decimals = await fetchTokenDecimals(tokenAddress);
				const balanceWei = BigInt(result[0]);
				const balanceStr = fromWei(balanceWei, decimals);
				const balanceNum = parseFloat(balanceStr);
				balance = balanceNum.toFixed(4);
			} else {
				balance = '0';
			}
		} catch (error) {
			console.warn('Failed to fetch balance:', error);
			balance = '0';
		} finally {
			isLoading = false;
		}
	}

	$: if (tokenAddress && $walletAddress) {
		fetchBalance();
	}

	$: if (!$walletAddress) {
		balance = '0';
		isLoading = false;
	}
</script>

<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
	<div class="flex items-center justify-between">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
			Wallet Balance
		</span>
		{#if isLoading}
			<div class="flex items-center gap-2">
				<div class="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
				<span class="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
			</div>
		{:else}
			<span class="text-sm font-semibold text-gray-900 dark:text-white" data-wallet-balance>
				Wallet Balance: {balance} {tokenSymbol}
			</span>
		{/if}
	</div>
</div>