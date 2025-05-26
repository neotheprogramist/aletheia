// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts for Cairo ^0.20.0
use ekubo::types::delta::Delta;
use ekubo::types::i129::i129;
use ekubo::types::keys::PoolKey;
use starknet::ContractAddress;
use starknet::account::Call;

#[derive(Serde, Copy, Drop)]
pub struct RouteNode {
    pub pool_key: PoolKey,
    pub sqrt_ratio_limit: u256,
    pub skip_ahead: u128,
}

#[derive(Serde, Copy, Drop)]
pub struct TokenAmount {
    pub token: ContractAddress,
    pub amount: i129,
}

#[derive(Serde, Drop)]
pub struct Swap {
    pub route: Array<RouteNode>,
    pub token_amount: TokenAmount,
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
    fn merge(
        ref self: TContractState,
        proof: Span<felt252>,
        gas_fee_route: RouteNode,
        paymaster_fee_route: RouteNode,
    ) -> bool;
    fn transfer(
        ref self: TContractState,
        proof: Span<felt252>,
        gas_fee_route: RouteNode,
        paymaster_fee_route: RouteNode,
    ) -> bool;
    fn get_fee_for_extension(self: @TContractState, extension_address: ContractAddress) -> u256;
    fn get_current_gas_price(self: @TContractState) -> u256;
    fn set_current_gas_price(ref self: TContractState, gas_price: u256) -> bool;
    fn add_trusted_extension(
        ref self: TContractState, contract_address: ContractAddress, gas_consumed: u128,
    ) -> bool;
    fn current_root(self: @TContractState) -> u256;
    fn get_roots(self: @TContractState) -> Array<u256>;
    fn withdraw_fee(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn __execute__(self: @TContractState, calls: Array<Call>) -> Array<Span<felt252>>;
    fn __validate__(self: @TContractState, calls: Array<Call>) -> felt252;
    fn is_valid_signature(
        self: @TContractState, hash: felt252, signature: Array<felt252>,
    ) -> felt252;
    // Does a single swap against a single node using tokens held by this contract, and receives the
    // output to this contract
    fn swap(ref self: TContractState, node: RouteNode, token_amount: TokenAmount) -> Delta;

    // Does a multihop swap, where the output/input of each hop is passed as input/output of the
    // next swap Note to do exact output swaps, the route must be given in reverse
    fn multihop_swap(
        ref self: TContractState, route: Array<RouteNode>, token_amount: TokenAmount,
    ) -> Array<Delta>;

    // Does multiple multihop swaps
    fn multi_multihop_swap(ref self: TContractState, swaps: Array<Swap>) -> Array<Array<Delta>>;
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
    merge_commitment_hash: u256,
    gas_fee: u256,
    paymaster_fee: u256,
    token_address: ContractAddress,
}

#[generate_trait]
impl PublicInputMergeImpl of PublicInputMergeTrait {
    fn from_u256_span(span: Span<u256>) -> PublicInputMerge {
        let token_address: felt252 = (*span[1]).try_into().unwrap();

        PublicInputMerge {
            nullifier_hash_1: *span[0],
            deposit_root_1: *span[2],
            nullifier_hash_2: *span[3],
            deposit_root_2: *span[4],
            merge_commitment_hash: *span[5],
            gas_fee: *span[6],
            paymaster_fee: *span[7],
            token_address: token_address.try_into().unwrap(),
        }
    }
}

#[derive(Drop)]
struct PublicInputTransfer {
    root: u256,
    token_address: ContractAddress,
    token_address_to_hash: u256,
    nullifier_hash: u256,
    amount: u256,
    refund_commitment_hash: u256,
    recipient_secret_and_nullifier_hash: u256,
    gas_fee: u256,
    paymaster_fee: u256,
}

#[generate_trait]
impl PublicInputTransferImpl of PublicInputTransferTrait {
    fn from_u256_span(span: Span<u256>) -> PublicInputTransfer {
        let token_address: felt252 = (*span[2]).try_into().unwrap();

        PublicInputTransfer {
            root: *span[0],
            nullifier_hash: *span[1],
            recipient_secret_and_nullifier_hash: *span[5],
            refund_commitment_hash: *span[4],
            amount: *span[3],
            token_address: token_address.try_into().unwrap(),
            token_address_to_hash: *span[2],
            gas_fee: *span[6],
            paymaster_fee: *span[7],
        }
    }
}


#[starknet::contract(account)]
pub mod PrivacyAccount {
    use core::array::{Array, ArrayTrait};
    use core::option::OptionTrait;
    use ekubo::components::clear::ClearImpl;
    use ekubo::components::shared_locker::{
        call_core_with_callback, consume_callback_data, handle_delta,
    };
    use ekubo::interfaces::core::{ICoreDispatcher, ICoreDispatcherTrait, ILocker, SwapParameters};
    use ekubo::types::i129::i129;
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
    use crate::{hash, verify_ultra_keccak_zk_honk_proof};
    use super::{
        Delta, IPrivacyAccount, PublicInputMergeImpl, PublicInputTransferImpl,
        PublicInputWithdrawImpl, RouteNode, Swap, TokenAmount,
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
        core: ICoreDispatcher,
        strk_token_address: ContractAddress,
        usdc_token_address: ContractAddress,
        current_gas_price: u256,
        trusted_extensions: Map<ContractAddress, u128>,
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
        usdc_token_address: ContractAddress,
    ) {
        self.ownable.initializer(owner);
        self.merkle.initializer();
        self.extension_verifier.write(extension_verifier);
        self.merge_verifier.write(merge_verifier);
        self.transfer_verifier.write(transfer_verifier);
        let dispatcher: ICoreDispatcher = ICoreDispatcher { contract_address: core_address };
        self.core.write(dispatcher);
        self.strk_token_address.write(strk_token_address);
        self.usdc_token_address.write(usdc_token_address);
    }

