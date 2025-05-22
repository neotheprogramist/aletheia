<script lang="ts" context="module">
	export type Column<T> = {
		label: string;
		field: string | ((row: T) => any);
		render?: (row: T) => string;
	};
</script>

<script lang="ts">
	export let items: any[] = [];
	export let columns: Column<any>[] = [];
	export let pageSize: number = 10;
	export let keyField: string;
	export let disabledIndexes: number[] = [];
	export let onRowClick: (idx: number) => void = () => {};

	// style props
	export let activeIndex: number | null = null;
	export let inactiveIndex: number | null = null;
	export let hoverClass: string = 'hover:bg-emerald-800';

	let currentPage = 1;
	$: totalPages = Math.ceil(items.length / pageSize);
	$: paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

	function selectPage(page: number) {
		if (page < 1 || page > totalPages) return;
		currentPage = page;
	}

	function handleRowClick(_item: any, localIdx: number) {
		const globalIndex = (currentPage - 1) * pageSize + localIdx;
		if (disabledIndexes.includes(globalIndex)) return;
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
				class={(currentPage - 1) * pageSize + idx === activeIndex
					? 'bg-green-800 text-white'
					: (currentPage - 1) * pageSize + idx === inactiveIndex
						? 'pointer-events-none bg-red-300 text-red-900'
						: `cursor-pointer ${hoverClass}`}
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

<div class="mt-2 flex items-center justify-center gap-2 font-mono">
	<button
		class="rounded border px-2 py-1 hover:bg-gray-100 disabled:opacity-50"
		on:click={() => selectPage(currentPage - 1)}
		disabled={currentPage === 1}
	>
		◀ Prev
	</button>

	<button class="rounded border px-2 py-1 hover:bg-gray-100" on:click={() => selectPage(1)}>
		1
	</button>

	{#if totalPages > 1}
		<span class="px-2">…</span>
		<button
			class="rounded border px-2 py-1 hover:bg-gray-100"
			on:click={() => selectPage(totalPages)}
		>
			{totalPages}
		</button>
	{/if}

	<button
		class="rounded border px-2 py-1 hover:bg-gray-100 disabled:opacity-50"
		on:click={() => selectPage(currentPage + 1)}
		disabled={currentPage === totalPages}
	>
		Next ▶
	</button>
</div>
