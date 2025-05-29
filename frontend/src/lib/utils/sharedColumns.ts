import type { Column } from '$lib/ui/PaginatedTable.svelte';
import type { DisplayOperation } from './loadDepositsForToken';

export const defaultDepositColumns: Column<DisplayOperation>[] = [
	{ label: 'Index', field: 'index' },
	{ label: 'Amount', field: (d) => d.displayAmount }
];
