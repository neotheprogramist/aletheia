<script lang="ts">
	export let message: string = '';
</script>

<div
	role="alert"
	aria-live="assertive"
	class="mt-4 rounded-md border border-red-400 bg-red-100 p-4 text-red-700 shadow"
>
	<p class="mb-1 font-semibold">⚠️ An error occurred:</p>

	{#if message}
		<pre class="whitespace-pre-wrap text-sm">{message}</pre>
	{:else}
		<slot />
	{/if}
</div>
