<script lang="ts">
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import { wallet } from '$lib/stores/wallet';
	import { wrapWithToast } from '$lib/utils/toast';
	import { PUBLIC_ALETHEIA_CONTRACT_ADDRESS } from '$env/static/public';
	import { t } from '$lib/i18n';

	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import Tooltip from '$lib/ui/Tooltip.svelte';
	import WalletBalance from '$lib/ui/WalletBalance.svelte';
	import ProgressModal from '$lib/ui/ProgressModal.svelte';

	import { toLowHigh } from '$lib/utils/toLowHigh';
	import { toWei } from '$lib/utils/toWei';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { provider } from '$lib/stores/provider';
	import { operationsStore } from '$lib/stores/operations';
	import {
		progressModalStore,
		progressModalActions,
		depositProgressSteps
	} from '$lib/stores/progressModal';
	import { Shield, Zap, Lock, ArrowRight, DollarSign, CheckCircle } from 'lucide-svelte';

	let amount = '';
	let isLoading = false;

	// Handle URL parameters for pre-filling amount and token
	onMount(() => {
		const urlParams = $page.url.searchParams;
		const paramAmount = urlParams.get('amount');
		const paramToken = urlParams.get('token');
		
		if (paramAmount) {
			amount = paramAmount;
		}
		
		if (paramToken) {
			// Find token by symbol (e.g., 'STRK')
			const token = $tokens.find(t => t.symbol === paramToken);
			if (token) {
				selectedToken.set(token.address);
			}
		}
	});

	function createCalls(hash: string, amountWei: bigint) {
		const secretAndNullifierHash = BigInt(hash);
		const [amountLow, amountHigh] = toLowHigh(amountWei);
		const [hashLow, hashHigh] = toLowHigh(secretAndNullifierHash);

		return [
			{
				contract_address: $selectedToken,
				entry_point: 'approve',
				calldata: [PUBLIC_ALETHEIA_CONTRACT_ADDRESS, amountLow, amountHigh]
			},
			{
				contract_address: PUBLIC_ALETHEIA_CONTRACT_ADDRESS,
				entry_point: 'deposit',
				calldata: [hashLow, hashHigh, amountLow, amountHigh, $selectedToken]
			}
		];
	}

	async function depositHandler() {
		isLoading = true;
		let operationHash = '';

		progressModalActions.show($t('progress_modal.deposit.title'), [...depositProgressSteps($t)]);

		try {
			progressModalActions.updateStep('preparation', 'loading');
			const decimals = await fetchTokenDecimals($selectedToken);
			const amountWei = toWei(amount, decimals);
			const { hash } = await generateOperation({
				data: { tokenAddress: $selectedToken, amount: amountWei }
			});
			operationHash = hash;

			const calls = createCalls(hash, amountWei);
			progressModalActions.updateStep('preparation', 'completed');

			progressModalActions.updateStep('wallet-approval', 'loading');
			const connectedWallet = get(wallet);
			if (!connectedWallet) throw new Error('Please connect your wallet.');

			const { transaction_hash } = await connectedWallet.request({
				type: 'wallet_addInvokeTransaction',
				params: { calls }
			});
			progressModalActions.updateStep('wallet-approval', 'completed');

			progressModalActions.updateStep('onchain-confirmation', 'loading');
			const rpc = get(provider);
			if (!rpc) throw new Error('Missing Provider');

			const receipt = await rpc.waitForTransaction(BigInt(transaction_hash));

			if (receipt.isReverted()) {
				throw new Error('Transaction reverted: ${receipt.value}');
			} else if (!receipt.isSuccess()) {
				throw new Error('Transaction error: ${receipt.value}');
			}

			// Wait for IndexedDB confirmation using operationsStore subscription
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					unsubscribe();
					reject(new Error('Operation not confirmed in IndexedDB after 30 seconds'));
				}, 30000);

				const unsubscribe = operationsStore.subscribe(($operations) => {
					const operation = $operations.allOperations.find(op => op.hash === operationHash);
					if (operation && operation.status === 'confirmed') {
						clearTimeout(timeout);
						unsubscribe();
						resolve();
					}
				});
			});

			progressModalActions.updateStep('onchain-confirmation', 'completed');
			amount = '';

			setTimeout(() => {
				progressModalActions.hide();
			}, 2000);
		} catch (err) {
			console.warn('❌ Deposit failed with error:', err);

			const currentSteps = $progressModalStore.steps;
			const currentStepIndex = currentSteps.findIndex((step) => step.status === 'loading');
			if (currentStepIndex !== -1) {
				progressModalActions.updateStep(currentSteps[currentStepIndex].id, 'error');
			}

			if (operationHash) {
				try {
					await abortOperation(operationHash);
					console.warn('🧯 Aborted failed operation:', operationHash);
				} catch (abortError) {
					console.error('🚨 Failed to abort operation:', abortError);
				}
			}

			setTimeout(() => {
				progressModalActions.hide();
			}, 3000);
		}

		isLoading = false;
	}

	function setMaxAmount() {
		// Wait for next tick to ensure DOM is updated
		setTimeout(() => {
			const balanceElement = document.querySelector('[data-wallet-balance]');
			if (balanceElement?.textContent) {
				// Extract number from "Wallet Balance: 123.456 STRK" format
				const match = balanceElement.textContent.match(/Wallet Balance:\s*([\d.]+)/);
				if (match && match[1] && match[1] !== '0') {
					amount = match[1];
				}
			}
		}, 0);
	}
