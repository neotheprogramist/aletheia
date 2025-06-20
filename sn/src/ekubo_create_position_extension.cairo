#[starknet::contract]
mod EkuboCreatePositionExtension {
    use ekubo::components::clear::{IClearDispatcher, IClearDispatcherTrait};
    use ekubo::interfaces::positions::{IPositionsDispatcher, IPositionsDispatcherTrait};
    use ekubo::types::bounds::Bounds;
    use ekubo::types::keys::PoolKey;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::storage::{
        Map, StorageMapReadAccess, StoragePathEntry, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use crate::privacy_account::{IPrivacyAccountDispatcher, IPrivacyAccountDispatcherTrait};

    #[derive(PartialEq, Copy, Drop, Serde, starknet::Store)]
    struct PendingPosition {
        token0: ContractAddress,
        token1: ContractAddress,
        amount0: u128,
        amount1: u128,
        is_pending: bool,
    }

    #[storage]
    struct Storage {
        positions: ContractAddress,
        nft: ContractAddress,
        privacy_account: ContractAddress,
        // Simple storage for pending positions
        pending_positions: Map<ContractAddress, PendingPosition>,
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
        pub const INVALID_STEP: felt252 = 'INVALID_STEP';
        pub const POSITION_ALREADY_PENDING: felt252 = 'POSITION_ALREADY_PENDING';
        pub const NO_PENDING_POSITION: felt252 = 'NO_PENDING_POSITION';
        pub const DEPOSIT_NFT_FAILED: felt252 = 'DEPOSIT_NFT_FAILED';
    }

    #[derive(Drop, Serde)]
    enum CreatePositionParams {
        Step1: Step1Data,
        Step2: Step2Data,
    }

    #[derive(Drop, Serde)]
    struct Step1Data {
        pool_key: PoolKey,
        bounds: Bounds,
        transfer_amount: u128, // Amount of token being transferred in this step
        min_liquidity: u128,
        secret_and_nullifier_hash: u256,
    }

    #[derive(Drop, Serde)]
    struct Step2Data {
        pool_key: PoolKey,
        bounds: Bounds,
        transfer_amount: u128, // Amount of second token being transferred
        min_liquidity: u128,
        secret_and_nullifier_hash: u256,
    }

    #[abi(embed_v0)]
    impl EkuboCreatePositionExtension of crate::zk_extension::IZkExtension<ContractState> {
        fn execute(ref self: ContractState, calldata: Span<felt252>) {
            let mut input = calldata;
            let params = Serde::<CreatePositionParams>::deserialize(ref input).unwrap();

            match params {
                CreatePositionParams::Step1(data) => self._execute_step1(data),
                CreatePositionParams::Step2(data) => self._execute_step2(data),
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _execute_step1(ref self: ContractState, step1_data: Step1Data) {
            let caller = get_caller_address();
            let this = starknet::get_contract_address();

            // Check if there's already a pending position
            let pending = self.pending_positions.entry(caller).read();
            assert(!pending.is_pending, Errors::POSITION_ALREADY_PENDING);

            // Privacy pools approved one token - figure out which one and transfer it
            // We need to determine which token was approved by trying both
            let t0 = IERC20Dispatcher { contract_address: step1_data.pool_key.token0 };
            let t1 = IERC20Dispatcher { contract_address: step1_data.pool_key.token1 };

            // Try to transfer token0 first
            let token0_success = t0.transfer_from(caller, this, step1_data.transfer_amount.into());

            let (transferred_token, amount0, amount1) = if token0_success {
                // Token0 was approved and transferred
                (step1_data.pool_key.token0, step1_data.transfer_amount, 0)
            } else {
                // Try token1
                assert(
                    t1.transfer_from(caller, this, step1_data.transfer_amount.into()),
                    Errors::TRANSFER_FAILED,
                );
                (step1_data.pool_key.token1, 0, step1_data.transfer_amount)
            };

            // Store pending position
            let pending_position = PendingPosition {
                token0: step1_data.pool_key.token0,
                token1: step1_data.pool_key.token1,
                amount0,
                amount1,
                is_pending: true,
            };

            self.pending_positions.entry(caller).write(pending_position);
        }

        fn _execute_step2(ref self: ContractState, step2_data: Step2Data) {
            let caller = get_caller_address();
            let this = starknet::get_contract_address();

            // Store needed values from step2_data before it gets moved
            let pool_key = step2_data.pool_key;
            let bounds = step2_data.bounds;
            let min_liquidity = step2_data.min_liquidity;
            let secret_and_nullifier_hash = step2_data.secret_and_nullifier_hash;
            let transfer_amount = step2_data.transfer_amount;

            // Get pending position
            let mut pending = self.pending_positions.entry(caller).read();
            assert(pending.is_pending, Errors::NO_PENDING_POSITION);

            // Transfer the second token (the one that wasn't transferred in step 1)
            let t0 = IERC20Dispatcher { contract_address: pending.token0 };
            let t1 = IERC20Dispatcher { contract_address: pending.token1 };

            if pending.amount0 == 0 {
                // Need to transfer token0
                assert(
                    t0.transfer_from(caller, this, transfer_amount.into()), Errors::TRANSFER_FAILED,
                );
                pending.amount0 = transfer_amount;
            } else {
                // Need to transfer token1
                assert(
                    t1.transfer_from(caller, this, transfer_amount.into()), Errors::TRANSFER_FAILED,
                );
                pending.amount1 = transfer_amount;
            }

            let pos_addr = self.positions.read();

            // Now transfer both tokens from this contract to Positions contract
            assert(t0.transfer(pos_addr, pending.amount0.into()), Errors::TRANSFER_FAILED);
            assert(t1.transfer(pos_addr, pending.amount1.into()), Errors::TRANSFER_FAILED);

            // Mint and deposit
            let (position_id, _liquidity) = IPositionsDispatcher { contract_address: pos_addr }
                .mint_and_deposit(pool_key, bounds, min_liquidity);

            // Clear dust
            let clear = IClearDispatcher { contract_address: pos_addr };
            clear
                .clear(
                    ekubo::interfaces::erc20::IERC20Dispatcher { contract_address: pending.token0 },
                );
            clear
                .clear(
                    ekubo::interfaces::erc20::IERC20Dispatcher { contract_address: pending.token1 },
                );

            // Deposit NFT to privacy account
            let privacy = IPrivacyAccountDispatcher {
                contract_address: self.privacy_account.read(),
            };
            assert(
                privacy.deposit_nft(secret_and_nullifier_hash, position_id, self.nft.read()),
                Errors::DEPOSIT_NFT_FAILED,
            );

            // Clear pending position
            let empty_pending = PendingPosition {
                token0: pending.token0,
                token1: pending.token1,
                amount0: 0,
                amount1: 0,
                is_pending: false,
            };
            self.pending_positions.entry(caller).write(empty_pending);
        }
    }
}
