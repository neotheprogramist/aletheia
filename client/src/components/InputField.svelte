<script lang="ts">
	export let type: string = 'text';
	export let placeholder: string = '';
	export let value: string = '';
	export let onInput: (e: Event) => void = () => {};
	export let customClass: string = '';
</script>

<input
	{type}
	bind:value
	{placeholder}
	on:input={onInput}
	class={`mt-4 w-full max-w-md rounded-lg bg-white p-3 text-black shadow-md focus:outline-none ${customClass}`}
/>
