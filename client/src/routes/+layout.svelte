<script lang="ts">
	import '../app.css';
	import Navbar from '../components/Navbar.svelte';
	import Toast from '../components/Toast.svelte';
	import PageContentContainer from '../components/PageContentContainer.svelte';

	import { connect } from 'starknetkit';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { isConnected, wallet, walletAddress } from '$lib/stores/wallet';
	import { wrapWithToast } from '$lib/utils/wrapWithToast';

	let isInitializing = true;
	const protectedPaths = ['/deposit', '/withdraw'];

	onMount(async () => {
		const pathname = $page.url.pathname;

		await wrapWithToast(
			async () => {
				const { wallet: connectedWallet, connectorData } = await connect({
					modalMode: 'neverAsk'
				});
				if (connectedWallet && connectorData?.account) {
					wallet.set(connectedWallet);
					walletAddress.set(connectorData.account);
					isConnected.set(true);

					goto('/deposit');
				} else if (protectedPaths.includes(pathname)) {
					goto('/');
					throw new Error('Please connect your wallet first');
				}
			},
			{
				error: (err) => `Wallet error: ${(err as Error).message}`,
				showSuccess: false
			}
		);

		isInitializing = false;
	});
</script>

<main class="flex min-h-screen flex-col">
	<header class="fixed left-0 right-0 top-0 z-50">
		<Navbar />
	</header>

	{#if isInitializing}
		<div class="flex flex-1 flex-col items-center justify-center gap-2">
			<div
				class="h-6 w-6 animate-spin rounded-full border-4 border-gray-400 border-t-transparent"
			></div>
			<p class="text-sm text-gray-400">Connecting wallet...</p>
		</div>
	{:else}
		<div class="flex flex-1 flex-col pt-20">
			<PageContentContainer>
				<slot />
			</PageContentContainer>
		</div>
	{/if}

	<Toast />
</main>
