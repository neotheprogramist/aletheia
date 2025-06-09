import { toastStore } from '$lib/stores/toast';

/**
 * Wraps an asynchronous function with toast notifications for loading, success, and error states.
 *
 * This utility function provides a consistent way to show feedback to users during asynchronous operations.
 * It displays a loading toast while the operation is in progress, then shows either a success or error
 * toast based on the outcome.
 *
 * @template T The return type of the wrapped function
 * @param fn - The asynchronous function to wrap
 * @param messages - Object containing toast messages for different states
 * @param messages.loading - Message to show during the loading state
 * @param messages.success - Message to show when the operation succeeds
 * @param messages.error - Base message to show when the operation fails
 * @returns The result of the wrapped function, or undefined if an error occurred
 *
 * @example
 * const result = await wrapWithToast(
 *   () => fetchUserData(userId),
 *   {
 *     loading: 'Loading user data...',
 *     success: 'User data loaded successfully',
 *     error: 'Failed to load user data'
 *   }
 * );
 */
export async function wrapWithToast<T>(
	fn: () => Promise<T>,
	messages: { loading: string; success: string; error: string },
	onError?: (err: unknown) => void | Promise<void>
) {
	const loadingId = toastStore.addToast({
		type: 'loading',
		message: messages.loading
	});

	try {
		const result = await fn();

		toastStore.removeToast(loadingId);
		if (messages.success) {
			toastStore.addToast({
				type: 'success',
				message: messages.success
			});
		}

		return result;
	} catch (err) {
		toastStore.removeToast(loadingId);

		if (onError) {
			try {
				await onError(err);
			} catch (e) {
				console.error('⚠️ onError handler threw:', e);
			}
		}

		const message =
			err instanceof Error
				? err.message
				: typeof err === 'string'
					? err
					: (messages.error ?? 'Unexpected error occurred');

		toastStore.addToast({
			type: 'error',
			message
		});

		console.error('❌ Error in toast wrapper:', err);
		return undefined;
	}
}
