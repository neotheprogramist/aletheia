#[starknet::interface]
pub trait IZkExtension<TContractState> {
    fn execute(
        ref self: TContractState,
        calldata: Span<felt252>
    ) -> ();
}
