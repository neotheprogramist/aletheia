<script lang="ts">
	export let type: string = 'text';
	export let placeholder: string = '';
	export let value: string = '';
	export let onInput: (e: Event) => void = () => {};
	export let customClass: string = '';
</script>

<input {type} {placeholder} bind:value on:input={onInput} class={`input ${customClass}`} />
