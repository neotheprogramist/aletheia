import { writable } from 'svelte/store';

export type ProgressStep = {
	id: string;
	title: string;
	description?: string;
	status: 'pending' | 'loading' | 'completed' | 'error';
};

export type ProgressModalState = {
	show: boolean;
	title: string;
	steps: ProgressStep[];
};

const initialState: ProgressModalState = {
	show: false,
	title: '',
	steps: []
};

export const progressModalStore = writable<ProgressModalState>(initialState);

export const progressModalActions = {
	show: (title: string, steps: ProgressStep[]) => {
		progressModalStore.set({
			show: true,
			title,
			steps
		});
	},
	
	hide: () => {
		progressModalStore.update(state => ({
			...state,
			show: false
		}));
	},
	
	updateStep: (stepId: string, status: ProgressStep['status'], description?: string) => {
		progressModalStore.update(state => ({
			...state,
			steps: state.steps.map(step => 
				step.id === stepId 
					? { ...step, status, ...(description && { description }) }
					: step
			)
		}));
	},
	
	reset: () => {
		progressModalStore.set(initialState);
	}
};

export const depositProgressSteps: ProgressStep[] = [
	{
		id: 'preparation',
		title: 'Preparation',
		description: 'Preparing transaction data',
		status: 'pending'
	},
	{
		id: 'wallet-approval',
		title: 'Wallet Approval',
		description: 'Waiting for wallet confirmation',
		status: 'pending'
	},
	{
		id: 'onchain-confirmation',
		title: 'Onchain Confirmation',
		description: 'Waiting for blockchain confirmation',
		status: 'pending'
	}
];

export const withdrawProgressSteps: ProgressStep[] = [
	{
		id: 'preparation',
		title: 'Preparation',
		description: 'Preparing transaction data',
		status: 'pending'
	},
	{
		id: 'proof-generation',
		title: 'Proof Generation',
		description: 'Generating zero-knowledge proof',
		status: 'pending'
	},
	{
		id: 'transaction-prepare',
		title: 'Transaction Prepare',
		description: 'Preparing transaction for execution',
		status: 'pending'
	},
	{
		id: 'executing-transaction',
		title: 'Executing Transaction',
		description: 'Executing Transaction',
		status: 'pending'
	},
	{
		id: 'onchain-confirmation',
		title: 'Onchain Confirmation',
		description: 'Waiting for blockchain confirmation',
		status: 'pending'
	}
];