    #[abi(embed_v0)]
    impl LockerImpl of ILocker<ContractState> {
        fn locked(ref self: ContractState, id: u32, data: Span<felt252>) -> Span<felt252> {
            let core = self.core.read();

            let mut swaps = consume_callback_data::<Array<Swap>>(core, data);
            let mut outputs: Array<Array<Delta>> = ArrayTrait::new();

            while let Option::Some(swap) = swaps.pop_front() {
                let mut route = swap.route;
                let mut token_amount = swap.token_amount;

                let mut deltas: Array<Delta> = ArrayTrait::new();
                // we track this to know how much to pay in the case of exact input and how much to
                // pull in the case of exact output
                let mut first_swap_amount: Option<TokenAmount> = Option::None;

                while let Option::Some(node) = route.pop_front() {
                    let is_token1 = token_amount.token == node.pool_key.token1;

                    let delta = core
                        .swap(
                            node.pool_key,
                            SwapParameters {
                                amount: token_amount.amount,
                                is_token1: is_token1,
                                sqrt_ratio_limit: node.sqrt_ratio_limit,
                                skip_ahead: node.skip_ahead,
                            },
                        );

                    deltas.append(delta);

                    if first_swap_amount.is_none() {
                        first_swap_amount =
                            if is_token1 {
                                Option::Some(
                                    TokenAmount {
                                        token: node.pool_key.token1, amount: delta.amount1,
                                    },
                                )
                            } else {
                                Option::Some(
                                    TokenAmount {
                                        token: node.pool_key.token0, amount: delta.amount0,
                                    },
                                )
                            }
                    }

                    token_amount =
                        if (is_token1) {
                            TokenAmount { amount: -delta.amount0, token: node.pool_key.token0 }
                        } else {
                            TokenAmount { amount: -delta.amount1, token: node.pool_key.token1 }
                        };
                }

                let recipient = get_contract_address();

                outputs.append(deltas);

                let first = first_swap_amount.unwrap();
                handle_delta(core, token_amount.token, -token_amount.amount, recipient);
                handle_delta(core, first.token, first.amount, recipient);
            }

            let mut serialized: Array<felt252> = array![];

            Serde::serialize(@outputs, ref serialized);

            serialized.span()
        }
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
            true
        }

