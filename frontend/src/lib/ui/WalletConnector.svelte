<script lang="ts">
	import { connectWallet, disconnectWallet, walletAddress, isConnected } from '$lib/stores/wallet';
</script>

<div class="flex items-center gap-3">
	{#if $isConnected}
		<span class="bg-card rounded px-2 py-1">
			{$walletAddress.slice(0, 6)}…{$walletAddress.slice(-4)}
		</span>
		<button
			on:click={disconnectWallet}
			class="button rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700"
		>
			Disconnect
		</button>
	{:else}
		<button
			on:click={connectWallet}
			class="button rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
		>
			Connect Wallet
		</button>
	{/if}
</div>
