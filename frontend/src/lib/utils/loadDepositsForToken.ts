import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
import { fromWei } from '$lib/utils/toWei';
import type { Operation } from '$lib/privacy/types';
import { wrapWithToast } from './toast';
import { getAllByStatus } from '$lib/db/operationsDb';

export interface DisplayOperation extends Omit<Operation, 'data'> {
	data: {
		tokenAddress: string;
		amount: string | bigint;
	};
	displayAmount: string;
}

function isPricedOp(op: Operation): op is Omit<Operation, 'data'> & {
	data: { tokenAddress: string; amount: string | bigint };
} {
	if (typeof op !== 'object' || op === null) return false;
	const data = op.data;

	if (
		typeof data !== 'object' ||
		data === null ||
		typeof (data as { tokenAddress?: unknown }).tokenAddress !== 'string'
	) {
		return false;
	}

	const amount = (data as { amount?: unknown }).amount;
	return typeof amount === 'string' || typeof amount === 'bigint';
}

export async function loadDisplayDeposits(
	ops: Operation[],
	token: string
): Promise<DisplayOperation[]> {
	const pricedOps = ops.filter(isPricedOp);
	const uniqueAddrs = Array.from(new Set(pricedOps.map((o) => o.data.tokenAddress)));
	const decimalsMap: Record<string, number> = {};

	await Promise.all(
		uniqueAddrs.map(async (addr) => {
			decimalsMap[addr] = await fetchTokenDecimals(addr);
		})
	);

	return pricedOps
		.filter((op) => op.data.tokenAddress === token && BigInt(op.data.amount) > 0n)
		.sort((a, b) => a.index - b.index)
		.map((op) => {
			const { tokenAddress, amount } = op.data;
			const wei = typeof amount === 'bigint' ? amount : BigInt(amount);
			return {
				...op,
				data: { tokenAddress, amount },
				displayAmount: fromWei(wei, decimalsMap[tokenAddress])
			};
		});
}

export async function getDisplayDepositsForToken(
	token: string,
	setIsLoading?: (v: boolean) => void
) {
	if (setIsLoading) setIsLoading(true);
	const deposits = await wrapWithToast(
		async () => {
			const ops = await getAllByStatus('confirmed');
			return await loadDisplayDeposits(ops, token);
		},
		{ loading: '⏳ Loading…', success: '', error: '❌ Load error' }
	);
	if (setIsLoading) setIsLoading(false);
	return deposits;
}

export async function loadDeposits(
	token: string,
	setDeposits: (d: DisplayOperation[]) => void,
	setLoading: (b: boolean) => void
) {
	setLoading(true);
	const d = await getDisplayDepositsForToken(token, (v) => setLoading(v));
	setDeposits(d ?? []);
}
