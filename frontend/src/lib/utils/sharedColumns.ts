import type { Column } from '$lib/ui/PaginatedTable.svelte';
import type { DisplayOperation, DisplayPendingEmptyOperation } from './loadDepositsForToken';

export const defaultDepositColumns: Column<DisplayOperation>[] = [
	{ label: 'Index', field: 'index' },
	{ label: 'Amount', field: (d) => d.displayAmount }
];

export const defaultPendingDepositColumns: Column<DisplayPendingEmptyOperation>[] = [
	{ label: 'Index', field: 'index' },
	{ label: 'Hash', field: 'shortHex' }
];
