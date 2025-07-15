import { getOperationByHash, updateOperation } from '$lib/db/operationsDb';
import { updateOperationInStore } from '$lib/stores/operations';

/**
 * Move a previously pending operation → aborted.
 * @param hash The operation’s hash (its primary key)
 */
export async function abortOperation(hash: string) {
	const op = await getOperationByHash(hash);
	if (!op) throw new Error('Operation not found');
	if (op.status !== 'pending') throw new Error(`Cannot abort a ${op.status} operation`);

	op.status = 'aborted';
	await updateOperation(op);
	
	// Update the operations store for immediate UI updates
	updateOperationInStore(hash, { status: 'aborted' });
}
