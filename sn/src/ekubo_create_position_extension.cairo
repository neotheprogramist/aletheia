#[starknet::contract]
mod EkuboCreatePositionExtension {
    use ekubo::components::clear::{IClearDispatcher, IClearDispatcherTrait};
    use ekubo::interfaces::positions::{IPositionsDispatcher, IPositionsDispatcherTrait};
    use ekubo::types::bounds::Bounds;
    use ekubo::types::keys::PoolKey;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use crate::privacy_account::{IPrivacyAccountDispatcher, IPrivacyAccountDispatcherTrait};

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

    pub mod Errors {
        pub const TRANSFER0_FAILED: felt252 = 'TRANSFER0_FAILED';
        pub const TRANSFER1_FAILED: felt252 = 'TRANSFER1_FAILED';
    }

    #[derive(Drop, Serde)]
    struct CreatePositionParams {
        pool_key: PoolKey,
        bounds: Bounds,
        amount0: u128,
        amount1: u128,
        min_liquidity: core::integer::u128,
        secret_and_nullifier_hash: u256,
    }

    #[abi(embed_v0)]
    impl EkuboCreatePositionExtension of crate::zk_extension::IZkExtension<ContractState> {
        fn execute(ref self: ContractState, calldata: Span<felt252>) {
            // 1. Calldata
            let mut input = calldata;
            let CreatePositionParams {
                pool_key, bounds, amount0, amount1, min_liquidity, secret_and_nullifier_hash,
            } = Serde::<CreatePositionParams>::deserialize(ref input).unwrap();

            let caller = get_caller_address();
            let pos_addr = self.positions.read();

            // 2. Transfer erc20 to Positions Contract
            let t0 = IERC20Dispatcher { contract_address: pool_key.token0 };
            let t1 = IERC20Dispatcher { contract_address: pool_key.token1 };
            assert(t0.transfer_from(caller, pos_addr, amount0.into()), Errors::TRANSFER0_FAILED);
            assert(t1.transfer_from(caller, pos_addr, amount1.into()), Errors::TRANSFER1_FAILED);

            // 3. Mint and deposit
            let (position_id, _liquidity) = IPositionsDispatcher { contract_address: pos_addr }
                .mint_and_deposit(pool_key, bounds, min_liquidity);

            // 4. Clear dust
            let clear = IClearDispatcher { contract_address: pos_addr };
            clear
                .clear(
                    ekubo::interfaces::erc20::IERC20Dispatcher {
                        contract_address: pool_key.token0,
                    },
                );
            clear
                .clear(
                    ekubo::interfaces::erc20::IERC20Dispatcher {
                        contract_address: pool_key.token1,
                    },
                );

            // 5) deposit NFT
            let privacy = IPrivacyAccountDispatcher {
                contract_address: self.privacy_account.read(),
            };
            assert(
                privacy.deposit_nft(secret_and_nullifier_hash, position_id, self.nft.read()),
                'DEPOSIT_NFT_FAILED',
            );
        }
    }
}
