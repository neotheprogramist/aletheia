import { showToast } from '../stores/toast';

/**
 * Wrap a function that returns a promise in a try-catch block
 * and show toast notifications.
 *
 * @param fn The async function to wrap
 * @param options Configuration options for success and error messages
 * @returns The result of the function, or undefined if it failed
 */
export async function wrapWithToast<T>(
	fn: () => Promise<T>,
	options?: {
		success?: string;
		error?: string | ((err: unknown) => string);
		showSuccess?: boolean;
		onError?: (err: unknown) => void | Promise<void>;
	}
): Promise<T | undefined> {
	try {
		const result = await fn();

		if (options?.success && options?.showSuccess !== false) {
			showToast(options.success, 'success');
		}

		return result;
	} catch (error) {
		console.error('Error in wrapped function:', error);

		const errorMsg =
			typeof options?.error === 'function'
				? options.error(error)
				: options?.error || (error instanceof Error ? error.message : 'Unknown error');

		showToast(errorMsg, 'error');

		if (options?.onError) {
			await options.onError(error);
		}

		return undefined;
	}
}
