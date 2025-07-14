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
		<div class="flex items-center gap-1 bg-card rounded px-2 py-1">
			<span class="font-mono text-sm">
				{$walletAddress.slice(0, 6)}…{$walletAddress.slice(-4)}
			</span>
			<Tooltip text={copied ? $t('tooltips.common.copied') : $t('tooltips.common.copy_address')} position="bottom" theme="dark">
				<button
					on:click={copyAddress}
					class="ml-1 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200"
					class:text-green-600={copied}
					class:text-gray-500={!copied}
				>
					{#if copied}
						<Check size={14} />
					{:else}
						<Copy size={14} />
					{/if}
				</button>
			</Tooltip>
		</div>
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