        fn execute_extension(
            ref self: ContractState,
            proof: Span<felt252>,
            external_contract_address: ContractAddress,
            calldata: Span<felt252>,
        ) -> bool {
            let public_input_serialized = verify_ultra_keccak_zk_honk_proof(
                self.extension_verifier.read(), proof,
            );

            let public_input = PublicInputWithdrawImpl::from_u256_span(public_input_serialized);
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

        fn merge(
            ref self: ContractState,
            proof: Span<felt252>,
            gas_fee_route: RouteNode,
            paymaster_fee_route: RouteNode,
        ) -> bool {
            let public_input_serialized = verify_ultra_keccak_zk_honk_proof(
                self.merge_verifier.read(), proof,
            );

            let public_input = PublicInputMergeImpl::from_u256_span(public_input_serialized);

            assert(
                !self.nullifier_hashes.read(public_input.nullifier_hash_1),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.nullifier_hash_1).write(true);

            assert(
                !self.nullifier_hashes.read(public_input.nullifier_hash_2),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.nullifier_hash_2).write(true);

            assert(self.merkle.roots.read(public_input.deposit_root_1), Errors::INVALID_ROOT);
            assert(self.merkle.roots.read(public_input.deposit_root_2), Errors::INVALID_ROOT);

            self.merkle.add_leaf(public_input.merge_commitment_hash);

            if self.strk_token_address.read() != public_input.token_address {
                self
                    .multihop_swap(
                        route: array![gas_fee_route],
                        token_amount: TokenAmount {
                            token: public_input.token_address,
                            amount: i129 {
                                mag: public_input.gas_fee.try_into().unwrap(), sign: false,
                            },
                        },
                    );
            }

            if self.usdc_token_address.read() != public_input.token_address {
                self
                    .multihop_swap(
                        route: array![paymaster_fee_route],
                        token_amount: TokenAmount {
                            token: public_input.token_address,
                            amount: i129 {
                                mag: public_input.paymaster_fee.try_into().unwrap(), sign: false,
                            },
                        },
                    );
            }
            true
        }

        fn transfer(
            ref self: ContractState,
            proof: Span<felt252>,
            gas_fee_route: RouteNode,
            paymaster_fee_route: RouteNode,
        ) -> bool {
            let public_input_serialized = verify_ultra_keccak_zk_honk_proof(
                self.transfer_verifier.read(), proof,
            );

            let public_input = PublicInputTransferImpl::from_u256_span(public_input_serialized);

            assert(
                !self.nullifier_hashes.read(public_input.nullifier_hash),
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.nullifier_hash).write(true);

            assert(self.merkle.roots.read(public_input.root), Errors::INVALID_ROOT);

            self.merkle.add_leaf(public_input.refund_commitment_hash);

            let secret_nullifier_amount_hash = hash(
                public_input.recipient_secret_and_nullifier_hash, public_input.amount,
            );
            let transfer_commitment_hash = hash(
                secret_nullifier_amount_hash, public_input.token_address_to_hash,
            );
            self.merkle.add_leaf(transfer_commitment_hash);

            if self.strk_token_address.read() != public_input.token_address {
                self
                    .multihop_swap(
                        route: array![gas_fee_route],
                        token_amount: TokenAmount {
                            token: public_input.token_address,
                            amount: i129 {
                                mag: public_input.gas_fee.try_into().unwrap(), sign: false,
                            },
                        },
                    );
            }

            if self.usdc_token_address.read() != public_input.token_address {
                self
                    .multihop_swap(
                        route: array![paymaster_fee_route],
                        token_amount: TokenAmount {
                            token: public_input.token_address,
                            amount: i129 {
                                mag: public_input.paymaster_fee.try_into().unwrap(), sign: false,
                            },
                        },
                    );
            }

            true
        }

        fn swap(ref self: ContractState, node: RouteNode, token_amount: TokenAmount) -> Delta {
            let mut deltas: Array<Delta> = self.multihop_swap(array![node], token_amount);
            deltas.pop_front().unwrap()
        }

        #[inline(always)]
        fn multihop_swap(
            ref self: ContractState, route: Array<RouteNode>, token_amount: TokenAmount,
        ) -> Array<Delta> {
            let mut result = self.multi_multihop_swap(array![Swap { route, token_amount }]);

            result.pop_front().unwrap()
        }

        #[inline(always)]
        fn multi_multihop_swap(ref self: ContractState, swaps: Array<Swap>) -> Array<Array<Delta>> {
            call_core_with_callback(self.core.read(), @swaps)
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

        fn withdraw_fee(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            self.ownable.assert_only_owner();
            let token = IERC20Dispatcher { contract_address: self.usdc_token_address.read() };
            token.transfer(recipient, amount);
            self
                .emit(
                    FeeWithdrawal {
                        recipient: recipient,
                        amount: amount,
                        token_address: self.usdc_token_address.read(),
                    },
                );
            true
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
    }
}
