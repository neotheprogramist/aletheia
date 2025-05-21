<script lang="ts">
	export let title: string = '';
	export let class_: string = '';
</script>

<div class="card w-full max-w-md rounded-lg p-6 shadow-md {class_}">
	{#if title}
		<h2 class="text-primary mb-4 text-center text-lg font-bold">{title}</h2>
	{/if}
	<slot />
</div>
