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

export const depositProgressSteps = (t: any): ProgressStep[] => [
	{
		id: 'preparation',
		title: t('progress_modal.deposit.preparation.title'),
		description: t('progress_modal.deposit.preparation.description'),
		status: 'pending'
	},
	{
		id: 'wallet-approval',
		title: t('progress_modal.deposit.wallet_approval.title'),
		description: t('progress_modal.deposit.wallet_approval.description'),
		status: 'pending'
	},
	{
		id: 'onchain-confirmation',
		title: t('progress_modal.deposit.onchain_confirmation.title'),
		description: t('progress_modal.deposit.onchain_confirmation.description'),
		status: 'pending'
	}
];

export const withdrawProgressSteps = (t: any): ProgressStep[] => [
	{
		id: 'preparation',
		title: t('progress_modal.withdraw.preparation.title'),
		description: t('progress_modal.withdraw.preparation.description'),
		status: 'pending'
	},
	{
		id: 'proof-generation',
		title: t('progress_modal.withdraw.proof_generation.title'),
		description: t('progress_modal.withdraw.proof_generation.description'),
		status: 'pending'
	},
	{
		id: 'transaction-prepare',
		title: t('progress_modal.withdraw.transaction_prepare.title'),
		description: t('progress_modal.withdraw.transaction_prepare.description'),
		status: 'pending'
	},
	{
		id: 'executing-transaction',
		title: t('progress_modal.withdraw.executing_transaction.title'),
		description: t('progress_modal.withdraw.executing_transaction.description'),
		status: 'pending'
	},
	{
		id: 'onchain-confirmation',
		title: t('progress_modal.withdraw.onchain_confirmation.title'),
		description: t('progress_modal.withdraw.onchain_confirmation.description'),
		status: 'pending'
	}
];

export const mergeProgressSteps = (t: any): ProgressStep[] => [
	{
		id: 'preparation',
		title: t('progress_modal.merge.preparation.title'),
		description: t('progress_modal.merge.preparation.description'),
		status: 'pending'
	},
	{
		id: 'proof-generation',
		title: t('progress_modal.merge.proof_generation.title'),
		description: t('progress_modal.merge.proof_generation.description'),
		status: 'pending'
	},
	{
		id: 'transaction-prepare',
		title: t('progress_modal.merge.transaction_prepare.title'),
		description: t('progress_modal.merge.transaction_prepare.description'),
		status: 'pending'
	},
	{
		id: 'executing-transaction',
		title: t('progress_modal.merge.executing_transaction.title'),
		description: t('progress_modal.merge.executing_transaction.description'),
		status: 'pending'
	},
	{
		id: 'onchain-confirmation',
		title: t('progress_modal.merge.onchain_confirmation.title'),
		description: t('progress_modal.merge.onchain_confirmation.description'),
		status: 'pending'
	}
];

export const swapProgressSteps = (t: any): ProgressStep[] => [
	{
		id: 'preparation',
		title: t('progress_modal.swap.preparation.title'),
		description: t('progress_modal.swap.preparation.description'),
		status: 'pending'
	},
	{
		id: 'proof-generation',
		title: t('progress_modal.swap.proof_generation.title'),
		description: t('progress_modal.swap.proof_generation.description'),
		status: 'pending'
	},
	{
		id: 'quote-fetching',
		title: t('progress_modal.swap.quote_fetching.title'),
		description: t('progress_modal.swap.quote_fetching.description'),
		status: 'pending'
	},
	{
		id: 'transaction-prepare',
		title: t('progress_modal.swap.transaction_prepare.title'),
		description: t('progress_modal.swap.transaction_prepare.description'),
		status: 'pending'
	},
	{
		id: 'executing-transaction',
		title: t('progress_modal.swap.executing_transaction.title'),
		description: t('progress_modal.swap.executing_transaction.description'),
		status: 'pending'
	},
	{
		id: 'onchain-confirmation',
		title: t('progress_modal.swap.onchain_confirmation.title'),
		description: t('progress_modal.swap.onchain_confirmation.description'),
		status: 'pending'
	}
];


export const transferProgressSteps = (t: any): ProgressStep[] => [
	{
		id: 'preparation',
		title: t('progress_modal.transfer.preparation.title'),
		description: t('progress_modal.transfer.preparation.description'),
		status: 'pending'
	},
	{
		id: 'proof-generation',
		title: t('progress_modal.transfer.proof_generation.title'),
		description: t('progress_modal.transfer.proof_generation.description'),
		status: 'pending'
	},
	{
		id: 'transaction-prepare',
		title: t('progress_modal.transfer.transaction_prepare.title'),
		description: t('progress_modal.transfer.transaction_prepare.description'),
		status: 'pending'
	},
	{
		id: 'executing-transaction',
		title: t('progress_modal.transfer.executing_transaction.title'),
		description: t('progress_modal.transfer.executing_transaction.description'),
		status: 'pending'
	},
	{
		id: 'onchain-confirmation',
		title: t('progress_modal.transfer.onchain_confirmation.title'),
		description: t('progress_modal.transfer.onchain_confirmation.description'),
		status: 'pending'
	}
];
