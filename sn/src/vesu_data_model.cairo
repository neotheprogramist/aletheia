use alexandria_math::i257::i257;
use starknet::ContractAddress;
#[derive(PartialEq, Copy, Drop, Serde)]
pub struct UpdatePositionResponse {
    pub collateral_delta: i257,
    pub collateral_shares_delta: i257,
    pub debt_delta: i257,
    pub nominal_debt_delta: i257,
    pub bad_debt: u256,
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct PositionContractResponse {
    pub update_position_response: UpdatePositionResponse,
    pub collateral_refund: u256,
    pub debt_refund: u256,
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct PositionInfo {
    pub collateral_asset: ContractAddress,
    pub debt_asset: ContractAddress,
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct ModifyPositionParams {
    pub pool_id: felt252,
    pub collateral_asset: ContractAddress,
    pub debt_asset: ContractAddress,
    pub user: ContractAddress,
    pub collateral: Amount,
    pub debt: Amount,
    pub data: Span<felt252>,
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct BorrowParams {
    pub modify_position_params: ModifyPositionParams,
    pub transfer_amount: u256,
    pub transfer_asset: ContractAddress,
    pub secret_and_nullifier_hash_collateral_repay: u256,
    pub secret_and_nullifier_hash_debt_repay: u256,
    pub public_key: felt252,
    pub nonce: felt252,
    pub signature: Span<felt252>,
}

#[derive(PartialEq, Copy, Drop, Serde, Default, starknet::Store)]
pub enum State {
    #[default]
    CollateralDeposit,
    DebtDeposit,
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct PositionContractParams {
    pub modify_position_params: ModifyPositionParams,
    pub collateral_approve: u256,
    pub debt_approve: u256,
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
enum AmountType {
    #[default]
    Delta,
    Target,
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
enum AmountDenomination {
    #[default]
    Native,
    Assets,
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub struct Amount {
    amount_type: AmountType,
    denomination: AmountDenomination,
    pub value: i257,
}

#[starknet::interface]
pub trait ISingleton<TContractState> {
    fn modify_position(
        ref self: TContractState, params: ModifyPositionParams,
    ) -> UpdatePositionResponse;
}
