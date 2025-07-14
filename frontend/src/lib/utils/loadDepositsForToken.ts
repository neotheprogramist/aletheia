import { fetchTokenDecimals } from '$lib/utils/fetchTokenDecimals';
import { fromWei } from '$lib/utils/toWei';
import { wrapWithToast } from './toast';
import { getAllByStatus } from '$lib/db/operationsDb';
import type { Operation, OperationStatus } from '$lib/privacy/types';

export interface DisplayOperation extends Omit<Operation, 'data'> {
	data: {
		tokenAddress: string;
		amount: string | bigint;
	};
	displayAmount: string;
}

export interface DisplayPendingEmptyOperation extends Omit<Operation, 'data'> {
	shortHex: string;
	fullHex: string;
}

function isPricedOp(
	op: Operation
): op is Omit<Operation, 'data'> & { data: { tokenAddress: string; amount: string | bigint } } {
	if (typeof op !== 'object' || op === null) return false;
	const d = op.data;
	return (
		d != null &&
		typeof d.tokenAddress === 'string' &&
		(typeof d.amount === 'string' || typeof d.amount === 'bigint')
	);
}

type AmountPredicate = (wei: bigint) => boolean;

async function loadFilteredDeposits(ops: Operation[], token: string, predicate: AmountPredicate) {
	const priced = ops.filter(isPricedOp);

	const unique = Array.from(new Set(priced.map((o) => o.data.tokenAddress)));
	const decimalsMap: Record<string, number> = {};
	await Promise.all(
		unique.map((addr) =>
			fetchTokenDecimals(addr).then((dec) => {
				decimalsMap[addr] = dec;
			})
		)
	);

	return priced
		.filter((op) => BigInt(op.data.tokenAddress) === BigInt(token))
		.filter((op) => {
			const raw = op.data.amount;
			const wei = typeof raw === 'bigint' ? raw : BigInt(raw);
			return predicate(wei);
		})
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

export async function loadDisplayDeposits(ops: Operation[], token: string) {
	return loadFilteredDeposits(ops, token, (wei) => wei > 0n);
}

export async function loadEmptyDisplayDeposits(ops: Operation[], token: string) {
	return loadFilteredDeposits(ops, token, (wei) => wei === 0n);
}

export async function getDisplayDepositsForToken(
	token: string,
	setIsLoading?: (v: boolean) => void
) {
	if (setIsLoading) setIsLoading(true);

	const result = await wrapWithToast(
		async () => {
			const ops = await getAllByStatus('confirmed');
			return loadDisplayDeposits(ops, token);
		},
		{ loading: '⏳ Loading…', success: '', error: '❌ Load error' }
	);

	if (setIsLoading) setIsLoading(false);
	return result;
}

export async function getEmptyDepositsForToken(token: string, setIsLoading?: (v: boolean) => void) {
	if (setIsLoading) setIsLoading(true);

	const result = await wrapWithToast(
		async () => {
			const ops = await getAllByStatus('confirmed');
			return loadEmptyDisplayDeposits(ops, token);
		},
		{ loading: '⏳ Loading empty…', success: '', error: '❌ Load error' }
	);

	if (setIsLoading) setIsLoading(false);
	return result;
}

export async function loadDeposits(
	token: string,
	setDeposits: (d: DisplayOperation[]) => void,
	setLoading: (b: boolean) => void
) {
	setLoading(true);
	const data = await getDisplayDepositsForToken(token, setLoading);
	setDeposits(data ?? []);
}

export async function loadEmptyDeposits(
	token: string,
	setDeposits: (d: DisplayOperation[]) => void,
	setLoading: (b: boolean) => void
) {
	setLoading(true);
	const data = await getEmptyDepositsForToken(token, setLoading);
	setDeposits(data ?? []);
}

export async function getPendingEmptyDepositsForToken(
	token: string,
	setIsLoading?: (v: boolean) => void
) {
	if (setIsLoading) setIsLoading(true);

	const pendingRaw = await wrapWithToast(
		async () =>
			(await getAllByStatus('pending')).filter(
				(op) =>
					op.data == null || (typeof op.data === 'object' && Object.keys(op.data).length === 0)
			),
		{ loading: '⏳ Loading pending…', success: '', error: '❌ Error' }
	);

	if (setIsLoading) setIsLoading(false);

	return (pendingRaw ?? []).map((op) => {
		const fullHex = `0x${BigInt(op.hash).toString(16)}`;
		const shortHex = fullHex.length > 10 ? `${fullHex.slice(0, 6)}…${fullHex.slice(-4)}` : fullHex;

		return {
			index: op.index,
			secret: op.secret,
			nullifier: op.nullifier,
			hash: op.hash,
			commitment: undefined,
			status: op.status as OperationStatus,
			shortHex,
			fullHex
		};
	});
}

export async function loadPendingEmptyDeposits(
	token: string,
	setPending: (ops: DisplayPendingEmptyOperation[]) => void,
	setLoading: (v: boolean) => void
) {
	setLoading(true);
	const ops = await getPendingEmptyDepositsForToken(token, setLoading);

	setPending(ops);
}
