<script lang="ts">
	import { goto } from '$app/navigation';
	import { isConnected, walletAddress } from '$lib/stores/wallet';
	import { copyWalletAddress, disconnectWallet, shortAddress } from '$lib/utils/wallet';
	import ToggleTheme from './ToggleTheme.svelte';
	import { wrapWithToast } from '$lib/utils/wrapWithToast';

	async function handleCopy() {
		await wrapWithToast(() => copyWalletAddress($walletAddress), {
			success: 'Copied address to clipboard!',
			error: 'Failed to copy address'
		});
	}

	async function handleDisconnect() {
		await wrapWithToast(() => disconnectWallet(), {
			success: 'Disconnected wallet',
			error: 'Failed to disconnect wallet'
		});
	}
</script>

<nav class="navbar">
	<a href="/deposit" class="navbar-logo">Aletheia</a>

	{#if $isConnected}
		<div class="navbar-menu">
			<button on:click={() => goto('/deposit')} class="navbar-link">Deposit</button>
			<button on:click={() => goto('/withdraw')} class="navbar-link">Withdraw</button>
			<a
				href="https://visoft.gitbook.io/quietcash-docs"
				target="_blank"
				rel="noopener noreferrer"
				class="navbar-link"
			>
				Docs
			</a>

			<button
				class="navbar-link"
				on:click={handleCopy}
				on:keypress={(e) => e.key === 'Enter' && handleCopy()}
				title="Click to copy"
				aria-label="Copy wallet address"
			>
				{shortAddress($walletAddress)}
			</button>

			<button on:click={handleDisconnect} class="navbar-disconnect">Disconnect</button>
			<ToggleTheme />
		</div>
	{/if}
</nav>
