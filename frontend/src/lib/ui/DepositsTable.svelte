<script lang="ts">
	import { Search, Eye, EyeOff, Filter, RefreshCw, ArrowUpDown, Wallet, Clock, DollarSign, Hash, Activity } from 'lucide-svelte';
	import { writable } from 'svelte/store';
	import type { DisplayOperation } from '$lib/utils/loadDepositsForToken';
	import { t } from '$lib/i18n';

	export let deposits: DisplayOperation[] = [];
	export let title: string = 'Available Deposits';
	export let selectedKey: number | null = null;
	export let disabledKeys: number[] = [];
	export let onRowClick: (index: number) => void = () => {};
	export let loading: boolean = false;
	export let showSearch: boolean = true;
	export let showFilters: boolean = true;
	export let showDetails: boolean = false;
	export let pageSize: number = 10;

	// Local state
	let searchTerm = '';
	let currentPage = 0;
	let sortColumn = 'date';
	let sortDirection: 'asc' | 'desc' = 'desc';
	let showDetails = false;

	// Computed values
	$: filteredDeposits = deposits.filter(deposit => {
		if (!searchTerm) return true;
		return (
			deposit.displayAmount.toLowerCase().includes(searchTerm.toLowerCase()) ||
			deposit.data.tokenAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
			deposit.hash.toLowerCase().includes(searchTerm.toLowerCase())
		);
	});

	$: sortedDeposits = [...filteredDeposits].sort((a, b) => {
		let aVal, bVal;
		switch (sortColumn) {
			case 'amount':
				aVal = parseFloat(a.displayAmount);
				bVal = parseFloat(b.displayAmount);
				break;
			case 'date':
				aVal = new Date(a.date).getTime();
				bVal = new Date(b.date).getTime();
				break;
			case 'token':
				aVal = a.data.tokenAddress;
				bVal = b.data.tokenAddress;
				break;
			default:
				aVal = a.date;
				bVal = b.date;
		}
		
		if (sortDirection === 'asc') {
			return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
		} else {
			return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
		}
	});

	$: paginatedDeposits = sortedDeposits.slice(
		currentPage * pageSize,
		(currentPage + 1) * pageSize
	);

	$: totalPages = Math.ceil(sortedDeposits.length / pageSize);

	function handleSort(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'desc';
		}
	}

	function formatHash(hash: string) {
		return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getTokenSymbol(address: string) {
		// This is a simplified version - you might want to expand this
		if (address.toLowerCase().includes('strk')) return 'STRK';
		if (address.toLowerCase().includes('eth')) return 'ETH';
		if (address.toLowerCase().includes('usdc')) return 'USDC';
		return 'TOKEN';
	}

	function isRowDisabled(index: number) {
		return disabledKeys.includes(index);
	}

	function isRowSelected(index: number) {
		return selectedKey === index;
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<div class="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
				<Wallet class="w-5 h-5" />
			</div>
			<h2 class="text-2xl font-bold text-text">{title}</h2>
			{#if deposits.length > 0}
				<div class="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-full text-sm font-medium text-blue-700 dark:text-blue-300">
					{deposits.length} {deposits.length === 1 ? 'deposit' : 'deposits'}
				</div>
			{/if}
		</div>
		
		<div class="flex items-center gap-2">
			{#if showFilters}
				<button
					class="p-2 text-text-secondary hover:text-primary hover:bg-surface rounded-lg transition-all duration-200"
					on:click={() => showDetails = !showDetails}
					title="Toggle details view"
				>
					{#if showDetails}
						<EyeOff class="w-4 h-4" />
					{:else}
						<Eye class="w-4 h-4" />
					{/if}
				</button>
			{/if}
			
			<button
				class="p-2 text-text-secondary hover:text-primary hover:bg-surface rounded-lg transition-all duration-200"
				title="Refresh deposits"
				disabled={loading}
			>
				<RefreshCw class="w-4 h-4 {loading ? 'animate-spin' : ''}" />
			</button>
		</div>
	</div>

	<!-- Search and Filters -->
	{#if showSearch && deposits.length > 0}
		<div class="flex flex-col sm:flex-row gap-4">
			<div class="flex-1 relative">
				<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-secondary" />
				<input
					type="text"
					bind:value={searchTerm}
					placeholder="Search by amount, token, or hash..."
					class="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-surface text-text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
				/>
			</div>
			
			<div class="flex items-center gap-2">
				<span class="text-sm text-text-secondary">
					{sortedDeposits.length} of {deposits.length} deposits
				</span>
			</div>
		</div>
	{/if}

	<!-- Table -->
	<div class="bg-card border border-border rounded-xl overflow-hidden shadow-xl">
		{#if loading}
			<div class="p-8 text-center">
				<RefreshCw class="w-8 h-8 mx-auto mb-4 text-text-secondary animate-spin" />
				<p class="text-text-secondary">Loading deposits...</p>
			</div>
		{:else if paginatedDeposits.length === 0}
			<div class="p-12 text-center">
				<div class="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
					<Wallet class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-text mb-2">
					{searchTerm ? 'No matching deposits' : 'No deposits found'}
				</h3>
				<p class="text-text-secondary">
					{searchTerm ? 'Try adjusting your search terms' : 'Make a deposit to get started!'}
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-surface border-b border-border">
						<tr>
							<th class="px-6 py-4 text-left">
								<button
									class="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-primary transition-colors"
									on:click={() => handleSort('amount')}
								>
									<DollarSign class="w-4 h-4" />
									Amount
									<ArrowUpDown class="w-3 h-3" />
								</button>
							</th>
							<th class="px-6 py-4 text-left">
								<button
									class="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-primary transition-colors"
									on:click={() => handleSort('token')}
								>
									<Activity class="w-4 h-4" />
									Token
									<ArrowUpDown class="w-3 h-3" />
								</button>
							</th>
							<th class="px-6 py-4 text-left">
								<button
									class="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-primary transition-colors"
									on:click={() => handleSort('date')}
								>
									<Clock class="w-4 h-4" />
									Date
									<ArrowUpDown class="w-3 h-3" />
								</button>
							</th>
							{#if showDetails}
								<th class="px-6 py-4 text-left">
									<div class="flex items-center gap-2 text-sm font-semibold text-text-secondary">
										<Hash class="w-4 h-4" />
										Hash
									</div>
								</th>
							{/if}
							<th class="px-6 py-4 text-left">
								<div class="flex items-center gap-2 text-sm font-semibold text-text-secondary">
									Status
								</div>
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each paginatedDeposits as deposit, index}
							<tr
								class="group cursor-pointer transition-all duration-200 hover:bg-surface
									{isRowSelected(deposit.index) ? 'bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 ring-2 ring-primary/20' : ''}
									{isRowDisabled(deposit.index) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.01] hover:shadow-lg'}"
								on:click={() => !isRowDisabled(deposit.index) && onRowClick(currentPage * pageSize + index)}
								on:keydown={(e) => {
									if (e.key === 'Enter' && !isRowDisabled(deposit.index)) {
										onRowClick(currentPage * pageSize + index);
									}
								}}
								tabindex="0"
								role="button"
							>
								<td class="px-6 py-4">
									<div class="flex items-center gap-3">
										<div class="p-2 rounded-lg bg-gradient-to-br from-green-400 to-blue-500 text-white">
											<DollarSign class="w-4 h-4" />
										</div>
										<div>
											<div class="font-semibold text-text group-hover:text-primary transition-colors">
												{deposit.displayAmount}
											</div>
											<div class="text-xs text-text-secondary">
												{getTokenSymbol(deposit.data.tokenAddress)}
											</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4">
									<div class="flex items-center gap-2">
										<div class="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
											{getTokenSymbol(deposit.data.tokenAddress)[0]}
										</div>
										<span class="text-sm font-medium text-text">
											{getTokenSymbol(deposit.data.tokenAddress)}
										</span>
									</div>
								</td>
								<td class="px-6 py-4">
									<div class="text-sm text-text">
										{formatDate(deposit.date)}
									</div>
								</td>
								{#if showDetails}
									<td class="px-6 py-4">
										<div class="font-mono text-xs text-text-secondary bg-surface px-2 py-1 rounded border">
											{formatHash(deposit.hash)}
										</div>
									</td>
								{/if}
								<td class="px-6 py-4">
									<div class="flex items-center gap-2">
										{#if isRowSelected(deposit.index)}
											<div class="px-2 py-1 bg-primary text-white text-xs font-medium rounded-full">
												Selected
											</div>
										{:else if isRowDisabled(deposit.index)}
											<div class="px-2 py-1 bg-gray-300 text-gray-600 text-xs font-medium rounded-full">
												Disabled
											</div>
										{:else}
											<div class="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium rounded-full">
												Available
											</div>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="px-6 py-4 bg-surface border-t border-border flex items-center justify-between">
					<div class="text-sm text-text-secondary">
						Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, sortedDeposits.length)} of {sortedDeposits.length} deposits
					</div>
					<div class="flex items-center gap-2">
						<button
							class="px-3 py-1 rounded-lg bg-card border border-border text-text-secondary hover:text-primary hover:bg-surface transition-all duration-200 disabled:opacity-50"
							disabled={currentPage === 0}
							on:click={() => currentPage = currentPage - 1}
						>
							Previous
						</button>
						<div class="flex items-center gap-1">
							{#each Array(totalPages) as _, i}
								<button
									class="w-8 h-8 rounded-lg text-sm font-medium transition-all duration-200
										{currentPage === i ? 'bg-primary text-white' : 'text-text-secondary hover:text-primary hover:bg-surface'}"
									on:click={() => currentPage = i}
								>
									{i + 1}
								</button>
							{/each}
						</div>
						<button
							class="px-3 py-1 rounded-lg bg-card border border-border text-text-secondary hover:text-primary hover:bg-surface transition-all duration-200 disabled:opacity-50"
							disabled={currentPage === totalPages - 1}
							on:click={() => currentPage = currentPage + 1}
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>