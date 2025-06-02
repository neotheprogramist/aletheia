<!-- 1. Definicja typu w module’owym kontekście -->
<script context="module" lang="ts">
	export type Option = {
		label: string;
		value: string;
		isFirst?: boolean;
		isLast?: boolean;
	};
</script>

<!-- 2. Główny skrypt komponentu -->
<script lang="ts">
	import { Redo } from 'lucide-svelte';

	// Options to display
	export let options: Option[] = [];
	export let selected: string = '';
	// Callback while selected
	export let onChange: (value: string) => void = () => {};
	// Callback after reset
	export let onReset: () => void = () => {};

	function selectMode(value: string) {
		onChange(value);
	}
</script>

<!-- 3. Szablon komponentu -->
<div class="mb-6 flex items-center justify-between">
	<div class="inline-flex">
		{#each options as opt, i}
			<button
				class="
          px-4 py-2
          {opt.isFirst ? 'rounded-l-md' : ''}
          {opt.isLast ? 'rounded-r-md' : ''}
          {selected === opt.value ? 'bg-blue-400 text-white' : 'bg-gray-100 text-gray-700'}
          {i > 0 && !opt.isLast ? '-ml-px' : ''}
        "
				on:click={() => selectMode(opt.value)}
			>
				{opt.label}
			</button>
		{/each}
	</div>

	<button
		on:click={onReset}
		title="Reset selections"
		class="rounded-full p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
	>
		<Redo size="20" />
	</button>
</div>
