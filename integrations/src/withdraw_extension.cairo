#[starknet::contract]
mod WithdrawExtension {
    use starknet::{
        ContractAddress,
        event::EventEmitter
    };

    use openzeppelin::token::erc20::interface::{
        IERC20Dispatcher,
        IERC20DispatcherTrait,
    };

    #[event]
    #[derive(Drop, PartialEq, starknet::Event)]
    enum Event {
        TokenWithdrawn: TokenWithdrawn,
    }
    
    #[derive(Drop, PartialEq, starknet::Event)]
    struct TokenWithdrawn {
        #[key]
        recipient: ContractAddress,
        #[key]
        token: ContractAddress,
        amount: u256,
    }

    #[storage]
    struct Storage {}

    #[derive(Drop, Serde)]
    struct WithdrawParams {
        sender: ContractAddress,
        recipient: ContractAddress,
        token_address: ContractAddress,
        amount: felt252,
    }

    #[abi(embed_v0)]
    impl WithdrawExtension of crate::zk_extension::IZkExtension<ContractState> {
        fn execute(ref self: ContractState, calldata: Span<felt252>) {
            let mut input = calldata;
            let WithdrawParams {
                sender,
                recipient,
                token_address,
                amount,
            } = Serde::<WithdrawParams>::deserialize(ref input).unwrap();
        
            let token = IERC20Dispatcher { contract_address: token_address };
            let amount: u256 = amount.into();
            token.transfer_from(sender, recipient, amount);
        
            self.emit(TokenWithdrawn {
                recipient,
                token: token_address,
                amount,
            });
        }
        
    }
}