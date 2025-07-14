<script lang="ts" context="module">
	import type { Component } from 'svelte';

	/**
	 * Column<T> describes a single data-column in the table.
	 * - `label`: header text for that column.
	 * - `field`: either
	 *     • a string key, e.g. "index", meaning “render row[index]”, or
	 *     • a function (row => some derived value).
	 * - `render`: optional function returning raw HTML for custom cell content.
	 */
	export type Column<T> = {
		label: string;
		field?: string | ((row: T) => any);
		render?: (row: T) => string;
	};

	/**
	 * RowAction<T> lets you append an icon button at the end of each row.
	 * - `icon`: any Svelte component class (e.g. `Copy` or `Trash2` from lucide-svelte).
	 *           In Svelte 5, we type it as `Component<any>`.
	 * - `handler`: function called with the row’s data object when the icon is clicked.
	 * - `title`: tooltip text (shown on hover).
	 */
	export interface RowAction<T> {
		icon: Component<any>;
		handler: (row: T) => void;
		title: string;
	}
</script>

<script lang="ts">
	/** The list of data rows to display. */
	export let items: any[] = [];
	/** Definitions for each data column. */
	export let columns: Column<any>[] = [];
	/** How many rows to show per page. */
	export let pageSize = 10;
	/** Unique key field name in each row object (e.g. "index"). */
	export let keyField: string;
	/** If you want certain rows to be non-clickable by their global index. */
	export let disabledKeys: number[] = [];
	/** Callback fired when a row is clicked; receives that row’s global index. */
	export let onRowClick: (idx: number) => void = () => {};

	/** List of per-row icon buttons to render at the end of each row. */
	export let rowActions: RowAction<any>[] = [];

	// Optional styling props:
	export let activeKey: number | null = null;
	export let inactiveKeys: number[] = [];
	export let hoverClass = '';

	// === Sorting state ===
	let sortField: string | ((row: any) => any) | null = null;
	let sortAsc = true;

	// === Pagination state ===
	let currentPage = 1;
	$: totalPages = Math.ceil(sortedItems.length / pageSize);

	// 1) Compute `sortedItems` whenever `items` / `sortField` / `sortAsc` change
	$: sortedItems = sortField
		? [...items].sort((a, b) => {
				let aVal: any, bVal: any;
				if (typeof sortField === 'string') {
					aVal = a[sortField];
					bVal = b[sortField];
				} else {
					aVal = sortField!(a);
					bVal = sortField!(b);
				}

				// If both values look like numeric strings, compare numerically
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

	// 2) Slice out only the rows for the current page
	$: paginatedItems = sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

	/** Change pages (clamp to 1..totalPages). */
	function selectPage(page: number) {
		if (page < 1 || page > totalPages) return;
		currentPage = page;
	}

	/**
	 * When a row is clicked:
	 * • find the correct global index in the original items array, then
	 * • call `onRowClick(globalIndex)` unless that index is disabled.
	 */
	function handleRowClick(item: any, _localIdx: number) {
		// Find the correct global index in the original items array
		const globalIndex = items.findIndex(origItem => origItem[keyField] === item[keyField]);
		if (globalIndex === -1 || disabledKeys.includes(globalIndex)) return;
		onRowClick(globalIndex);
	}

	/**
	 * When a column header is clicked:
	 * • if it’s already the current sortField, flip sortAsc;
	 * • otherwise set sortField = col.field and default to ascending.
	 * Then reset to page 1.
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
					<span class="inline-flex items-center gap-1">
						{col.label}
						{#if sortField === col.field}
							{#if sortAsc}
								<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/>
								</svg>
							{:else}
								<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
								</svg>
							{/if}
						{:else}
							<svg class="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
								<path d="M5 12a1 1 0 102 0V6.414l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L5 6.414V12zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z"/>
							</svg>
						{/if}
					</span>
				</th>
			{/each}

			{#if rowActions.length}
				{#each rowActions as _action}
					<!-- Reserve one empty header cell per action column -->
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

				<!-- Render each row action button -->
				{#each rowActions as action}
					<td class="px-2 py-1 text-center">
						<button
							class="cursor-pointer p-1 hover:text-gray-600"
							title={action.title}
							on:click={() => action.handler(item)}
						>
							<!-- Dynamically render whatever Svelte component is passed to `action.icon` -->
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
