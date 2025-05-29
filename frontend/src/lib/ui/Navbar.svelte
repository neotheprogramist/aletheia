<script lang="ts">
	import { page } from '$app/stores';
	import ToggleTheme from './ToggleTheme.svelte';
	import WalletConnector from '$lib/ui/WalletConnector.svelte';
	import { isConnected } from '$lib/stores/wallet';
</script>

<nav
	class="border-border bg-background fixed inset-x-0 top-0 z-10 flex items-center justify-between border-b px-6 py-3"
>
	<a href="/" class="text-primary text-xl font-bold tracking-tight"> Privacy Pools </a>

	<div class="flex items-center gap-4">
		{#if $isConnected}
			<a
				href="/deposit"
				class={$page.url.pathname === '/deposit' ? 'font-bold text-sky-500' : 'hover:underline'}
			>
				Deposit
			</a>
			<a
				href="/withdraw"
				class={$page.url.pathname === '/withdraw' ? 'font-bold text-sky-500' : 'hover:underline'}
			>
				Withdraw
			</a>
			<a
				href="/merge"
				class={$page.url.pathname === '/merge' ? 'font-bold text-sky-500' : 'hover:underline'}
			>
				Merge
			</a>
		{/if}

		<WalletConnector />
		<ToggleTheme />
	</div>
</nav>
