<script lang="ts">
	export let title: string = '';
</script>

<div class="page-container">
	{#if title}
		<h2 class="page-title">{title}</h2>
	{/if}
	<slot />
</div>
