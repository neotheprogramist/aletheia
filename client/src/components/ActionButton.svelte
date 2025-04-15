<script lang="ts">
	export let onClick: () => void;
	export let disabled: boolean = false;
	export let customClass: string = '';
</script>

<button
	on:click={onClick}
	{disabled}
	class={`button disabled:cursor-not-allowed disabled:opacity-50 ${customClass}`}
>
	<slot />
</button>
