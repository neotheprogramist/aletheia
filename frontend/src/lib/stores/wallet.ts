import { writable } from 'svelte/store';
import type { StarknetWindowObject, ModalResult } from 'starknetkit';
import { connect as starkConnect, disconnect as starkDisconnect } from 'starknetkit';
import { InjectedConnector } from 'starknetkit/injected';
import { wrapWithToast } from '$lib/utils/toast';

/**
 * Available wallet connectors for StarkNet.
 * Currently limited to Argent X and Braavos wallets.
 */
const SUPPORTED_WALLET_CONNECTORS = [
	new InjectedConnector({ options: { id: 'argentX', name: 'Argent X' } }),
	new InjectedConnector({ options: { id: 'braavos', name: 'Braavos' } })
];

/**
 * Stores for managing wallet state across the application.
 */
export const wallet = writable<StarknetWindowObject | null>(null);
export const walletAddress = writable<string>('');
export const isConnected = writable<boolean>(false);

/**
 * Resets all wallet-related stores to their initial state.
 * Used when disconnecting or when connection attempts fail.
 */
function resetWalletStores() {
	wallet.set(null);
	walletAddress.set('');
	isConnected.set(false);
}

/**
 * Updates all wallet-related stores with connection information.
 *
 * @param starknetWallet - The connected wallet object
 * @param accountAddress - The user's wallet address
 */
function updateWalletStores(starknetWallet: StarknetWindowObject, accountAddress: string) {
	wallet.set(starknetWallet);
	walletAddress.set(accountAddress);
	isConnected.set(true);
}

/**
 * Connects to a StarkNet wallet with user interaction and toast notifications.
 *
 * Prompts the user to select and connect their wallet, then updates the application
 * state with the connection information if successful.
 *
 * @returns A Promise that resolves when the connection process completes
 */
export async function connectWallet() {
	const connectionResult = await wrapWithToast<ModalResult>(
		async () => {
			const result = await starkConnect({
				connectors: SUPPORTED_WALLET_CONNECTORS,
				modalMode: 'alwaysAsk'
			});

			// Validate connection result
			if (!result.wallet || !result.connectorData?.account) {
				throw new Error('Wallet connection cancelled or no account available');
			}
			return result;
		},
		{
			loading: 'Connecting wallet…',
			success: 'Wallet connected!',
			error: 'Failed to connect wallet'
		}
	);

	// Handle connection failure
	if (!connectionResult?.wallet || !connectionResult.connectorData?.account) {
		return;
	}

	// Update stores with connection information
	updateWalletStores(connectionResult.wallet, connectionResult.connectorData.account);
}

/**
 * Disconnects the currently connected wallet with toast notifications.
 *
 * Attempts to properly disconnect from the wallet provider and resets
 * all wallet-related state regardless of the disconnection result.
 *
 * @returns A Promise that resolves when the disconnection process completes
 */
export async function disconnectWallet() {
	await wrapWithToast(() => starkDisconnect({ clearLastWallet: true }), {
		loading: 'Disconnecting wallet…',
		success: 'Wallet disconnected',
		error: 'Failed to disconnect wallet'
	});

	// Reset stores regardless of disconnection success/failure
	resetWalletStores();
}

/**
 * Attempts to silently reconnect to a previously connected wallet.
 *
 * Used on application initialization to restore wallet connection without
 * user interaction. Does not show any notifications if reconnection fails.
 *
 * @returns A Promise that resolves when the reconnection attempt completes
 */
export async function autoReconnect() {
	try {
		const reconnectionResult = await starkConnect({
			connectors: SUPPORTED_WALLET_CONNECTORS,
			modalMode: 'neverAsk'
		});

		// Only update stores if we have a valid connection
		if (reconnectionResult.wallet && reconnectionResult.connectorData?.account) {
			updateWalletStores(reconnectionResult.wallet, reconnectionResult.connectorData.account);
		}
	} catch (error) {
		// Silent failure for auto-reconnect attempts
		// No previous connection or other issue occurred
		console.debug('Auto-reconnect failed:', error);
	}
}
