<script lang="ts">
	import { get } from 'svelte/store';
	import { wallet } from '$lib/stores/wallet';
	import { wrapWithToast } from '$lib/utils/toast';
	import {
		PUBLIC_STRK_TOKEN_ADDRESS,
		PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS
	} from '$env/static/public';

	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ProtectedRoute from '$lib/ui/ProtectedRoute.svelte';
	import { toLowHigh } from '$lib/utils/toLowHigh';
	import { toWei } from '$lib/utils/toWei';
	import { generateOperation } from '$lib/privacy/generateOperation';
	import { confirmOperation } from '$lib/privacy/confirmOperation';
	import { abortOperation } from '$lib/privacy/abortOperation';
	import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';

	let tokenAddress = PUBLIC_STRK_TOKEN_ADDRESS;
	let amount = '';
	let isLoading = false;

	function createCalls(hash: string, amountWei: bigint) {
		const secretAndNullifierHash = BigInt(hash);
		const [amountLow, amountHigh] = toLowHigh(amountWei);
		const [hashLow, hashHigh] = toLowHigh(secretAndNullifierHash);

		return [
			{
				contract_address: tokenAddress,
				entry_point: 'approve',
				calldata: [PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS, amountLow, amountHigh]
			},
			{
				contract_address: PUBLIC_PRIVACY_POOLS_CONTRACT_ADDRESS,
				entry_point: 'deposit',
				calldata: [hashLow, hashHigh, amountLow, amountHigh, tokenAddress]
			}
		];
	}

	async function depositHandler() {
		isLoading = true;
		let operationHash = '';

		await wrapWithToast(
			async () => {
				const decimals = await fetchTokenDecimals(tokenAddress);
				const amountWei = toWei(amount, decimals);
				const { hash } = await generateOperation({ data: { tokenAddress, amount: amountWei } });
				operationHash = hash;

				const calls = createCalls(hash, amountWei);

				const connectedWallet = get(wallet);
				if (!connectedWallet) throw new Error('Please connect your wallet first.');

				await connectedWallet.request({
					type: 'wallet_addInvokeTransaction',
					params: { calls }
				});

				await confirmOperation(hash);
				amount = '';
			},
			{
				loading: '⏳ Running deposit',
				success: '✅ Deposit complete!',
				error: '❌ Deposit failed'
			},
			async (err) => {
				console.warn('❌ Deposit failed with error:', err);
				if (operationHash) {
					try {
						await abortOperation(operationHash);
						console.warn('🧯 Aborted failed operation:', operationHash);
					} catch (abortError) {
						console.error('🚨 Failed to abort operation:', abortError);
					}
				}
			}
		);

		isLoading = false;
	}
</script>

<ProtectedRoute>
	<div class="mx-auto p-6">
		<Card title="Deposit">
			<form on:submit|preventDefault={depositHandler} class="flex flex-col gap-4">
				<Input bind:value={tokenAddress} required placeholder="Token Address" class_="w-full" />
				<Input bind:value={amount} required placeholder="Amount" class_="w-full" />
				<Button text="Deposit" class_="mt-2 w-full" loading={isLoading} type="submit" />
			</form>
		</Card>
	</div>
</ProtectedRoute>
