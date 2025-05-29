<script lang="ts" context="module">
	// Column type
	export type Column<T> = {
		label: string;
		field: string | ((row: T) => any);
		render?: (row: T) => string;
	};
</script>

<script lang="ts">
	export let items: any[] = [];
	export let columns: Column<any>[] = [];
	export let pageSize = 10;
	export let keyField: string;
	export let disabledKeys: number[] = [];
	export let onRowClick: (idx: number) => void = () => {};

	// style props
	export let activeKey: number | null = null;
	export let inactiveKeys: number[] = [];
	export let hoverClass = 'hover:bg-emerald-800';

	// **Sorting state**
	let sortField: string | ((row: any) => any) | null = null;
	let sortAsc = true;

	// Pagination state
	let currentPage = 1;
	$: totalPages = Math.ceil(sortedItems.length / pageSize);

	// 1️⃣ Reactive sortedItems
	$: sortedItems = sortField
		? [...items].sort((a, b) => {
				let aVal: any;
				let bVal: any;

				if (typeof sortField === 'string') {
					aVal = a[sortField];
					bVal = b[sortField];
				} else {
					// sortField is definitely a function here
					aVal = sortField!(a);
					bVal = sortField!(b);
				}

				// if both are strings that parse to numbers, compare numerically
				if (typeof aVal === 'string' && typeof bVal === 'string') {
					const na = parseFloat(aVal.replace(/[^0-9.\-]/g, ''));
					const nb = parseFloat(bVal.replace(/[^0-9.\-]/g, ''));
					if (!isNaN(na) && !isNaN(nb)) {
						aVal = na;
						bVal = nb;
					}
				}

				if (aVal < bVal) return sortAsc ? -1 : 1;
				if (aVal > bVal) return sortAsc ? 1 : -1;
				return 0;
			})
		: items;

	// 2️⃣ Paginated slice of sortedItems
	$: paginatedItems = sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

	function selectPage(page: number) {
		if (page < 1 || page > totalPages) return;
		currentPage = page;
	}

	function handleRowClick(_item: any, localIdx: number) {
		const globalIndex = (currentPage - 1) * pageSize + localIdx;
		if (disabledKeys.includes(globalIndex)) return;
		onRowClick(globalIndex);
	}

	// 3️⃣ header click handler
	function handleHeaderClick(col: Column<any>) {
		const field = col.field;
		if (sortField === field) {
			// toggle direction
			sortAsc = !sortAsc;
		} else {
			sortField = field;
			sortAsc = true;
		}
		currentPage = 1;
	}
</script>

<table class="w-full table-auto border border-gray-300 font-mono">
	<thead class="border-b border-gray-300">
		<tr>
			{#each columns as col}
				<th
					class="cursor-pointer px-2 py-1 text-left select-none"
					on:click={() => handleHeaderClick(col)}
				>
					<span class="inline-flex items-center">
						{col.label}
						{#if sortField === col.field}
							<span class="ml-1 text-xs">
								{sortAsc ? '▲' : '▼'}
							</span>
						{/if}
					</span>
				</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each paginatedItems as item, idx (item[keyField])}
			<tr
				on:click={() => handleRowClick(item, idx)}
				class={item[keyField] === activeKey
					? 'bg-green-800 text-white'
					: inactiveKeys.includes(item[keyField])
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
		class="rounded px-2 py-1 hover:bg-gray-400 disabled:opacity-50"
		on:click={() => selectPage(currentPage - 1)}
		disabled={currentPage === 1}
	>
		◀ Prev
	</button>

	<button class="rounded px-2 py-1 hover:bg-gray-400" on:click={() => selectPage(1)}> 1 </button>

	{#if totalPages > 1}
		<span class="px-2">…</span>
		<button class="rounded px-2 py-1 hover:bg-gray-400" on:click={() => selectPage(totalPages)}>
			{totalPages}
		</button>
	{/if}

	<button
		class="rounded px-2 py-1 hover:bg-gray-400 disabled:opacity-50"
		on:click={() => selectPage(currentPage + 1)}
		disabled={currentPage === totalPages}
	>
		Next ▶
	</button>
</div>
