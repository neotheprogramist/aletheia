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
    impl WithdrawExtension of crate::zk_extension::IZkExtension<ContractState> {
        fn execute(ref self: ContractState, calldata: Span<felt252>){
            let sender: ContractAddress = (*calldata[0]).try_into().unwrap();
            let recipient: ContractAddress = (*calldata[1]).try_into().unwrap();
            let token_address: ContractAddress = (*calldata[2]).try_into().unwrap();
            let token = IERC20Dispatcher {contract_address: token_address};
            let amount: u256 = (*calldata[3]).try_into().unwrap();

            token.transfer_from(sender, recipient, amount);
        }
    }
}