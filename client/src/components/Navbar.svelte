<script lang="ts">
	import { goto } from '$app/navigation';
	import { isConnected, walletAddress } from '$lib/stores/wallet';
	import { copyWalletAddress, disconnectWallet, shortAddress } from '$lib/utils/wallet';
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
				on:click={() => copyWalletAddress($walletAddress)}
				on:keypress={(e) => e.key === 'Enter' && copyWalletAddress($walletAddress)}
				title="Click to copy"
				aria-label="Copy wallet address"
			>
				{shortAddress($walletAddress)}
			</button>

			<button on:click={disconnectWallet} class="navbar-disconnect">Disconnect</button>
		</div>
	{/if}
</nav>
