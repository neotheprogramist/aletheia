<script lang="ts">
	import { onMount } from 'svelte';
	import { initZkLibraries, zkLibraries } from '$lib/stores/zkLibraries';
	import { autoReconnect } from '$lib/stores/wallet';
	import FullPageSpinner from './FullPageSpinner.svelte';
	import FullPageError from './FullPageError.svelte';
	import { initMerkleTree, startDepositProcessor } from '$lib/services/depositProcessor';

	onMount(() => {
		initZkLibraries();
		autoReconnect();

		const unsubscribeZk = zkLibraries.subscribe(async ($lib) => {
			if ($lib.status === 'ready') {
				console.log('✅ zkLibraries ready, initializing Merkle tree...');
				await initMerkleTree();
				startDepositProcessor();
				unsubscribeZk();
			}
		});

		return () => {
			unsubscribeZk?.();
		};
	});
</script>

{#if $zkLibraries.status === 'loading'}
	<FullPageSpinner />
{:else if $zkLibraries.status === 'error'}
	<FullPageError message={$zkLibraries.error} />
{:else}
	<slot />
{/if}
