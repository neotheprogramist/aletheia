<script lang="ts">
	import PageContentContainer from '../components/PageContentContainer.svelte';
	import ActionButton from '../components/ActionButton.svelte';
	import { connectWallet } from '$lib/utils/wallet';
	import { goto } from '$app/navigation';
	import { showToast } from '$lib/stores/toast';

	async function handleConnect() {
		try {
			const success = await connectWallet();

			if (success) {
				showToast('Wallet connected successfully!', 'success');
				goto('/deposit');
			}
		} catch (error) {
			console.error('Failed to connect wallet: ', error);
			showToast(`Failed to connect wallet: ${error}`, 'error');
		}
	}
</script>

<PageContentContainer title="Welcome to Aletheia">
	<div class="flex flex-col items-center gap-4">
		<ActionButton onClick={handleConnect} customClass="button-2xl">Connect Wallet</ActionButton>
	</div>
</PageContentContainer>
