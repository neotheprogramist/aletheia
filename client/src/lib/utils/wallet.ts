import { connect, disconnect } from 'starknetkit';
import { isConnected, wallet, walletAddress } from '../stores/wallet';
import { goto } from '$app/navigation';

export async function connectWallet(): Promise<boolean> {
	try {
		const { wallet: connectedWallet, connectorData } = await connect({
			modalMode: 'alwaysAsk',
			modalTheme: 'dark'
		});

		if (connectedWallet && connectorData) {
			wallet.set(connectedWallet);
			walletAddress.set(connectorData.account || '');
			isConnected.set(true);
			return true;
		}
		return false;
	} catch (error) {
		console.error('Error while connecting wallet:', error);
		throw error;
	}
}

export async function disconnectWallet() {
	await disconnect({ clearLastWallet: true });
	wallet.set(null);
	walletAddress.set('');
	isConnected.set(false);
	goto('/');
}

export async function copyWalletAddress(address: string) {
	await navigator.clipboard.writeText(address);
}

export function shortAddress(address: string) {
	return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
}
