<script lang="ts">
	import { toast } from '$lib/stores/toast';
	import { fly } from 'svelte/transition';
</script>

{#if $toast?.visible}
	<div
		class={`toast ${
			$toast.type === 'error'
				? 'toast-error'
				: $toast.type === 'success'
					? 'toast-success'
					: $toast.type === 'info'
						? 'toast-info'
						: 'toast-default'
		}`}
		in:fly={{ y: 20, duration: 200 }}
	>
		{$toast.message}
	</div>
{/if}
