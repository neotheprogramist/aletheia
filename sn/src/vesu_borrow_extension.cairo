use sn::vesu_data_model::PositionInfo;

#[starknet::interface]
pub trait IVesuBorrowExtension<TContractState> {
    fn get_position_info(
        self: @TContractState, msg_hash: felt252, pub_key: felt252, signature: Span<felt252>,
    ) -> PositionInfo;

    fn get_public_key_nonce(self: @TContractState, pub_key: felt252) -> felt252;
}

#[starknet::contract]
mod VesuBorrowExtension {
    use alexandria_math::i257::I257Impl;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use sn::vesu_data_model::{
        BorrowParams, PositionContractParams, PositionInfo, State, UpdatePositionResponse,
    };
    use starknet::storage::{
        Map, StorageMapReadAccess, StoragePathEntry, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress};
    use super::super::privacy_account::{IPrivacyAccountDispatcher, IPrivacyAccountDispatcherTrait};
    use super::super::utils::{deploy, is_valid_signature};
    use super::super::vesu_position::{
        IVesuBorrowPositionExtensionDispatcher, IVesuBorrowPositionExtensionDispatcherTrait,
    };
    pub mod Errors {
        pub const TORNADO_DEPOSIT_FAILED: felt252 = 'BorrowExtension: Deposit Fail!';
        pub const APPROVE_FAILED: felt252 = 'Extension: Approve failed!';
        pub const BORROW_OPTION: felt252 = 'Wrong Borrow/Repay Option';
        pub const DEBT_DELTA: felt252 = 'Debt delta == 0';
        pub const TRANSFER_FAILED: felt252 = 'Transfer Failed';
        pub const POSITION_ERROR: felt252 = 'Position already used';
        pub const PUBLIC_KEY_ERROR: felt252 = 'Public Key already used';
        pub const NOT_OWNER: felt252 = 'Not owner - signature invalid';
    }

    #[derive(PartialEq, Copy, Drop, Serde, starknet::Store)]
    struct PositionData {
        state: State,
        collateral_transfer_amount: u256,
        collateral_asset: ContractAddress,
        debt_transfer_amount: u256,
        debt_asset: ContractAddress,
        position_address: ContractAddress,
    }

    #[event]
    #[derive(Drop, PartialEq, starknet::Event)]
    enum Event {
        Borrow: VesuBorrow,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct VesuBorrow {
        response: UpdatePositionResponse,
    }

    #[storage]
    struct Storage {
        pub singleton_address: ContractAddress,
        pub core_address: ContractAddress,
        pub positions: Map<felt252, PositionData>,
        pub public_keys_in_use: Map<felt252, bool>,
        pub public_keys_nonces: Map<felt252, felt252>,
        pub position_contract_class_hash: ClassHash,
        pub contract_counter: u64,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        singleton_address: ContractAddress,
        core_address: ContractAddress,
        position_contract_class_hash: ClassHash,
    ) {
        self.singleton_address.write(singleton_address);
        self.core_address.write(core_address);
        self.position_contract_class_hash.write(position_contract_class_hash);
        self.contract_counter.write(0);
    }

    #[abi(embed_v0)]
    impl VesuBorrowExtensionInfo of super::IVesuBorrowExtension<ContractState> {
        fn get_position_info(
            self: @ContractState, msg_hash: felt252, pub_key: felt252, signature: Span<felt252>,
        ) -> PositionInfo {
            let is_owner = is_valid_signature(msg_hash, pub_key, signature);
            assert(is_owner, Errors::NOT_OWNER);

            let position_contract_address = self.positions.read(pub_key).position_address;

            let position_dispatcher = IVesuBorrowPositionExtensionDispatcher {
                contract_address: position_contract_address,
            };

            let position_info = position_dispatcher.get_position_info();
            position_info
        }

        fn get_public_key_nonce(self: @ContractState, pub_key: felt252) -> felt252 {
            let pub_key_initialized = self.public_keys_in_use.read(pub_key);
            if pub_key_initialized {
                self.public_keys_nonces.read(pub_key)
            } else {
                0x0
            }
        }
    }

