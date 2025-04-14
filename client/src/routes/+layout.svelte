<script lang="ts">
	import '../app.css';
	import Navbar from '../components/Navbar.svelte';
	import Toast from '../components/Toast.svelte';

	import { connect } from 'starknetkit';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { isConnected, wallet, walletAddress } from '$lib/stores/wallet';
	import PageContentContainer from '../components/PageContentContainer.svelte';
	import { showToast } from '$lib/stores/toast';

	onMount(async () => {
		try {
			const { wallet: connectedWallet, connectorData } = await connect({
				modalMode: 'neverAsk'
			});
			if (connectedWallet && connectorData?.account) {
				wallet.set(connectedWallet);
				walletAddress.set(connectorData.account);
				isConnected.set(true);
				showToast('Wallet connected', 'success');
			} else {
				const protectedPaths = ['/deposit', '/withdraw'];
				if (protectedPaths.includes($page.url.pathname)) {
					showToast('Please connect your wallet first', 'info');
					goto('/');
				}
			}
		} catch (error) {
			console.warn('Auto-connect failed:', error);
			showToast(`Failed to auto-connect wallet: ${error}`, 'error');
			if (['/deposit', '/withdraw'].includes($page.url.pathname)) {
				showToast('Please connect your wallet first', 'info');
				goto('/');
			}
		}
	});
</script>

<main class="flex min-h-screen flex-col">
	<header class="fixed left-0 right-0 top-0 z-50">
		<Navbar />
	</header>

	<div class="flex flex-1 flex-col pt-20">
		<PageContentContainer>
			<slot />
		</PageContentContainer>
	</div>

	<Toast />
</main>
