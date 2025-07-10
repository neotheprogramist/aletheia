#[starknet::contract]
mod EkuboWithdrawPositionExtension {
    use ekubo::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use ekubo::interfaces::positions::{IPositionsDispatcher, IPositionsDispatcherTrait};
    use ekubo::types::bounds::Bounds;
    use ekubo::types::keys::PoolKey;
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use crate::privacy_account::{IPrivacyAccountDispatcher, IPrivacyAccountDispatcherTrait};

    #[derive(Drop, Serde)]
    struct WithdrawPositionParams {
        id: u64,
        pool_key: PoolKey,
        bounds: Bounds,
        liquidity: u128,
        min_token_0: u128,
        min_token_1: u128,
        collect_fees: bool,
        secret_and_nullifier_hash_0: u256,
        secret_and_nullifier_hash_1: u256,
    }

    #[event]
    #[derive(Drop, PartialEq, starknet::Event)]
    enum Event {
        Deposited: Deposited,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct Deposited {
        #[key]
        token: ContractAddress,
        amount: u256,
    }

    #[storage]
    struct Storage {
        positions: ContractAddress,
        nft: ContractAddress,
        privacy_account: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        positions: ContractAddress,
        nft: ContractAddress,
        privacy_account: ContractAddress,
    ) {
        self.positions.write(positions);
        self.nft.write(nft);
        self.privacy_account.write(privacy_account);
    }

    #[abi(embed_v0)]
    impl EkuboWithdrawPositionExtension of crate::zk_extension::IZkExtension<ContractState> {
        fn execute(ref self: ContractState, calldata: Span<felt252>) {
            let mut input = calldata;
            let params = Serde::<WithdrawPositionParams>::deserialize(ref input).unwrap();

            let positions_contract = IPositionsDispatcher {
                contract_address: self.positions.read(),
            };

            let (token0_amount, token1_amount) = positions_contract
                .withdraw(
                    params.id,
                    params.pool_key,
                    params.bounds,
                    params.liquidity,
                    params.min_token_0,
                    params.min_token_1,
                    params.collect_fees,
                );

            let privacy_account = IPrivacyAccountDispatcher {
                contract_address: self.privacy_account.read(),
            };

            // Deposit token0 to privacy account if amount > 0
            if token0_amount > 0 {
                let token_out = IERC20Dispatcher { contract_address: params.pool_key.token0 };
                let privacy_acct_address = self.privacy_account.read();
                token_out.approve(privacy_acct_address, token0_amount.into());

                let deposit0 = privacy_account
                    .deposit(
                        secret_and_nullifier_hash: params.secret_and_nullifier_hash_0,
                        amount: token0_amount.into(),
                        token_address: params.pool_key.token0,
                    );
                assert(deposit0, 'TOKEN0_DEPOSIT_FAILED');
                self
                    .emit(
                        Deposited { token: params.pool_key.token0, amount: token0_amount.into() },
                    );
            }

            // Deposit token1 to privacy account if amount > 0
            if token1_amount > 0 {
                let token_out = IERC20Dispatcher { contract_address: params.pool_key.token1 };
                let privacy_acct_address = self.privacy_account.read();
                token_out.approve(privacy_acct_address, token1_amount.into());

                let deposit1 = privacy_account
                    .deposit(
                        params.secret_and_nullifier_hash_1,
                        token1_amount.into(),
                        params.pool_key.token1,
                    );
                assert(deposit1, 'TOKEN1_DEPOSIT_FAILED');
                self
                    .emit(
                        Deposited { token: params.pool_key.token1, amount: token1_amount.into() },
                    );
            }
        }
    }
}
