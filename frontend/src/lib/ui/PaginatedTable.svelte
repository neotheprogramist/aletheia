<script lang="ts" context="module">
	// Column type in module context
	export type Column<T> = {
		label: string;
		field: string | ((row: T) => any);
		render?: (row: T) => string;
	};
</script>

<script lang="ts">
	// Props
	export let items: any[] = [];
	export let columns: Column<any>[] = [];
	export let pageSize: number = 10;
	export let keyField: string;
	export let disabledIndexes: number[] = [];
	export let onRowClick: (idx: number) => void = () => {};

	let currentPage = 1;
	$: totalPages = Math.ceil(items.length / pageSize);
	$: paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

	function selectPage(page: number) {
		currentPage = page;
	}

	function handleRowClick(_item: any, localIdx: number) {
		const globalIndex = (currentPage - 1) * pageSize + localIdx;
		if (disabledIndexes.includes(globalIndex)) return;
		// Call the callback prop
		onRowClick(globalIndex);
	}
</script>

<table class="w-full table-auto border border-gray-300 font-mono">
	<thead class="border-b border-gray-300">
		<tr>
			{#each columns as col}
				<th class="px-2 py-1 text-left">{col.label}</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each paginatedItems as item, idx (item[keyField])}
			<tr
				on:click={() => handleRowClick(item, idx)}
				class={disabledIndexes.includes((currentPage - 1) * pageSize + idx)
					? 'pointer-events-none opacity-50'
					: 'cursor-pointer hover:bg-emerald-800'}
			>
				{#each columns as col}
					<td class="border-b border-gray-300 px-2 py-1">
						{#if typeof col.field === 'string'}
							{item[col.field]}
						{:else}
							{col.field(item)}
						{/if}
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

<div class="mt-2 flex justify-center gap-1 font-mono">
	{#each Array(totalPages) as _, i}
		<button
			class="rounded border border-gray-300 px-2 py-1 {currentPage === i + 1
				? 'bg-gray-700 text-white'
				: 'bg-white'}"
			on:click={() => selectPage(i + 1)}
		>
			{i + 1}
		</button>
	{/each}
</div>
