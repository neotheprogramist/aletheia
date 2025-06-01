// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts for Cairo ^0.20.0
use starknet::ContractAddress;
use starknet::account::Call;

#[starknet::interface]
pub trait IUltraKeccakHonkVerifier<TContractState> {
    fn verify_ultra_keccak_honk_proof(
        self: @TContractState, full_proof_with_hints: Span<felt252>,
    ) -> Option<Span<u256>>;
}

#[starknet::interface]
pub trait IPrivacyAccount<TContractState> {
    fn deposit(
        ref self: TContractState,
        secret_and_nullifier_hash: u256,
        amount: u256,
        token_address: ContractAddress,
    ) -> bool;
    fn execute_extension(
        ref self: TContractState,
        proof: Span<felt252>,
        external_contract_address: ContractAddress,
        calldata: Span<felt252>,
    ) -> bool;
    fn merge(ref self: TContractState, proof: Span<felt252>) -> bool;
    fn transfer(ref self: TContractState, proof: Span<felt252>) -> bool;
    fn get_fee_for_extension(self: @TContractState, extension_address: ContractAddress) -> u256;
    fn get_fee_for_merge(self: @TContractState) -> u256;
    fn get_fee_for_transfer(self: @TContractState) -> u256;
    fn get_current_gas_price(self: @TContractState) -> u256;
    fn set_current_gas_price(ref self: TContractState, gas_price: u256) -> bool;
    fn add_trusted_extension(
        ref self: TContractState, contract_address: ContractAddress, gas_consumed: u128,
    ) -> bool;
    fn current_root(self: @TContractState) -> u256;
    fn get_roots(self: @TContractState) -> Array<u256>;
    fn __execute__(self: @TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn __validate__(self: @TContractState, calls: Array<Call>) -> felt252;
    fn is_valid_signature(
        self: @TContractState, hash: felt252, signature: Array<felt252>,
    ) -> felt252;
    fn get_accumulated_fee(self: @TContractState) -> u256;
    fn withdraw_all_accumulated_fee(ref self: TContractState, recipient: ContractAddress) -> u256;
    fn withdraw_accumulated_fee(
        ref self: TContractState, recipient: ContractAddress, amount: u256,
    ) -> u256;
}

#[derive(Drop)]
struct PublicInputWithdraw {
    root_1: u256,
    nullifier_1: u256,
    token_address_1: ContractAddress,
    amount: u256,
    root_2: u256,
    nullifier_2: u256,
    token_address_2: ContractAddress,
    gas_fee: u256,
    refund_commitment_hash: u256,
    refund_commitment_hash_fee: u256,
    recipient: ContractAddress,
}

#[generate_trait]
impl PublicInputWithdrawImpl of PublicInputWithdrawTrait {
    fn from_u256_span(span: Span<u256>) -> PublicInputWithdraw {
        let token_addres_1: felt252 = (*span[2]).try_into().unwrap();
        let token_addres_2: felt252 = (*span[6]).try_into().unwrap();

        let recipient: felt252 = (*span[10]).try_into().unwrap();

        PublicInputWithdraw {
            root_1: *span[0],
            nullifier_1: *span[1],
            recipient: recipient.try_into().unwrap(),
            refund_commitment_hash: *span[8],
            amount: *span[3],
            gas_fee: *span[7],
            token_address_1: token_addres_1.try_into().unwrap(),
            token_address_2: token_addres_2.try_into().unwrap(),
            root_2: *span[4],
            nullifier_2: *span[5],
            refund_commitment_hash_fee: *span[9],
        }
    }
}

#[derive(Drop)]
struct PublicInputMerge {
    nullifier_hash_1: u256,
    deposit_root_1: u256,
    nullifier_hash_2: u256,
    deposit_root_2: u256,
    fee_nullifier_hash: u256,
    fee_deposit_root: u256,
    merge_commitment_hash: u256,
    gas_fee: u256,
    refund_fee_commitment_hash: u256,
    token_address: ContractAddress,
    token_address_fee: ContractAddress,
}

#[generate_trait]
impl PublicInputMergeImpl of PublicInputMergeTrait {
    fn from_u256_span(span: Span<u256>) -> PublicInputMerge {
        let token_address: felt252 = (*span[1]).try_into().unwrap();
        let token_address_fee: felt252 = (*span[6]).try_into().unwrap();

        PublicInputMerge {
            nullifier_hash_1: *span[0],
            deposit_root_1: *span[2],
            nullifier_hash_2: *span[3],
            deposit_root_2: *span[4],
            fee_nullifier_hash: *span[5],
            fee_deposit_root: *span[7],
            gas_fee: *span[8],
            refund_fee_commitment_hash: *span[9],
            merge_commitment_hash: *span[10],
            token_address: token_address.try_into().unwrap(),
            token_address_fee: token_address_fee.try_into().unwrap(),
        }
    }
}

#[derive(Drop)]
struct PublicInputTransfer {
    // Deposit
    root: u256,
    nullifier_hash: u256,
    token_address: ContractAddress,
    token_address_to_hash: u256,
    amount: u256,
    // Fee deposit
    fee_root: u256,
    fee_nullifier: u256,
    fee_token_address: ContractAddress,
    gas_fee: u256,
    // Deposit refund
    refund_commitment_hash: u256,
    // Fee refund
    refund_commitment_hash_fee: u256,
    recipient_secret_and_nullifier_hash: u256,
}

#[generate_trait]
impl PublicInputTransferImpl of PublicInputTransferTrait {
    fn from_u256_span(span: Span<u256>) -> PublicInputTransfer {
        let token_address: felt252 = (*span[2]).try_into().unwrap();
        let token_address_fee: felt252 = (*span[6]).try_into().unwrap();

        PublicInputTransfer {
            // Deposit
            root: *span[0],
            nullifier_hash: *span[1],
            token_address: token_address.try_into().unwrap(),
            token_address_to_hash: *span[2],
            amount: *span[3],
            // Fee deposit
            fee_root: *span[4],
            fee_nullifier: *span[5],
            fee_token_address: token_address_fee.try_into().unwrap(),
            gas_fee: *span[7],
            // Refund deposit
            refund_commitment_hash: *span[8],
            // Refund fee
            refund_commitment_hash_fee: *span[9],
            recipient_secret_and_nullifier_hash: *span[10],
        }
    }
}


#[starknet::contract(account)]
pub mod PrivacyAccount {
    use core::array::{Array, ArrayTrait};
    use core::option::OptionTrait;
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::account::extensions::SRC9Component;
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin::upgrades::UpgradeableComponent;
    use starknet::account::Call;
    use starknet::class_hash::ClassHash;
    use starknet::event::EventEmitter;
    use starknet::storage::{
        Map, StorageMapReadAccess, StoragePathEntry, StoragePointerReadAccess,
        StoragePointerWriteAccess, VecTrait,
    };
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use crate::merkle::MerkleTreeComponent;
    use crate::merkle::MerkleTreeComponent::InternalTrait;
    use crate::utils::{execute_calls, is_valid};
    use crate::zk_extension::{IZkExtensionDispatcher, IZkExtensionDispatcherTrait};
    use crate::{hash, verify_ultra_keccak_honk_proof};
    use super::{
        IPrivacyAccount, PublicInputMergeImpl, PublicInputTransferImpl, PublicInputWithdrawImpl,
    };

