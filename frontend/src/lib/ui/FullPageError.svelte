<script lang="ts">
	export let message: string | undefined;
</script>

<div class="bg-background fixed inset-0 flex flex-col items-center justify-center text-red-500">
	<p class="mb-2">⚠️ {message}</p>
	<button on:click={() => location.reload()} class="bg-card mt-2 rounded px-4 py-2">Reload</button>
</div>
