<script lang="ts">
	import PageContentContainer from '../components/PageContentContainer.svelte';
	import ActionButton from '../components/ActionButton.svelte';
	import { connectWallet } from '$lib/utils/wallet';
	import { wrapWithToast } from '$lib/utils/wrapWithToast';
	import { goto } from '$app/navigation';

	async function handleConnect() {
		const success = await wrapWithToast(() => connectWallet(), {
			success: 'Wallet connected successfully!',
			error: (err) => `Failed to connect wallet: ${(err as Error).message}`
		});

		if (success) {
			goto('/deposit');
		}
	}
</script>

<PageContentContainer title="Welcome to Aletheia">
	<div class="flex flex-col items-center gap-4">
		<ActionButton onClick={handleConnect} customClass="button-2xl">Connect Wallet</ActionButton>
	</div>
</PageContentContainer>