    #[abi(embed_v0)]
    impl Clear = ekubo::components::clear::ClearImpl<ContractState>;

    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: SRC9Component, storage: src9, event: SRC9Event);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: MerkleTreeComponent, storage: merkle, event: MerkleEvent);

    // External
    #[abi(embed_v0)]
    impl OutsideExecutionV2Impl =
        SRC9Component::OutsideExecutionV2Impl<ContractState>;

    // Internal
    impl OutsideExecutionInternalImpl = SRC9Component::InternalImpl<ContractState>;
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl MerkleTreeInternalImpl = MerkleTreeComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        src9: SRC9Component::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        merkle: MerkleTreeComponent::Storage,
        nullifier_hashes: Map<u256, bool>,
        pub extension_verifier: ClassHash,
        pub merge_verifier: ClassHash,
        pub transfer_verifier: ClassHash,
        strk_token_address: ContractAddress,
        current_gas_price: u256,
        trusted_extensions: Map<ContractAddress, u128>,
        users_balance: u256,
        accumulated_fee: u256,
        initial_fee_buffer: u256,
        merge_gas_consumed: u128,
        transfer_gas_consumed: u128,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    pub struct Deposit {
        #[key]
        secret_and_nullifier_hash: u256,
        amount: u256,
        token_address: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        SRC9Event: SRC9Component::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        MerkleEvent: MerkleTreeComponent::Event,
        FeeWithdrawal: FeeWithdrawal,
        Deposit: Deposit,
    }


    #[derive(Drop, PartialEq, starknet::Event)]
    pub struct FeeWithdrawal {
        #[key]
        pub recipient: ContractAddress,
        pub amount: u256,
        pub token_address: ContractAddress,
    }


    pub mod Errors {
        pub const INVALID_PROOF: felt252 = 'Pool: invalid proof';
        pub const NULLIFIER_ALREADY_USED: felt252 = 'Pool: nullifier already used';
        pub const INVALID_ROOT: felt252 = 'Pool: invalid root';
        pub const INSUFFICIENT_FEE: felt252 = 'Pool: insufficient fee';
        pub const INVALID_FEE_TOKEN: felt252 = 'Pool: invalid fee token';
    }


    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        extension_verifier: ClassHash,
        merge_verifier: ClassHash,
        transfer_verifier: ClassHash,
        core_address: ContractAddress,
        strk_token_address: ContractAddress,
        initial_fee_buffer: u256,
        current_gas_price: u256,
        merge_gas_consumed: u128,
        transfer_gas_consumed: u128,
    ) {
        // 1) Standard ownership & merkle init
        self.ownable.initializer(owner);
        self.merkle.initializer();

        // 2) Store verifier addresses
        self.extension_verifier.write(extension_verifier);
        self.merge_verifier.write(merge_verifier);
        self.transfer_verifier.write(transfer_verifier);

        // 3) Store STRK token addresses
        self.strk_token_address.write(strk_token_address);

        // 4) Pull initial_fee_buffer STRK from deployer into this contract
        //    Deployer MUST have done: IERC20Dispatcher.approve(<this_contract>, initial_fee_buffer)
        let this = get_contract_address();
        let token = IERC20Dispatcher { contract_address: strk_token_address };
        token.transfer_from(owner, this, initial_fee_buffer);

        // 5) Seed your fee‐tracking storage
        self.initial_fee_buffer.write(initial_fee_buffer);
        self.accumulated_fee.write(initial_fee_buffer);

        // 6) Initialize users_balance to zero
        self.users_balance.write(0);

        // 7) Set current gas price
        self.current_gas_price.write(current_gas_price);

        // 8) Set gas consumed
        self.merge_gas_consumed.write(merge_gas_consumed);
        self.transfer_gas_consumed.write(transfer_gas_consumed);
    }

    #[abi(embed_v0)]
    impl PrivacyAccount of super::IPrivacyAccount<ContractState> {
        fn deposit(
            ref self: ContractState,
            secret_and_nullifier_hash: u256,
            amount: u256,
            token_address: ContractAddress,
        ) -> bool {
            let secret_nullifier_amount_hash = hash(secret_and_nullifier_hash, amount);
            let token_felt: felt252 = token_address.into();
            let token_u256: u256 = token_felt.into();
            let commitment_hash = hash(secret_nullifier_amount_hash, token_u256);
            self.merkle.add_leaf(commitment_hash);
            let caller = get_caller_address();
            let this = get_contract_address();
            let token = IERC20Dispatcher { contract_address: token_address };
            token.transfer_from(caller, this, amount.into());
            self.users_balance.write(self.users_balance.read() + amount);
            true
        }

        fn execute_extension(
            ref self: ContractState,
            proof: Span<felt252>,
            external_contract_address: ContractAddress,
            calldata: Span<felt252>,
        ) -> bool {
            let public_input_serialized = verify_ultra_keccak_honk_proof(
                self.extension_verifier.read(), proof,
            );

            let public_input = PublicInputWithdrawImpl::from_u256_span(public_input_serialized);

            // Validate if fee is in strk
            assert(
                public_input.token_address_2 == self.strk_token_address.read(),
                Errors::INVALID_FEE_TOKEN,
            );

            // Validate gas fee
            let calculated_fee = self.get_fee_for_extension(external_contract_address);
            assert(public_input.gas_fee >= calculated_fee, Errors::INSUFFICIENT_FEE);

            // Update accumulated fee and lower users balance -> funds going out of the contract
            self.accumulated_fee.write(self.accumulated_fee.read() + public_input.gas_fee);
            self.users_balance.write(self.users_balance.read() - public_input.amount);

            assert(
                !self.nullifier_hashes.read(public_input.nullifier_1),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.nullifier_1).write(true);

            assert(self.merkle.roots.read(public_input.root_1), Errors::INVALID_ROOT);

            let token = IERC20Dispatcher { contract_address: public_input.token_address_1 };

            token.approve(external_contract_address, public_input.amount);

            let external_contract = IZkExtensionDispatcher {
                contract_address: external_contract_address,
            };
            external_contract.execute(calldata);

            token.approve(external_contract_address, 0);

            self.merkle.add_leaf(public_input.refund_commitment_hash);

            assert(
                !self.nullifier_hashes.read(public_input.nullifier_2),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.nullifier_2).write(true);

            assert(self.merkle.roots.read(public_input.root_2), Errors::INVALID_ROOT);

            self.merkle.add_leaf(public_input.refund_commitment_hash_fee);

            true
        }

        fn merge(ref self: ContractState, proof: Span<felt252>) -> bool {
            let public_input_serialized = verify_ultra_keccak_honk_proof(
                self.merge_verifier.read(), proof,
            );

            let public_input = PublicInputMergeImpl::from_u256_span(public_input_serialized);
            // Validate if fee is in strk
            assert(
                public_input.token_address_fee == self.strk_token_address.read(),
                Errors::INVALID_FEE_TOKEN,
            );

            // Validate gas fee - currently using execute extension fee
            let calculated_fee = self.get_fee_for_merge();
            assert(public_input.gas_fee >= calculated_fee, Errors::INSUFFICIENT_FEE);

            // Validate if 1st deposit is not nullfied
            assert(
                !self.nullifier_hashes.read(public_input.nullifier_hash_1),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.nullifier_hash_1).write(true);

            // Validate if second deposit is not nullifier
            assert(
                !self.nullifier_hashes.read(public_input.nullifier_hash_2),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.nullifier_hash_2).write(true);

            // Validate if fee deposit is not nullfied
            assert(
                !self.nullifier_hashes.read(public_input.fee_nullifier_hash),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.fee_nullifier_hash).write(true);

            assert(self.merkle.roots.read(public_input.deposit_root_1), Errors::INVALID_ROOT);
            assert(self.merkle.roots.read(public_input.deposit_root_2), Errors::INVALID_ROOT);
            assert(self.merkle.roots.read(public_input.fee_deposit_root), Errors::INVALID_ROOT);

            self.merkle.add_leaf(public_input.merge_commitment_hash);
            self.merkle.add_leaf(public_input.refund_fee_commitment_hash);
            true
        }

        fn transfer(ref self: ContractState, proof: Span<felt252>) -> bool {
            let public_input_serialized = verify_ultra_keccak_honk_proof(
                self.transfer_verifier.read(), proof,
            );

            let public_input = PublicInputTransferImpl::from_u256_span(public_input_serialized);

            // Validate despoit and fee deposit nullifiers
            assert(
                !self.nullifier_hashes.read(public_input.nullifier_hash),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.nullifier_hash).write(true);

            assert(
                !self.nullifier_hashes.read(public_input.fee_nullifier),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.fee_nullifier).write(true);

            // Valdiate despoit and fee deposit roots
            assert(self.merkle.roots.read(public_input.root), Errors::INVALID_ROOT);
            assert(self.merkle.roots.read(public_input.fee_root), Errors::INVALID_ROOT);

            // Add refund leaves for deposit and fee desposit
            self.merkle.add_leaf(public_input.refund_commitment_hash);
            self.merkle.add_leaf(public_input.refund_commitment_hash_fee);

            // Add leaf for transfered funds
            let secret_nullifier_amount_hash = hash(
                public_input.recipient_secret_and_nullifier_hash, public_input.amount,
            );
            let transfer_commitment_hash = hash(
                secret_nullifier_amount_hash, public_input.token_address_to_hash,
            );
            self.merkle.add_leaf(transfer_commitment_hash);
            true
        }

        fn current_root(self: @ContractState) -> u256 {
            self.merkle.root.read()
        }

        fn get_roots(self: @ContractState) -> Array<u256> {
            let mut roots = array![];
            for i in 0..self.merkle.roots_vec.len() {
                roots.append(self.merkle.roots_vec.at(i).read());
            }
            roots
        }

        fn __execute__(self: @ContractState, calls: Array<Call>) -> Array<Span<felt252>> {
            execute_calls(calls.span())
        }

        fn __validate__(self: @ContractState, calls: Array<Call>) -> felt252 {
            is_valid(calls.span())
        }

        fn is_valid_signature(
            self: @ContractState, hash: felt252, signature: Array<felt252>,
        ) -> felt252 {
            starknet::VALIDATED
        }
        fn get_current_gas_price(
            self: @sn::privacy_account::PrivacyAccount::ContractState,
        ) -> core::integer::u256 {
            self.current_gas_price.read()
        }

        fn set_current_gas_price(
            ref self: sn::privacy_account::PrivacyAccount::ContractState,
            gas_price: core::integer::u256,
        ) -> core::bool {
            self.ownable.assert_only_owner();
            self.current_gas_price.write(gas_price);
            true
        }
        fn add_trusted_extension(
            ref self: sn::privacy_account::PrivacyAccount::ContractState,
            contract_address: starknet::contract_address::ContractAddress,
            gas_consumed: core::integer::u128,
        ) -> core::bool {
            self.ownable.assert_only_owner();
            self.trusted_extensions.entry(contract_address).write(gas_consumed);
            true
        }
        fn get_fee_for_extension(
            self: @sn::privacy_account::PrivacyAccount::ContractState,
            extension_address: starknet::contract_address::ContractAddress,
        ) -> core::integer::u256 {
            let gas_consumed: u128 = self.trusted_extensions.read(extension_address);
            let gas_price: u256 = self.current_gas_price.read();
            let gas_consumed_u256: u256 = gas_consumed.try_into().unwrap();
            let total_fee: u256 = gas_consumed_u256 * gas_price;
            total_fee
        }

        fn get_accumulated_fee(
            self: @sn::privacy_account::PrivacyAccount::ContractState,
        ) -> core::integer::u256 {
            self.accumulated_fee.read()
        }

        fn withdraw_all_accumulated_fee(
            ref self: sn::privacy_account::PrivacyAccount::ContractState,
            recipient: starknet::contract_address::ContractAddress,
        ) -> core::integer::u256 {
            // only the owner may call
            self.ownable.assert_only_owner();

            // 1) read on‐chain STRK balance of this contract
            let this = get_contract_address();
            let token = IERC20Dispatcher { contract_address: self.strk_token_address.read() };
            let contract_balance: u256 = token.balance_of(this);

            // 2) read your storage counters
            let user_balance: u256 = self.users_balance.read();
            let buffer: u256 = self.initial_fee_buffer.read();

            // 3) compute how much is truly “free float”
            let withdrawable: u256 = if contract_balance > user_balance + buffer {
                contract_balance - (user_balance + buffer)
            } else {
                0
            };

            // 4) transfer only that amount
            if withdrawable > 0 {
                token.transfer(recipient, withdrawable);
            }

            // 5) emit the FeeWithdrawal event with the actual amount
            self
                .emit(
                    FeeWithdrawal {
                        recipient: recipient,
                        amount: withdrawable,
                        token_address: self.strk_token_address.read(),
                    },
                );

            // 6) return how much was sent
            withdrawable
        }


        fn withdraw_accumulated_fee(
            ref self: sn::privacy_account::PrivacyAccount::ContractState,
            recipient: starknet::contract_address::ContractAddress,
            amount: core::integer::u256,
        ) -> core::integer::u256 {
            self.ownable.assert_only_owner();

            let this = get_contract_address();
            let token = IERC20Dispatcher { contract_address: self.strk_token_address.read() };
            let contract_balance: u256 = token.balance_of(this);

            let user_balance: u256 = self.users_balance.read();
            let buffer: u256 = self.initial_fee_buffer.read();

            let withdrawable: u256 = if contract_balance > user_balance + buffer {
                contract_balance - (user_balance + buffer)
            } else {
                0
            };

            assert!(amount <= withdrawable, "Requested amount exceeds available accumulated fee");

            if amount > 0 {
                token.transfer(recipient, amount);
            }

            self
                .emit(
                    FeeWithdrawal {
                        recipient, amount, token_address: self.strk_token_address.read(),
                    },
                );

            amount
        }

        fn get_fee_for_merge(
            self: @sn::privacy_account::PrivacyAccount::ContractState,
        ) -> core::integer::u256 {
            let gas_consumed: u128 = self.merge_gas_consumed.read();
            let gas_price: u256 = self.current_gas_price.read();
            let gas_consumed_u256: u256 = gas_consumed.try_into().unwrap();
            let total_fee: u256 = gas_consumed_u256 * gas_price;
            total_fee
        }

        fn get_fee_for_transfer(
            self: @sn::privacy_account::PrivacyAccount::ContractState,
        ) -> core::integer::u256 {
            let gas_consumed: u128 = self.transfer_gas_consumed.read();
            let gas_price: u256 = self.current_gas_price.read();
            let gas_consumed_u256: u256 = gas_consumed.try_into().unwrap();
            let total_fee: u256 = gas_consumed_u256 * gas_price;
            total_fee
        }
    }
}
