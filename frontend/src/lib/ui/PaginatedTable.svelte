<script lang="ts" context="module">
	import type { ComponentType } from 'svelte';

	/**
	 * Column<T> describes a single data‐column in the table.
	 * - `label`: header text for that column.
	 * - `field`: either a string key (row[field]) or a function returning a value.
	 * - `render`: optional function returning raw HTML for custom cell rendering.
	 */
	export type Column<T> = {
		label: string;
		field?: string | ((row: T) => any);
		render?: (row: T) => string;
	};

	/**
	 * RowAction<T> allows you to append an icon button at the end of each row.
	 * - `icon`: any Svelte component (e.g. Copy or Trash2 from lucide-svelte).
	 * - `handler`: function that will be called with the row data when clicked.
	 * - `title`: tooltip text for accessibility (hover).
	 */
	export interface RowAction<T> {
		// ComponentType<any> means “some Svelte component” without specifying exact props.
		icon: ComponentType<any>;
		handler: (row: T) => void;
		title: string;
	}
</script>

<script lang="ts">
	/** The array of row‐objects to display */
	export let items: any[] = [];
	/** Definitions for each data‐column */
	export let columns: Column<any>[] = [];
	/** How many rows per page */
	export let pageSize = 10;
	/** Unique key field name in each row object (e.g. "index") */
	export let keyField: string;
	/** If certain rows should be non-clickable (by their global index) */
	export let disabledKeys: number[] = [];
	/** Optional callback when a row is clicked; receives global index */
	export let onRowClick: (idx: number) => void = () => {};

	/** If you want to append icon‐buttons to each row, pass them here */
	export let rowActions: RowAction<any>[] = [];

	// Optional styling props
	export let activeKey: number | null = null;
	export let inactiveKeys: number[] = [];
	export let hoverClass = '';

	// ===== SORTING STATE =====
	let sortField: string | ((row: any) => any) | null = null;
	let sortAsc = true;

	// ===== PAGINATION STATE =====
	let currentPage = 1;
	$: totalPages = Math.ceil(sortedItems.length / pageSize);

	// 1️⃣ Compute sorted items whenever items / sortField / sortAsc change
	$: sortedItems = sortField
		? [...items].sort((a, b) => {
				let aVal: any;
				let bVal: any;

				if (typeof sortField === 'string') {
					aVal = a[sortField];
					bVal = b[sortField];
				} else {
					aVal = sortField!(a);
					bVal = sortField!(b);
				}

				// If both are numeric‐looking strings, compare numerically
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

	// 2️⃣ Slice out the current page
	$: paginatedItems = sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

	/** Change the page number, clamped to [1..totalPages] */
	function selectPage(page: number) {
		if (page < 1 || page > totalPages) return;
		currentPage = page;
	}

	/** Handle a row‐click by computing its global index and calling onRowClick,
	 * unless that index is in `disabledKeys`. */
	function handleRowClick(_item: any, localIdx: number) {
		const globalIndex = (currentPage - 1) * pageSize + localIdx;
		if (disabledKeys.includes(globalIndex)) return;
		onRowClick(globalIndex);
	}

	/**
	 * If you click a column header, update sortField / sortAsc and reset to page 1.
	 * If that field was already sorted, flip the direction.
	 */
	function handleHeaderClick(col: Column<any>) {
		const field = col.field;
		if (!field) return;
		if (sortField === field) {
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
							<span class="ml-1 text-xs">{sortAsc ? '▲' : '▼'}</span>
						{/if}
					</span>
				</th>
			{/each}

			{#if rowActions.length}
				{#each rowActions as _action}
					<!-- One empty header cell for each action column -->
					<th class="px-2 py-1 text-left select-none"></th>
				{/each}
			{/if}
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
				<!-- Render each data column -->
				{#each columns as col}
					<td class="px-2 py-1">
						{#if col.render}
							{@html col.render(item)}
						{:else if typeof col.field === 'string'}
							{item[col.field]}
						{:else if typeof col.field === 'function'}
							{col.field(item)}
						{/if}
					</td>
				{/each}

				<!-- Render each row action icon inside a button -->
				{#each rowActions as action}
					<td class="px-2 py-1 text-center">
						<button
							class="cursor-pointer p-1 hover:text-gray-600"
							title={action.title}
							on:click={() => action.handler(item)}
						>
							<svelte:component this={action.icon} />
						</button>
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
