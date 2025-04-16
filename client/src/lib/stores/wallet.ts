import { writable } from 'svelte/store';
import type { StarknetWindowObject } from 'starknetkit';

export const wallet = writable<StarknetWindowObject | null>(null);
export const walletAddress = writable<string>('');
export const isConnected = writable<boolean>(false);
