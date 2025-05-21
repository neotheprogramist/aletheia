<script lang="ts">
	import { scale } from 'svelte/transition';
	import { toastStore } from '$lib/stores/toast';

	export let position: 'bottom-center' | 'top-center' = 'bottom-center';
</script>

<div class="toast-container {position}">
	{#each $toastStore.slice(-3) as toast (toast.id)}
		<div transition:scale={{ start: 0.95, duration: 200 }}>
			<div class="toast {toast.type}">
				<div class="mr-4 flex-1 overflow-x-hidden break-words break-all whitespace-pre-wrap">
					{toast.message}
				</div>

				<button class="dismiss" on:click={() => toastStore.removeToast(toast.id)}> × </button>
			</div>
		</div>
	{/each}
</div>
