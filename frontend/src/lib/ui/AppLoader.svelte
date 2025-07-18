<script lang="ts">
	import { onMount } from 'svelte';
	import { initZkLibraries, zkLibraries } from '$lib/stores/zkLibraries';
	import { autoReconnect } from '$lib/stores/wallet';
	import FullPageSpinner from './FullPageSpinner.svelte';
	import FullPageError from './FullPageError.svelte';
	import { initMerkleTree, startDepositProcessor } from '$lib/services/depositProcessor';
	import { initTokensWithSymbols } from '$lib/stores/tokens';
	import { initOperationsStore } from '$lib/stores/operations';

	onMount(() => {
		// Check IndexedDB availability
		if (!window.indexedDB) {
			console.error('IndexedDB is not available in this browser');
			return;
		}
		console.log('IndexedDB is available');

		// Check file download support
		const hasDownloadAttr = 'download' in document.createElement('a');
		const hasBlob = window.Blob && window.URL && window.URL.createObjectURL;
		
		if (!hasDownloadAttr || !hasBlob) {
			console.error('File download is not supported in this browser');
		} else {
			console.log('File download is supported');
		}

		initZkLibraries();
		autoReconnect();
		initTokensWithSymbols();

		const unsubscribeZk = zkLibraries.subscribe(async ($lib) => {
			if ($lib.status === 'ready') {
				await initMerkleTree();
				await initOperationsStore();
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
