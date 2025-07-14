<script lang="ts">
	import { connectWallet, disconnectWallet, walletAddress, isConnected } from '$lib/stores/wallet';
	import { t } from '$lib/i18n';
	import { Copy, Check } from 'lucide-svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	
	let copied = false;
	
	async function copyAddress() {
		if (!$walletAddress) return;
		
		try {
			await navigator.clipboard.writeText($walletAddress);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy address:', err);
		}
	}
</script>

<div class="flex items-center gap-3">
	{#if $isConnected}
		<Tooltip text={copied ? $t('tooltips.common.copied') : $t('tooltips.common.copy_address')} position="bottom" theme="dark">
			<button
				on:click={copyAddress}
				class="bg-card rounded px-2 py-1 font-mono text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 cursor-pointer"
				class:text-green-600={copied}
				class:bg-green-50={copied}
				class:dark:bg-green-900={copied}
			>
				{$walletAddress.slice(0, 6)}…{$walletAddress.slice(-4)}
				{#if copied}
					<Check size={14} class="inline ml-1" />
				{/if}
			</button>
		</Tooltip>
		<button
			on:click={disconnectWallet}
			class="button rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700"
		>
			{$t('wallet.disconnect')}
		</button>
	{:else}
		<button
			on:click={connectWallet}
			class="button rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
		>
			{$t('wallet.connect')}
		</button>
	{/if}
</div>
