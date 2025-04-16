export type GeneratedOperation = {
	id: number;
	hash: string;
};

export enum TxnType {
	Withdraw = 'Withdraw',
	Merge = 'Merge',
	Transfer = 'Transfer'
}
