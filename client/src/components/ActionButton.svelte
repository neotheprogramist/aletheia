<script lang="ts">
	export let onClick: () => void;
	export let disabled: boolean = false;
	export let customClass: string = '';
</script>

<button
	on:click={onClick}
	{disabled}
	class={`bg-primary shadow-neon rounded-xl px-6 py-3 text-black transition-transform duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 ${customClass}`}
>
	<slot />
</button>
