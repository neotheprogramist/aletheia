#[starknet::contract]
mod WithdrawNftExtension {
    use openzeppelin::token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};
    use starknet::ContractAddress;
    use starknet::event::EventEmitter;

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
        nft_id: u256,
    }

    #[storage]
    struct Storage {}

    #[derive(Drop, Serde)]
    struct WithdrawNftParams {
        sender: ContractAddress,
        recipient: ContractAddress,
        token_address: ContractAddress,
        nft_id: u256,
    }

    #[abi(embed_v0)]
    impl WithdrawExtension of crate::zk_extension::IZkExtension<ContractState> {
        fn execute(ref self: ContractState, calldata: Span<felt252>) {
            let mut input = calldata;
            let WithdrawNftParams {
                sender, recipient, token_address, nft_id,
            } = Serde::<WithdrawNftParams>::deserialize(ref input).unwrap();

            let token = IERC721Dispatcher { contract_address: token_address };
            token.transfer_from(sender, recipient, nft_id);

            self.emit(TokenWithdrawn { recipient, token: token_address, nft_id });
        }
    }
}
