use sn::vesu_data_model::{PositionContractParams, PositionContractResponse, PositionInfo};

#[starknet::interface]
pub trait IVesuBorrowPositionExtension<TContractState> {
    fn execute(
        ref self: TContractState, params: PositionContractParams,
    ) -> PositionContractResponse;
    fn get_position_info(self: @TContractState) -> PositionInfo;
}

#[starknet::contract]
mod VesuBorrowPositionExtension {
    use alexandria_math::i257::{I257Impl, I257Trait};
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use sn::vesu_data_model::{
        ISingletonDispatcher, ISingletonDispatcherTrait, PositionContractParams,
        PositionContractResponse, PositionInfo, UpdatePositionResponse,
    };
    use starknet::ContractAddress;
    use starknet::event::EventEmitter;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    pub mod Errors {
        pub const TORNADO_DEPOSIT_FAILED: felt252 = 'BorrowExtension: Deposit Fail!';
        pub const APPROVE_FAILED: felt252 = 'Extension: Approve failed!';
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
        pub extension_address: ContractAddress,
        pub collateral_asset: ContractAddress,
        pub debt_asset: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        singleton_address: ContractAddress,
        extension_address: ContractAddress,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
    ) {
        self.singleton_address.write(singleton_address);
        self.extension_address.write(extension_address);
        self.collateral_asset.write(collateral_asset);
        self.debt_asset.write(debt_asset);
    }

    #[abi(embed_v0)]
    impl VesuBorrowPositionExtension of super::IVesuBorrowPositionExtension<ContractState> {
        fn get_position_info(self: @ContractState) -> PositionInfo {
            let data = PositionInfo {
                collateral_asset: self.collateral_asset.read(), debt_asset: self.debt_asset.read(),
            };
            data
        }
        fn execute(
            ref self: ContractState, params: PositionContractParams,
        ) -> PositionContractResponse {
            let this = starknet::get_contract_address();

            let collateral_asset = IERC20Dispatcher {
                contract_address: self.collateral_asset.read(),
            };
            let debt_asset = IERC20Dispatcher { contract_address: self.debt_asset.read() };
            // Transfer from extension contract
            collateral_asset
                .transfer_from(self.extension_address.read(), this, params.collateral_approve);
            debt_asset.transfer_from(self.extension_address.read(), this, params.debt_approve);
            // Approve for singleton
            collateral_asset
                .approve(spender: self.singleton_address.read(), amount: params.collateral_approve);
            debt_asset.approve(spender: self.singleton_address.read(), amount: params.debt_approve);
            let singleton = ISingletonDispatcher {
                contract_address: self.singleton_address.read(),
            };
            // Execute modify position
            let response = singleton.modify_position(params.modify_position_params);
            self.emit(VesuBorrow { response });

            // Refunds calculation
            let mut collateral_refund: u256 = 0;
            let mut debt_refund: u256 = 0;

            let collateral_value_abs = response.collateral_delta.abs();
            let collateral_negative = response.collateral_delta.is_negative();

            let debt_value_abs = response.debt_delta.abs();
            let debt_negative = response.debt_delta.is_negative();

            if !collateral_negative && !debt_negative {
                collateral_refund = params.collateral_approve - collateral_value_abs;
                debt_refund = params.debt_approve + debt_value_abs;
            }

            if !collateral_negative && debt_negative {
                collateral_refund = params.collateral_approve - collateral_value_abs;
                debt_refund = params.debt_approve - debt_value_abs;
            }

            if collateral_negative && !debt_negative {
                collateral_refund = params.collateral_approve + collateral_value_abs;
                debt_refund = params.debt_approve + debt_value_abs;
            }

            if collateral_negative && debt_negative {
                collateral_refund = params.collateral_approve + collateral_value_abs;
                debt_refund = params.debt_approve - debt_value_abs;
            }

            collateral_asset
                .approve(spender: self.extension_address.read(), amount: collateral_refund);
            debt_asset.approve(spender: self.extension_address.read(), amount: debt_refund);

            let contract_response = PositionContractResponse {
                update_position_response: response, collateral_refund, debt_refund,
            };
            contract_response
        }
    }
}
