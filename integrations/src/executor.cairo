use starknet::{
    ContractAddress
};

#[starknet::interface]
pub trait IExecutor<TContractState> {
    fn execute(
        ref self: TContractState,
        token_address: ContractAddress,
        amount: u256,
        calldata: Span<felt252>
    ) -> ();
}
