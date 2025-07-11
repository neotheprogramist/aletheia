<script lang="ts">
	import { get } from 'svelte/store';
	import { tokens, selectedToken } from '$lib/stores/tokens';
	import { wallet } from '$lib/stores/wallet';
	import { wrapWithToast } from '$lib/utils/toast';
	import { PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS } from '$env/static/public';

	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import TokenSelect from '$lib/ui/TokenSelect.svelte';
	import BalanceCard from '$lib/ui/BalanceCard.svelte';
	import ProgressStepper from '$lib/ui/ProgressStepper.svelte';
	import ErrorDisplay from '$lib/ui/ErrorDisplay.svelte';

	import { toLowHigh } from '$lib/utils/toLowHigh';
	import { toWei } from '$lib/utils/toWei';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
	import { provider } from '$lib/stores/provider';

	let amount = '';
	let isLoading = false;
	let currentStep = 0;
	let depositError = null;
	let steps = ['Przygotowanie', 'Generowanie dowodu', 'Wysyłanie transakcji'];

	function createCalls(hash: string, amountWei: bigint) {
		const secretAndNullifierHash = BigInt(hash);
		const [amountLow, amountHigh] = toLowHigh(amountWei);
		const [hashLow, hashHigh] = toLowHigh(secretAndNullifierHash);

		return [
			{
				contract_address: $selectedToken,
				entry_point: 'approve',
				calldata: [PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS, amountLow, amountHigh]
			},
			{
				contract_address: PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				entry_point: 'deposit',
				calldata: [hashLow, hashHigh, amountLow, amountHigh, $selectedToken]
			}
		];
	}

	async function depositHandler() {
		isLoading = true;
		depositError = null;
		currentStep = 0;
		let operationHash = '';

		try {
			// Step 1: Przygotowanie
			currentStep = 0;
			await new Promise(resolve => setTimeout(resolve, 500)); // Brief delay for UX
			
			const decimals = await fetchTokenDecimals($selectedToken);
			const amountWei = toWei(amount, decimals);
			
			// Step 2: Generowanie dowodu
			currentStep = 1;
			const { hash } = await generateOperation({
				data: { tokenAddress: $selectedToken, amount: amountWei }
			});
			operationHash = hash;

			// Step 3: Wysyłanie transakcji
			currentStep = 2;
			const calls = createCalls(hash, amountWei);

			const connectedWallet = get(wallet);
			if (!connectedWallet) throw new Error('Please connect your wallet.');

			const {transaction_hash} = await connectedWallet.request({
				type: 'wallet_addInvokeTransaction',
				params: { calls }
			});

			const rpc = get(provider);
			if (!rpc) throw new Error('Missing Provider');

			const receipt = await rpc.waitForTransaction(BigInt(transaction_hash));

			if (receipt.isReverted()) {
				throw new Error(`Transaction reverted: ${receipt.value}`);
			} else if (!receipt.isSuccess()) {
				throw new Error(`Transaction error: ${receipt.value}`);
			}

			// Success
			currentStep = 3;
			amount = '';
			
			// Show success toast
			await wrapWithToast(
				async () => {},
				{
					loading: '',
					success: '✅ Deposit complete!',
					error: ''
				}
			);
		} catch (err) {
			console.warn('❌ Deposit failed with error:', err);
			depositError = err;
			
			if (operationHash) {
				try {
					await abortOperation(operationHash);
					console.warn('🧯 Aborted failed operation:', operationHash);
				} catch (abortError) {
					console.error('🚨 Failed to abort operation:', abortError);
				}
			}
			
			// Show error toast
			await wrapWithToast(
				async () => { throw err; },
				{
					loading: '',
					success: '',
					error: '❌ Deposit failed'
				}
			);
		} finally {
			isLoading = false;
		}
	}
</script>

<ProtectedRoute>
	<div class="mx-auto p-6">
		<Card>
			<form on:submit|preventDefault={depositHandler} class="flex flex-col gap-4">
				<TokenSelect
					tokens={$tokens}
					bind:value={$selectedToken}
					placeholder="Select token"
					class_="w-full"
				/>

				{#if $selectedToken}
					<BalanceCard 
						token={$tokens.find(t => t.address === $selectedToken)}
						compact={true}
					/>
				{/if}

				<Input placeholder="Amount" bind:value={amount} required class_="w-full" />
				
				{#if isLoading}
					<ProgressStepper 
						{steps}
						currentStep={currentStep}
						loading={true}
						error={!!depositError}
						errorStep={depositError ? currentStep : -1}
					/>
				{/if}
				
				<ErrorDisplay error={depositError} showDetails={true} />
				
				<Button text="Deposit" loading={isLoading} type="submit" class_="mt-2 w-full" />
			</form>
		</Card>
	</div>
</ProtectedRoute>
