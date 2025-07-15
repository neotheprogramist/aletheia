import { getOperationByHash, updateOperation } from '$lib/db/operationsDb';
import { updateOperationInStore } from '$lib/stores/operations';

/**
 * Move a previously confirmed operation → nullified.
 * @param hash The operation’s hash (its primary key)
 */
export async function nullifyOperation(hash: string) {
	const op = await getOperationByHash(hash);
	if (!op) throw new Error('Operation not found');
	if (op.status !== 'confirmed') throw new Error(`Cannot nullify a ${op.status} operation`);

	op.status = 'nullified';
	await updateOperation(op);

	// Update the operations store for immediate UI updates
	updateOperationInStore(hash, { status: 'nullified' });
	console.log(`[nullifyOperation] ✅ Nullified operation ${hash}`);
}