</script>

<ProtectedRoute>
	<div
		class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
	>
		<div class="mx-auto max-w-6xl p-6 pt-8">
			<!-- Header Section -->
			<div class="mb-8 text-center">
				<div class="mb-4 flex items-center justify-center gap-3">
					<div
						class="rounded-xl bg-gradient-to-br from-green-400 to-blue-500 p-3 text-white shadow-lg"
					>
						<Shield class="h-8 w-8" />
					</div>
					<h1
						class="bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl"
					>
						{$t('ui.deposit_page.title')}
					</h1>
				</div>
				<p class="text-text-secondary mx-auto max-w-2xl text-lg">
					{$t('ui.deposit_page.subtitle')}
				</p>
			</div>

			<div class="grid gap-6 lg:grid-cols-4">
				<!-- Main Deposit Form -->
				<div class="space-y-6 lg:col-span-2">
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm w-full">
						<div class="space-y-6">
							<!-- Token Selection -->
							<div class="space-y-3">
								<Tooltip text={$t('tooltips.deposit.select_token')} position="right" theme="dark">
									<label class="text-text flex items-center gap-2 text-sm font-semibold">
										<DollarSign class="h-4 w-4" />
										{$t('ui.deposit_page.select_token')}
									</label>
								</Tooltip>
								<TokenSelect
									tokens={$tokens}
									bind:value={$selectedToken}
									placeholder={$t('ui.deposit_page.choose_token_placeholder')}
									class_="w-full"
								/>
							</div>

							<!-- Wallet Balance Display -->
							<div
								class="rounded-lg bg-gradient-to-r from-gray-50 to-gray-100 p-4 dark:from-gray-700 dark:to-gray-600"
							>
								<WalletBalance
									tokenAddress={$selectedToken}
									tokenSymbol={$tokens.find((t) => t.address === $selectedToken)?.symbol || ''}
								/>
							</div>

							<!-- Amount Input -->
							<div class="space-y-3">
								<Tooltip text={$t('tooltips.deposit.amount')} position="right" theme="dark">
									<label class="text-text flex items-center gap-2 text-sm font-semibold">
										<ArrowRight class="h-4 w-4" />
										{$t('ui.deposit_page.deposit_amount')}
									</label>
								</Tooltip>
								<Input
									placeholder={$t('ui.deposit_page.amount_placeholder')}
									bind:value={amount}
									required
									class_="!w-full text-lg font-medium"
								/>
							</div>

							<!-- Submit Button -->
							<Tooltip text={$t('tooltips.deposit.create_button')} position="top" theme="dark">
								<Button
									text={$t('ui.deposit_page.create_deposit_button')}
									loading={isLoading}
									onClick={depositHandler}
									class_="!w-full py-4 text-lg font-semibold bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 border border-transparent"
								/>
							</Tooltip>
						</div>
					</Card>

					<!-- Selected Token Summary -->
					{#if $selectedToken && amount}
						<Card
							class_="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20"
						>
							<div class="space-y-3">
								<h3 class="flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-300">
									<DollarSign class="h-5 w-5" />
									{$t('ui.deposit_page.summary.title')}
								</h3>
								<div class="space-y-2">
									<div class="flex items-center justify-between">
										<span class="text-sm text-blue-700 dark:text-blue-300">{$t('ui.deposit_page.summary.token')}</span>
										<span class="font-medium text-blue-800 dark:text-blue-200"
											>{$tokens.find((t) => t.address === $selectedToken)?.symbol ||
												$t('ui.deposit_page.summary.unknown')}</span
										>
									</div>
									<div class="flex items-center justify-between">
										<span class="text-sm text-blue-700 dark:text-blue-300">{$t('ui.deposit_page.summary.amount')}</span>
										<span class="font-medium text-blue-800 dark:text-blue-200">{amount}</span>
									</div>
								</div>
							</div>
						</Card>
					{/if}
				</div>

				<!-- Information Panel -->
				<div class="space-y-6 lg:col-span-2">
					<!-- How It Works -->
					<Card class_="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
						<div class="space-y-4">
							<h3 class="text-text flex items-center gap-2 text-xl font-bold">
								<Zap class="h-5 w-5 text-blue-500" />
								{$t('ui.deposit_page.how_it_works.title')}
							</h3>
							<div class="space-y-4">
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white"
									>
										1
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.deposit_page.how_it_works.choose_token.title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.deposit_page.how_it_works.choose_token.description')}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white"
									>
										2
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.deposit_page.how_it_works.set_amount.title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.deposit_page.how_it_works.set_amount.description')}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white"
									>
										3
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.deposit_page.how_it_works.get_private_note.title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.deposit_page.how_it_works.get_private_note.description')}
										</p>
									</div>
								</div>
								<div class="flex items-start gap-3">
									<div
										class="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-sm font-bold text-white"
									>
										4
									</div>
									<div>
										<p class="text-text font-medium">{$t('ui.deposit_page.how_it_works.anonymous_withdrawals.title')}</p>
										<p class="text-text-secondary text-sm">
											{$t('ui.deposit_page.how_it_works.anonymous_withdrawals.description')}
										</p>
									</div>
								</div>
							</div>
						</div>
					</Card>

					<!-- Security Features -->
					<Card
						class_="border-0 shadow-xl bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20"
					>
						<div class="space-y-4">
							<h3 class="text-text flex items-center gap-2 text-xl font-bold">
								<Lock class="h-5 w-5 text-green-500" />
								{$t('ui.deposit_page.security_features.title')}
							</h3>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-green-500" />
									<span class="text-text text-sm font-medium"
										>{$t('ui.deposit_page.security_features.zero_knowledge')}</span
									>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-green-500" />
									<span class="text-text text-sm font-medium"
										>{$t('ui.deposit_page.security_features.cryptographic_notes')}</span
									>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-green-500" />
									<span class="text-text text-sm font-medium"
										>{$t('ui.deposit_page.security_features.decentralized')}</span
									>
								</div>
								<div class="flex items-center gap-3">
									<CheckCircle class="h-5 w-5 text-green-500" />
									<span class="text-text text-sm font-medium"
										>{$t('ui.deposit_page.security_features.starknet_security')}</span
									>
								</div>
							</div>
						</div>
					</Card>

					<!-- Quick Stats -->
					<div class="grid grid-cols-2 gap-4">
						<Card
							class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center"
						>
							<div class="space-y-2">
								<div class="text-2xl font-bold text-green-500">{$t('ui.deposit_page.quick_stats.anonymous_percent')}</div>
								<div class="text-text-secondary text-sm">{$t('ui.deposit_page.quick_stats.anonymous_label')}</div>
							</div>
						</Card>
						<Card
							class_="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-center"
						>
							<div class="space-y-2">
								<div class="text-2xl font-bold text-blue-500">{$t('ui.deposit_page.quick_stats.instant_icon')}</div>
								<div class="text-text-secondary text-sm">{$t('ui.deposit_page.quick_stats.instant_label')}</div>
							</div>
						</Card>
					</div>
				</div>
			</div>
		</div>
	</div>

	<ProgressModal
		show={$progressModalStore.show}
		title={$progressModalStore.title}
		steps={$progressModalStore.steps}
		onClose={progressModalActions.hide}
	/>
</ProtectedRoute>
