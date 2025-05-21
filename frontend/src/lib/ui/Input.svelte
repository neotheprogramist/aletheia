<script lang="ts">
	export let placeholder: string = 'Type...';
	export let type: string = 'text';
	export let value: string = '';
	export let class_: string = '';
</script>

<input
	class={`input w-full rounded p-2  ${class_}`}
	{type}
	bind:value
	{placeholder}
	{...$$restProps}
/>
