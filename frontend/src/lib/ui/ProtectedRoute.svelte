<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { isConnected } from '$lib/stores/wallet';
	import { onMount } from 'svelte';

	let hasInitialized = false;

	onMount(() => {
		// Give time for autoReconnect to complete
		const timer = setTimeout(() => {
			hasInitialized = true;
		}, 1500);

		return () => clearTimeout(timer);
	});

	// Only redirect after initialization is complete
	$: if (browser && hasInitialized && !$isConnected) {
		goto('/', { replaceState: true });
	}
</script>

{#if $isConnected}
	<slot />
{:else if hasInitialized}
	<div class="w-full flex w-full items-center justify-center">
		<p class="text-gray-500">Redirecting to home…</p>
	</div>
{:else}
	<!-- Show loading state while checking wallet connection -->
	<div class="flex items-center justify-center min-h-screen">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
	</div>
{/if}
