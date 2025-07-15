import type { Column } from '$lib/ui/PaginatedTable.svelte';
import type { DisplayOperation, DisplayPendingEmptyOperation } from './loadDepositsForToken';
import { supportedTokens } from '$lib/config/tokens';

export const defaultDepositColumns: Column<DisplayOperation>[] = [
	{ label: 'Index', field: 'index' },
	{ label: 'Amount', field: (d) => d.displayAmount }
];

export const createElegantDepositColumns = (
	selectedWithdrawKey: number | null = null,
	selectedFeeKey: number | null = null,
	selectedMerge2Key: number | null = null,
	pageType: 'withdraw' | 'merge' | 'transfer' | 'swap' = 'withdraw',
	translations?: {
		available: string;
		operation: string;
		fee: string;
		merge1: string;
		merge2: string;
		transfer: string;
		swap: string;
		clickToUnselect: string;
		clickToChangeFee: string;
	}
): Column<DisplayOperation>[] => [
	{ 
		label: 'Deposit', 
		field: (deposit) => {
			// Extract numeric value for sorting
			const amount = parseFloat(deposit.displayAmount.replace(/[^0-9.-]/g, ''));
			return amount;
		},
		render: (deposit) => {
			const tokenConfig = supportedTokens.find(t => t.address === deposit.data.tokenAddress);
			const tokenSymbol = tokenConfig?.symbol || deposit.data.tokenAddress.slice(0, 6);
			const logoPath = tokenConfig?.logoPath || '/tokens/default.png';
			
			let statusDot = 'bg-green-500';
			let statusText = translations?.available || 'Available';
			let statusTextColor = 'text-green-600 dark:text-green-400';
			let borderColor = 'border-gray-200 dark:border-gray-600';
			
			if (deposit.index === selectedWithdrawKey) {
				statusDot = 'bg-purple-500';
				statusText = pageType === 'merge' ? (translations?.merge1 || 'Merge 1') : pageType === 'transfer' ? (translations?.transfer || 'Transfer') : pageType === 'swap' ? (translations?.swap || 'Swap') : (translations?.operation || 'Operation');
				statusTextColor = 'text-purple-600 dark:text-purple-400';
				borderColor = 'border-purple-300 dark:border-purple-500';
			} else if (deposit.index === selectedMerge2Key) {
				statusDot = 'bg-orange-500';
				statusText = translations?.merge2 || 'Merge 2';
				statusTextColor = 'text-orange-600 dark:text-orange-400';
				borderColor = 'border-orange-300 dark:border-orange-500';
			} else if (deposit.index === selectedFeeKey) {
				statusDot = 'bg-blue-500';
				statusText = translations?.fee || 'Fee';
				statusTextColor = 'text-blue-600 dark:text-blue-400';
				borderColor = 'border-blue-300 dark:border-blue-500';
			}
			
			let clickHint = '';
			if (deposit.index === selectedWithdrawKey) {
				clickHint = `<div class="text-xs text-gray-400 mt-0.5">${translations?.clickToUnselect || 'Click to unselect'}</div>`;
			} else if (deposit.index === selectedMerge2Key) {
				clickHint = `<div class="text-xs text-gray-400 mt-0.5">${translations?.clickToUnselect || 'Click to unselect'}</div>`;
			} else if (deposit.index === selectedFeeKey) {
				clickHint = `<div class="text-xs text-gray-400 mt-0.5">${translations?.clickToChangeFee || 'Click to change fee'}</div>`;
			}

			return `
				<div class="flex items-center gap-3 py-1">
					<div class="relative">
						<img src="${logoPath}" alt="${tokenSymbol}" class="w-8 h-8 rounded-full border ${borderColor}" />
						${statusText !== 'Available' ? `<div class="absolute -top-1 -right-1 w-3 h-3 ${statusDot} rounded-full border border-white dark:border-gray-800"></div>` : ''}
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-baseline gap-1">
							<span class="font-semibold text-gray-900 dark:text-gray-100">${deposit.displayAmount}</span>
							<span class="text-sm text-gray-500 dark:text-gray-400">${tokenSymbol}</span>
						</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">#${deposit.index}</div>
					</div>
					<div class="flex flex-col items-end">
						<div class="flex items-center gap-1">
							<div class="w-1.5 h-1.5 rounded-full ${statusDot}"></div>
							<span class="text-xs ${statusTextColor} font-medium">${statusText}</span>
						</div>
						${clickHint}
					</div>
				</div>
			`;
		}
	}
];

export const elegantDepositColumns: Column<DisplayOperation>[] = createElegantDepositColumns();

export const defaultPendingDepositColumns: Column<DisplayPendingEmptyOperation>[] = [
	{ label: 'Index', field: 'index' },
	{ label: 'Hash', field: 'shortHex' }
];
