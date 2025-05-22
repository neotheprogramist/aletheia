use ekubo::types::delta::Delta;
use ekubo::types::i129::i129;
use ekubo::types::keys::PoolKey;
use starknet::ContractAddress;

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
pub trait ISwapExtension<TContractState> {
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

#[starknet::contract]
pub mod SwapExtension {
    use core::array::{Array, ArrayTrait};
    use core::option::OptionTrait;
    use ekubo::components::clear::ClearImpl;
    use ekubo::components::shared_locker::{
        call_core_with_callback, consume_callback_data, handle_delta,
    };
    use ekubo::interfaces::core::{ICoreDispatcher, ICoreDispatcherTrait, ILocker, SwapParameters};
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::event::EventEmitter;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_contract_address};
    use crate::privacy_account::IPrivacyAccountDispatcher;
    use super::super::privacy_account::IPrivacyAccountDispatcherTrait;
    use super::{Delta, ISwapExtension, RouteNode, Swap, TokenAmount};


    #[abi(embed_v0)]
    impl Clear = ekubo::components::clear::ClearImpl<ContractState>;

    #[storage]
    struct Storage {
        core: ICoreDispatcher,
        tornado_account: ContractAddress,
    }

    pub mod Errors {
        pub const NO_DELTAS_RETURNED: felt252 = 'SwapExtension: No Deltas!';
        pub const TORNADO_DEPOSIT_FAILED: felt252 = 'SwapExtension: Deposit Fail!';
        pub const U128_TO_U256_FAILED: felt252 = 'SwapExtension: u128 to u256!';
        pub const APPROVE_FAILED: felt252 = 'SwapExtension: Approve failed!';
    }

    #[event]
    #[derive(Drop, PartialEq, starknet::Event)]
    enum Event {
        Swapped: Swapped,
        Deposited: Deposited,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct Swapped {
        #[key]
        token: ContractAddress,
        amount: u256,
        delta: Delta,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    struct Deposited {
        #[key]
        token: ContractAddress,
        amount: u256,
    }


    #[derive(Serde, Drop)]
    struct SwapParams {
        route: Array<RouteNode>,
        token_amount: TokenAmount,
        secret_and_nullifier_hash: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, core: ICoreDispatcher, tornado_account: ContractAddress,
    ) {
        self.core.write(core);
        self.tornado_account.write(tornado_account);
    }

    #[abi(embed_v0)]
    impl SwapExtensionZk of crate::zk_extension::IZkExtension<ContractState> {
        fn execute(ref self: ContractState, calldata: Span<felt252>) {
            let mut input = calldata;
            let params = Serde::<SwapParams>::deserialize(ref input).unwrap();

            let mut route = params.route;
            let token_amount = params.token_amount;
            let secret_and_nullifier_hash = params.secret_and_nullifier_hash;

            let token = IERC20Dispatcher { contract_address: params.token_amount.token };
            token
                .transfer_from(
                    self.tornado_account.read(),
                    get_contract_address(),
                    token_amount.amount.mag.into(),
                );

            let node: RouteNode = *route.at(route.len() - 1);

            let mut deltas = self.multihop_swap(route, token_amount);
            let delta: Delta = *deltas.at(deltas.len() - 1);

            let (output_token, output_amount_u128): (ContractAddress, u128) = if delta
                .amount0
                .sign {
                (node.pool_key.token0, delta.amount0.mag)
            } else {
                (node.pool_key.token1, delta.amount1.mag)
            };

            self
                .emit(
                    Swapped {
                        token: output_token, amount: output_amount_u128.into(), delta: delta,
                    },
                );

            let token_out = IERC20Dispatcher { contract_address: output_token };
            let tornado_acct = self.tornado_account.read();
            let approval = token_out.approve(tornado_acct, output_amount_u128.into());
            assert(approval, Errors::APPROVE_FAILED);

            let tornado = IPrivacyAccountDispatcher { contract_address: tornado_acct };
            let deposit = tornado
                .deposit(secret_and_nullifier_hash, output_amount_u128.into(), output_token);
            assert(deposit, Errors::TORNADO_DEPOSIT_FAILED);

            self.emit(Deposited { token: output_token, amount: output_amount_u128.into() });
        }
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
    impl SwapExtension of ISwapExtension<ContractState> {
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
    }
}
