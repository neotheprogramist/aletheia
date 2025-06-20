use starknet::ContractAddress;

#[derive(PartialEq, Copy, Drop, Serde, starknet::Store)]
#[allow(starknet::store_no_default_variant)]
enum PositionState {
    Token0Deposited,
    Token1Deposited,
    Completed,
}

#[derive(PartialEq, Copy, Drop, Serde, starknet::Store)]
struct PositionData {
    state: PositionState,
    token0: ContractAddress,
    token1: ContractAddress,
    amount0: u128,
    amount1: u128,
    position_id: u64,
}

#[starknet::interface]
pub trait IEkuboCreatePositionExtension<TContractState> {
    fn get_position_info(
        self: @TContractState, msg_hash: felt252, pub_key: felt252, signature: Span<felt252>,
    ) -> PositionData;

    fn get_public_key_nonce(self: @TContractState, pub_key: felt252) -> felt252;
}

#[starknet::contract]
mod EkuboCreatePositionExtension {
    use ekubo::components::clear::{IClearDispatcher, IClearDispatcherTrait};
    use ekubo::interfaces::positions::{IPositionsDispatcher, IPositionsDispatcherTrait};
    use ekubo::types::bounds::Bounds;
    use ekubo::types::keys::PoolKey;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use crate::privacy_account::{IPrivacyAccountDispatcher, IPrivacyAccountDispatcherTrait};
    use crate::utils::is_valid_signature;
    use super::{PositionData, PositionState};

    #[derive(Drop, Serde)]
    struct CreatePositionParams {
        public_key: felt252,
        signature: Span<felt252>,
        nonce: felt252,
        pool_key: PoolKey,
        bounds: Bounds,
        transfer_amount: u128,
        transfer_asset: ContractAddress,
        min_liquidity: u128,
        secret_and_nullifier_hash: u256,
    }

    #[storage]
    struct Storage {
        positions: ContractAddress,
        nft: ContractAddress,
        privacy_account: ContractAddress,
        position_data: Map<felt252, PositionData>,
        public_keys_in_use: Map<felt252, bool>,
        public_keys_nonces: Map<felt252, felt252>,
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
        pub const TRANSFER_FAILED: felt252 = 'TRANSFER_FAILED';
        pub const POSITION_ALREADY_COMPLETED: felt252 = 'POSITION_ALREADY_COMPLETED';
        pub const NOT_OWNER: felt252 = 'NOT_OWNER';
        pub const INVALID_STATE: felt252 = 'INVALID_STATE';
        pub const INVALID_TOKEN: felt252 = 'INVALID_TOKEN';
        pub const DEPOSIT_NFT_FAILED: felt252 = 'DEPOSIT_NFT_FAILED';
        pub const POSITION_NOT_FOUND: felt252 = 'POSITION_NOT_FOUND';
    }

    #[event]
    #[derive(Drop, PartialEq, starknet::Event)]
    enum Event {
        PositionCreated: EkuboPositionCreated,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct EkuboPositionCreated {
        public_key: felt252,
        position_id: u64,
        pool_key: PoolKey,
    }

    #[abi(embed_v0)]
    impl EkuboCreatePositionExtensionInfo of super::IEkuboCreatePositionExtension<ContractState> {
        fn get_position_info(
            self: @ContractState, msg_hash: felt252, pub_key: felt252, signature: Span<felt252>,
        ) -> PositionData {
            let is_owner = is_valid_signature(msg_hash, pub_key, signature);
            assert(is_owner, Errors::NOT_OWNER);

            let position_data = self.position_data.entry(pub_key).read();
            assert(self.public_keys_in_use.entry(pub_key).read(), Errors::POSITION_NOT_FOUND);

            position_data
        }

        fn get_public_key_nonce(self: @ContractState, pub_key: felt252) -> felt252 {
            let pub_key_initialized = self.public_keys_in_use.entry(pub_key).read();
            if pub_key_initialized {
                self.public_keys_nonces.entry(pub_key).read()
            } else {
                0x0
            }
        }
    }

