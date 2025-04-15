#[starknet::contract]
mod WithdrawExtension {
    use starknet::{
        ContractAddress,
    };

    use openzeppelin::token::erc20::interface::{
        IERC20Dispatcher,
        IERC20DispatcherTrait,
    };

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl WithdrawExtension of crate::executor::IExecutor<ContractState> {
        fn execute(ref self: ContractState, token_address: ContractAddress, amount: u256, calldata: Span<felt252>){
            let recipient: ContractAddress = (*calldata[0]).try_into().unwrap();
            let token = IERC20Dispatcher {contract_address: token_address};
            token.transfer(recipient, amount);
        }
    }
}