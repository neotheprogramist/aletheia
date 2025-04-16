import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'default';

interface Toast {
	message: string;
	type: ToastType;
	visible: boolean;
}

export const toast = writable<Toast>({
	message: '',
	type: 'default',
	visible: false
});

let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, type: ToastType = 'default', duration = 3000) {
	toast.set({ message, type, visible: true });

	if (toastTimeout) clearTimeout(toastTimeout);
	toastTimeout = setTimeout(() => {
		toast.set({ message: '', type: 'default', visible: false });
		toastTimeout = null;
	}, duration);
}