    #[abi(embed_v0)]
    impl EkuboCreatePositionExtension of crate::zk_extension::IZkExtension<ContractState> {
        fn execute(ref self: ContractState, calldata: Span<felt252>) {
            let mut input = calldata;
            let params = Serde::<CreatePositionParams>::deserialize(ref input).unwrap();

            let pub_key_initialized = self.public_keys_in_use.entry(params.public_key).read();

            // Ownership verification
            let is_owner = is_valid_signature(params.nonce, params.public_key, params.signature);
            let mut expected_nonce: felt252 = 0x0;

            if pub_key_initialized {
                expected_nonce = self.public_keys_nonces.entry(params.public_key).read();
            }
            assert(is_owner && expected_nonce == params.nonce, Errors::NOT_OWNER);
            self.public_keys_nonces.entry(params.public_key).write(expected_nonce + 1);

            let caller = get_caller_address();
            let this = starknet::get_contract_address();

            if pub_key_initialized {
                // Modify existing position
                let mut position = self.position_data.entry(params.public_key).read();

                assert(
                    position.state != PositionState::Completed, Errors::POSITION_ALREADY_COMPLETED,
                );

                // Validate correct token
                let is_token0 = params.transfer_asset == position.token0;
                let is_token1 = params.transfer_asset == position.token1;
                assert(is_token0 || is_token1, Errors::INVALID_TOKEN);

                // Transfer the second token
                let token = IERC20Dispatcher { contract_address: params.transfer_asset };
                assert(
                    token.transfer_from(caller, this, params.transfer_amount.into()),
                    Errors::TRANSFER_FAILED,
                );

                // Update position data with second token
                if is_token0 && position.state == PositionState::Token1Deposited {
                    // Case 1: Deposit token0, position already has token1
                    position.amount0 = params.transfer_amount;
                    position.state = PositionState::Token0Deposited;
                } else if is_token1 && position.state == PositionState::Token0Deposited {
                    // Case 2: Deposit token1, position already has token0
                    position.amount1 = params.transfer_amount;
                    position.state = PositionState::Token1Deposited;
                } else {
                    assert(false, Errors::INVALID_STATE);
                }

                // Execute position creation when we have both tokens
                if (position.amount0 > 0 && position.amount1 > 0) {
                    self
                        ._create_ekubo_position(
                            ref position,
                            params.pool_key,
                            params.bounds,
                            params.min_liquidity,
                            params.secret_and_nullifier_hash,
                            params.public_key,
                        );
                }

                self.position_data.entry(params.public_key).write(position);
            } else {
                // Initialize position for the first time
                self.public_keys_in_use.entry(params.public_key).write(true);

                // Transfer first token
                let token = IERC20Dispatcher { contract_address: params.transfer_asset };
                assert(
                    token.transfer_from(caller, this, params.transfer_amount.into()),
                    Errors::TRANSFER_FAILED,
                );

                // Determine which token was deposited first
                let state = if params.transfer_asset == params.pool_key.token0 {
                    PositionState::Token0Deposited
                } else {
                    PositionState::Token1Deposited
                };

                let position_data = PositionData {
                    state,
                    token0: params.pool_key.token0,
                    token1: params.pool_key.token1,
                    amount0: if params.transfer_asset == params.pool_key.token0 {
                        params.transfer_amount
                    } else {
                        0
                    },
                    amount1: if params.transfer_asset == params.pool_key.token1 {
                        params.transfer_amount
                    } else {
                        0
                    },
                    position_id: 0,
                };

                self.position_data.entry(params.public_key).write(position_data);
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _create_ekubo_position(
            ref self: ContractState,
            ref position: PositionData,
            pool_key: PoolKey,
            bounds: Bounds,
            min_liquidity: u128,
            secret_and_nullifier_hash: u256,
            public_key: felt252,
        ) {
            let pos_addr = self.positions.read();

            // Transfer tokens to Positions contract
            let t0 = IERC20Dispatcher { contract_address: position.token0 };
            let t1 = IERC20Dispatcher { contract_address: position.token1 };

            assert(t0.transfer(pos_addr, position.amount0.into()), Errors::TRANSFER_FAILED);
            assert(t1.transfer(pos_addr, position.amount1.into()), Errors::TRANSFER_FAILED);

            // Mint and deposit
            let (position_id, _liquidity) = IPositionsDispatcher { contract_address: pos_addr }
                .mint_and_deposit(pool_key, bounds, min_liquidity);

            // Clear dust
            let clear = IClearDispatcher { contract_address: pos_addr };
            clear
                .clear(
                    ekubo::interfaces::erc20::IERC20Dispatcher {
                        contract_address: position.token0,
                    },
                );
            clear
                .clear(
                    ekubo::interfaces::erc20::IERC20Dispatcher {
                        contract_address: position.token1,
                    },
                );

            // Deposit NFT to privacy account
            let privacy = IPrivacyAccountDispatcher {
                contract_address: self.privacy_account.read(),
            };
            assert(
                privacy.deposit_nft(secret_and_nullifier_hash, position_id, self.nft.read()),
                Errors::DEPOSIT_NFT_FAILED,
            );

            // Update position data
            position.position_id = position_id;
            position.state = PositionState::Completed;

            // Emit event
            self
                .emit(
                    Event::PositionCreated(
                        EkuboPositionCreated { public_key, position_id, pool_key },
                    ),
                );
        }
    }
}