    #[abi(embed_v0)]
    impl VesuBorrowExtension of crate::zk_extension::IZkExtension<ContractState> {
        fn execute(ref self: ContractState, calldata: Span<felt252>) {
            let mut input = calldata;

            let mut params = Serde::<BorrowParams>::deserialize(ref input).unwrap();

            let pub_key_initialized = self.public_keys_in_use.read(params.public_key);

            // Ownership verification
            let is_owner = is_valid_signature(params.nonce, params.public_key, params.signature);
            let mut expected_nonce: felt252 = 0x0;

            if pub_key_initialized {
                expected_nonce = self.public_keys_nonces.read(params.public_key).into();
            }
            assert(is_owner && expected_nonce == params.nonce, Errors::NOT_OWNER);
            self.public_keys_nonces.entry(params.public_key).write(expected_nonce + 1);

            // Modify existing position
            if pub_key_initialized {
                // Modify position
                let mut position = self.positions.read(params.public_key);
                let this = starknet::get_contract_address();

                if position.state == State::CollateralDeposit {
                    let token = IERC20Dispatcher { contract_address: params.transfer_asset };
                    token.transfer_from(self.core_address.read(), this, params.transfer_amount);
                    let position_data = PositionData {
                        state: State::DebtDeposit,
                        collateral_transfer_amount: params.transfer_amount,
                        collateral_asset: params.transfer_asset,
                        debt_transfer_amount: position.debt_transfer_amount,
                        debt_asset: position.debt_asset,
                        position_address: position.position_address,
                    };

                    self.positions.entry(params.public_key).write(position_data);
                } else if position.state == State::DebtDeposit { // second deposit
                    let token = IERC20Dispatcher { contract_address: params.transfer_asset };
                    token.transfer_from(self.core_address.read(), this, params.transfer_amount);

                    position.state = State::CollateralDeposit;
                    position.debt_transfer_amount = params.transfer_amount;
                    position.debt_asset = params.transfer_asset;

                    let collateral_token = IERC20Dispatcher {
                        contract_address: position.collateral_asset,
                    };
                    let debt_token = IERC20Dispatcher { contract_address: position.debt_asset };

                    collateral_token
                        .approve(
                            spender: position.position_address,
                            amount: position.collateral_transfer_amount,
                        );
                    debt_token
                        .approve(
                            spender: position.position_address,
                            amount: position.debt_transfer_amount,
                        );
                    let position_dispatcher = IVesuBorrowPositionExtensionDispatcher {
                        contract_address: position.position_address,
                    };
                    params.modify_position_params.user = position.position_address;
                    let params_for_position = PositionContractParams {
                        modify_position_params: params.modify_position_params,
                        collateral_approve: position.collateral_transfer_amount,
                        debt_approve: position.debt_transfer_amount,
                    };
                    let response = position_dispatcher.execute(params_for_position);

                    // Transfer refunds from position contract
                    collateral_token
                        .transfer_from(position.position_address, this, response.collateral_refund);
                    debt_token.transfer_from(position.position_address, this, response.debt_refund);

                    // Approve for core contract
                    collateral_token
                        .approve(
                            spender: self.core_address.read(), amount: response.collateral_refund,
                        );

                    debt_token
                        .approve(spender: self.core_address.read(), amount: response.debt_refund);

                    let core_dispatcher = IPrivacyAccountDispatcher {
                        contract_address: self.core_address.read(),
                    };

                    // Execute deposits
                    let ok_dep = core_dispatcher
                        .deposit(
                            params.secret_and_nullifier_hash_collateral_repay,
                            response.collateral_refund,
                            params.modify_position_params.collateral_asset,
                        );

                    assert(ok_dep, Errors::TORNADO_DEPOSIT_FAILED);

                    let ok_dep = core_dispatcher
                        .deposit(
                            params.secret_and_nullifier_hash_debt_repay,
                            response.debt_refund,
                            params.modify_position_params.debt_asset,
                        );

                    assert(ok_dep, Errors::TORNADO_DEPOSIT_FAILED);

                    let position_data = PositionData {
                        state: State::CollateralDeposit,
                        collateral_transfer_amount: 0x0.try_into().unwrap(),
                        collateral_asset: position.collateral_asset,
                        debt_transfer_amount: 0x0.try_into().unwrap(),
                        debt_asset: params.transfer_asset,
                        position_address: position.position_address,
                    };

                    self.positions.entry(params.public_key).write(position_data);
                }
            } else {
                // Initialize position for the first time
                self.public_keys_in_use.entry(params.public_key).write(true);
                let this = starknet::get_contract_address();

                let deploy_calldata: Array<felt252> = array![
                    self.singleton_address.read().into(),
                    this.into(),
                    params.modify_position_params.collateral_asset.into(),
                    params.modify_position_params.debt_asset.into(),
                ];

                // Deploy contract for specific position
                let position_contract_address = deploy(
                    self.position_contract_class_hash.read(),
                    deploy_calldata,
                    self.contract_counter.read().into(),
                );

                let counter = self.contract_counter.read() + 1;
                self.contract_counter.write(counter);

                let token = IERC20Dispatcher { contract_address: params.transfer_asset };
                token.transfer_from(self.core_address.read(), this, params.transfer_amount);
                let position_data = PositionData {
                    state: State::DebtDeposit,
                    collateral_transfer_amount: params.transfer_amount,
                    collateral_asset: params.transfer_asset,
                    debt_transfer_amount: 0x0.into(),
                    debt_asset: 0x0.try_into().unwrap(),
                    position_address: position_contract_address,
                };

                self.positions.entry(params.public_key).write(position_data);
            }
        }
    }
}
