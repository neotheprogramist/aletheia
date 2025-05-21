<script lang="ts" context="module">
	export interface Column<T> {
		label: string;
		field: keyof T | ((item: T) => unknown);
		render?: (item: T) => string;
	}
</script>

<script lang="ts">
	type Item = Record<string, unknown>;

	export let items: Item[] = [];
	export let columns: Column<Item>[] = [];
	export let pageSize = 5;
	export let keyField: keyof Item = 'id';
	export let selectedKey: Item[keyof Item] | null = null;
	export let onSelect: (item: Item) => void = () => {};

	$: sortedItems = [...items].sort((a, b) => {
		const va = a[keyField];
		const vb = b[keyField];
		if (va == null) return 1;
		if (vb == null) return -1;
		return va < vb ? -1 : va > vb ? 1 : 0;
	});

	let page = 1;
	$: totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
	$: pagedItems = sortedItems.slice((page - 1) * pageSize, page * pageSize);
	$: emptyRows = Array.from({ length: pageSize - pagedItems.length }, (_v, i) => i);

	function prevPage() {
		if (page > 1) page--;
	}
	function nextPage() {
		if (page < totalPages) page++;
	}

	function select(row: Item) {
		selectedKey = row[keyField];
		onSelect(row);
	}
</script>

<div class="overflow-x-auto">
	<table class="divide-border w-full table-fixed divide-y">
		<colgroup>
			<col class="w-12" />
			<col class="w-16" />
			<col class="w-16" />
			<col />
		</colgroup>
		<thead>
			<tr class="bg-background-alt">
				<th></th>
				{#each columns as col (col.label)}
					<th class="px-3 py-2 text-left text-sm font-medium">
						{col.label}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody class="divide-border divide-y">
			{#each pagedItems as row (row[keyField] as string)}
				<tr
					class="hover:bg-accent-hover cursor-pointer {selectedKey === row[keyField]
						? 'bg-accent-selected'
						: ''}"
					on:click={() => select(row)}
				>
					<td class="px-3 py-2">
						<input
							type="radio"
							class="text-primary h-4 w-4"
							bind:group={selectedKey}
							value={row[keyField]}
							aria-label="Select row"
						/>
					</td>

					{#each columns as col (col.label)}
						<td class="px-3 py-2 text-sm">
							{#if col.render}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html col.render(row)}
							{:else}
								{typeof col.field === 'function'
									? (col.field as (item: Item) => unknown)(row)
									: (row[col.field] ?? '')}
							{/if}
						</td>
					{/each}
				</tr>
			{/each}

			{#if emptyRows.length}
				{#each emptyRows as idx (idx)}
					<tr class="h-12">
						<td colspan={columns.length + 1}>&nbsp;</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

<div class="mt-2 flex items-center justify-between text-sm">
	<button
		on:click={prevPage}
		disabled={page === 1}
		class="rounded px-2 py-1 disabled:opacity-50"
		type="button"
	>
		« Prev
	</button>
	<span>Page {page} / {totalPages}</span>
	<button
		on:click={nextPage}
		disabled={page === totalPages}
		class="rounded px-2 py-1 disabled:opacity-50"
		type="button"
	>
		Next »
	</button>
</div>
