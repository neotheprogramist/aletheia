import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
import { fromWei } from '$lib/utils/toWei';
import type { Operation, OperationStatus } from '$lib/privacy/types';
import { wrapWithToast } from './toast';
import { getAllByStatus } from '$lib/db/operationsDb';

export interface DisplayOperation extends Omit<Operation, 'data'> {
	data: {
		tokenAddress: string;
		amount: string | bigint;
	};
	displayAmount: string;
}

/**
 * Dla "pending empty" operacji trzymamy:
 * - wszystkie pola Operation (poza data),
 * - shortHex: skrócony hex do wyświetlenia,
 * - fullHex: cały hex (użyty do kopiowania).
 */
export interface DisplayPendingEmptyOperation extends Omit<Operation, 'data'> {
	shortHex: string;
	fullHex: string;
}

function isPricedOp(
	op: Operation
): op is Omit<Operation, 'data'> & { data: { tokenAddress: string; amount: string | bigint } } {
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
): Promise<DisplayOperation[] | undefined> {
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

export async function getPendingEmptyDepositsForToken(
	token: string,
	setIsLoading?: (v: boolean) => void
): Promise<DisplayPendingEmptyOperation[]> {
	if (setIsLoading) setIsLoading(true);

	const pendingOpsRaw = await wrapWithToast(
		async () => {
			const allPending: Operation[] = await getAllByStatus('pending');
			return allPending.filter((op) => op.data == null);
		},
		{ loading: '⏳ Loading pending…', success: '', error: '❌ Error' }
	);

	const pendingOps: DisplayPendingEmptyOperation[] = (pendingOpsRaw ?? []).map((op) => {
		const fullHex = `0x${BigInt(op.hash).toString(16)}`;
		const shortHex = fullHex.length > 10 ? `${fullHex.slice(0, 6)}…${fullHex.slice(-4)}` : fullHex;

		return {
			index: op.index,
			secret: op.secret,
			nullifier: op.nullifier,
			hash: op.hash,
			status: op.status as OperationStatus,
			shortHex,
			fullHex
		};
	});

	if (setIsLoading) setIsLoading(false);
	return pendingOps;
}

export async function loadPendingEmptyDeposits(
	token: string,
	setPending: (ops: DisplayPendingEmptyOperation[]) => void,
	setLoading: (v: boolean) => void
) {
	setLoading(true);
	const ops = await getPendingEmptyDepositsForToken(token, (v) => setLoading(v));
	setPending(ops);
}
