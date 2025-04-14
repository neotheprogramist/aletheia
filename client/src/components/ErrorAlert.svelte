<script lang="ts">
	export let message: string = '';
</script>

<div role="alert" aria-live="assertive" class="alert-error">
	<p class="mb-1 font-semibold">⚠️ An error occurred:</p>

	{#if message}
		<pre class="whitespace-pre-wrap text-sm">{message}</pre>
	{:else}
		<slot />
	{/if}
</div>
