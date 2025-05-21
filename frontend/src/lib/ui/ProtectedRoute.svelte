<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { isConnected } from '$lib/stores/wallet';

	// whenever $isConnected changes, this block will re-evaluate
	$: if (browser && !$isConnected) {
		goto('/', { replaceState: true });
	}
</script>

{#if $isConnected}
	<slot />
{:else}
	<div class="flex h-full items-center justify-center">
		<p class="text-gray-500">Redirecting to home…</p>
	</div>
{/if}
