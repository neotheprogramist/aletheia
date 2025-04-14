<script lang="ts">
	export let title: string = '';
</script>

<div class="bg-background flex h-screen flex-col items-center justify-center text-white">
	{#if title}
		<h2 class="font-futuristic text-primary text-3xl">{title}</h2>
	{/if}
	<slot />
</div>
