<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { AlertTriangle, DollarSign, ArrowRight, Info } from 'lucide-svelte';

	// Modal props
	export let show: boolean = false;
	export let requiredFeeAmount: string = '';
	export let closeOnOutsideClick: boolean = true;

	// Callback props
	export let onClose: () => void = () => {};

	function handleClose() {
		onClose();
	}

	function handleGoToDeposit() {
		
		// Calculate recommended amount BEFORE closing modal (which resets autoSelectedFeeInfo)
		const feeAmount = parseFloat(requiredFeeAmount);
		const withMargin = feeAmount * 1.1; // Add 10% margin
		
		// Round up to nice number for better UX
		let recommendedAmount: number;
		if (withMargin < 1) {
			recommendedAmount = Math.ceil(withMargin * 100) / 100; // Round to 0.01
		} else if (withMargin < 10) {
			recommendedAmount = Math.ceil(withMargin * 10) / 10; // Round to 0.1
		} else if (withMargin < 100) {
			recommendedAmount = Math.ceil(withMargin); // Round to 1
		} else {
			recommendedAmount = Math.ceil(withMargin / 10) * 10; // Round to 10
		}
		
		
		// Close modal AFTER calculating amount
		handleClose();
		
		// Navigate to deposit page
		goto(`/deposit?amount=${recommendedAmount}&token=STRK`);
	}

	function outsideClick(event: MouseEvent) {
		if (!closeOnOutsideClick) return;
		const dialog = document.getElementById('insufficient-fee-modal-dialog');
		if (dialog && !dialog.contains(event.target as Node)) {
			handleClose();
		}
	}

	onMount(() => {
		if (closeOnOutsideClick) document.addEventListener('mousedown', outsideClick);
		return () => {
			if (closeOnOutsideClick) document.removeEventListener('mousedown', outsideClick);
		};
	});
</script>

{#if show}
	<div class="fixed inset-0 z-50 flex items-center justify-center">
		<div class="fixed inset-0 bg-black opacity-50"></div>
		<div
			id="insufficient-fee-modal-dialog"
			class="z-60 w-full max-w-lg rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800"
		>
			<!-- Header -->
			<div class="mb-4 flex items-center gap-3">
				<div class="rounded-full bg-red-100 p-2 dark:bg-red-900/20">
					<AlertTriangle class="h-6 w-6 text-red-600 dark:text-red-400" />
				</div>
				<h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">
					{$t('common.insufficient_fee_deposit', { default: 'Insufficient Fee Deposit' })}
				</h2>
			</div>

			<!-- Content -->
			<div class="mb-6 space-y-4">
				<!-- Problem description -->
				<div class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
					<div class="flex items-start gap-3">
						<DollarSign class="mt-0.5 h-5 w-5 text-red-600 dark:text-red-400" />
						<div>
							<h3 class="font-semibold text-red-800 dark:text-red-300">
								{$t('common.fee_payment_required', { default: 'Fee Payment Required' })}
							</h3>
							<p class="mt-1 text-sm text-red-700 dark:text-red-300">
								{$t('common.insufficient_strk_balance', { 
									default: `You need at least ${requiredFeeAmount} STRK to pay for the network fee, but you don't have a suitable STRK deposit available to cover it.`
								})}
							</p>
						</div>
					</div>
				</div>

				<!-- How fees work -->
				<div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
					<div class="flex items-start gap-3">
						<Info class="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
						<div>
							<h3 class="font-semibold text-blue-800 dark:text-blue-300">
								{$t('common.how_fees_work', { default: 'How Fees Work' })}
							</h3>
							<div class="mt-2 space-y-2 text-sm text-blue-700 dark:text-blue-300">
								<p>
									{$t('common.fee_explanation_1', { default: 'All network fees are automatically paid using your STRK deposits to maintain transaction privacy.' })}
								</p>
								<p>
									{$t('common.fee_explanation_2', { default: 'You need to have a single STRK deposit with sufficient balance to cover the entire network fee for the operation.' })}
								</p>
								<p>
									{$t('common.fee_explanation_3', { default: 'Make a STRK deposit of at least the required amount, then return to complete your transaction.' })}
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Solution -->
				<div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
					<div class="flex items-start gap-3">
						<ArrowRight class="mt-0.5 h-5 w-5 text-green-600 dark:text-green-400" />
						<div>
							<h3 class="font-semibold text-green-800 dark:text-green-300">
								{$t('common.next_steps', { default: 'Next Steps' })}
							</h3>
							<p class="mt-1 text-sm text-green-700 dark:text-green-300">
								{$t('common.deposit_strk_instructions', { 
									default: `Go to the deposit page and make a STRK deposit of at least ${requiredFeeAmount} STRK to cover the withdrawal fee.`
								})}
							</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex justify-end space-x-3">
				<button
					class="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
					on:click={handleClose}
				>
					{$t('common.close', { default: 'Close' })}
				</button>
				<button
					class="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-white hover:from-purple-600 hover:to-pink-600"
					on:click={handleGoToDeposit}
				>
					<DollarSign class="h-4 w-4" />
					{$t('common.go_to_deposit', { default: 'Go to Deposit' })}
				</button>
			</div>
		</div>
	</div>
{/if}