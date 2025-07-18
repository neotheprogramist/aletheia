import { writable } from 'svelte/store';

/**
 * Defines the possible types of toast notifications.
 */
type ToastType = 'success' | 'error' | 'loading' | 'info';

/**
 * Represents a toast notification.
 */
export type Toast = {
	/** Unique identifier for the toast */
	id: string;
	/** The type of toast notification */
	type: ToastType;
	/** The message to display in the toast */
	message: string;
	/** Time in milliseconds before the toast is automatically dismissed */
	duration?: number;
};

/**
 * Default duration in milliseconds for toast notifications.
 * Toasts will be automatically dismissed after this duration if no custom duration is specified.
 */
const TOAST_DISMISS_DURATION = 4000;

/**
 * Creates a custom Svelte store for managing toast notifications.
 * @returns A store with methods to manage toast notifications
 */
function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	/**
	 * Adds a new toast notification to the store.
	 * @param toast - The toast data without an ID
	 * @returns The generated ID for the toast
	 */
	function addToast(toast: Omit<Toast, 'id'>) {
		const id = crypto.randomUUID?.() ?? Math.random().toString(36).substring(2, 11);
		const fullToast = { ...toast, id };

		update((toasts) => [...toasts, fullToast]);

		const duration = toast.duration ?? TOAST_DISMISS_DURATION;
		setTimeout(() => removeToast(id), duration);

		return id;
	}

	/**
	 * Removes a toast notification from the store.
	 * @param id - The ID of the toast to remove
	 */
	function removeToast(id: string) {
		update((toasts) => toasts.filter((t) => t.id !== id));
	}

	return {
		subscribe,
		addToast,
		removeToast
	};
}

/**
 * A store for managing toast notifications in the application.
 * Use this to add, remove, and subscribe to toast notifications.
 *
 * @example
 * // Import the store
 * import { toastStore } from '$lib/stores/toast';
 *
 * // Add a success toast
 * toastStore.addToast({
 *   type: 'success',
 *   message: 'Operation completed successfully'
 * });
 *
 * // Add a toast with custom duration
 * toastStore.addToast({
 *   type: 'info',
 *   message: 'This will stay longer',
 *   duration: 8000
 * });
 *
 * // Subscribe to toast changes
 * const unsubscribe = toastStore.subscribe(toasts => {
 *   console.log('Current toasts:', toasts);
 * });
 */
export const toastStore = createToastStore();
