import { getOperationByHash, updateOperation } from '$lib/db/operationsDb';

/**
 * Move a previously pending operation → confirmed.
 * @param hash The operation’s hash (its primary key)
 */
export async function confirmOperation(hash: string) {
	const op = await getOperationByHash(hash);
	if (!op) throw new Error('Operation not found');
	if (op.status !== 'pending') throw new Error(`Cannot confirm a ${op.status} operation`);

	op.status = 'confirmed';
	await updateOperation(op);
}
