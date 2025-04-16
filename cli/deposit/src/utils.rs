use crate::errors::AppError;
use cainome_cairo_serde::U256;
use starknet::{
    accounts::{Account, ExecutionEncoding, SingleOwnerAccount},
    core::{
        types::{Call, InvokeTransactionResult},
        utils::get_selector_from_name,
    },
    providers::{
        jsonrpc::{HttpTransport, JsonRpcClient},
        Provider,
    },
    signers::{LocalWallet, SigningKey},
};
use starknet_types_core::felt::Felt;
use url::Url;
pub async fn approve(
    url: Url,
    account_address: Felt,
    account_private_key: Felt,
    contract_address: Felt,
    amount: Felt,
    token_address: Felt,
) -> Result<InvokeTransactionResult, AppError> {
    let provider = JsonRpcClient::new(HttpTransport::new(url));
    let chain_id = provider.chain_id().await?;

    let sk = SigningKey::from_secret_scalar(account_private_key);

    let account = SingleOwnerAccount::new(
        provider.clone(),
        LocalWallet::from(sk),
        account_address,
        chain_id,
        ExecutionEncoding::New,
    );

    let amount_u256 = U256::from_bytes_be(&amount.to_bytes_be());

    let approve_call = Call {
        to: token_address,
        selector: get_selector_from_name("approve")?,
        calldata: vec![
            contract_address,
            amount_u256.low.into(),
            amount_u256.high.into(),
        ],
    };
    let result = account.execute_v3(vec![approve_call]).send().await?;
    Ok(result)
}

pub async fn deposit(
    url: Url,
    account_address: Felt,
    account_private_key: Felt,
    contract_address: Felt,
    secret_nullifier_hash: Felt,
    amount: Felt,
    token_address: Felt,
) -> Result<InvokeTransactionResult, AppError> {
    let provider = JsonRpcClient::new(HttpTransport::new(url));
    let chain_id = provider.chain_id().await?;

    let private_key = SigningKey::from_secret_scalar(account_private_key);

    let account = SingleOwnerAccount::new(
        provider,
        LocalWallet::from(private_key),
        account_address,
        chain_id,
        ExecutionEncoding::New,
    );

    let secret_nullifier_hash_u256 = U256::from_bytes_be(&secret_nullifier_hash.to_bytes_be());
    let amount_u256 = U256::from_bytes_be(&amount.to_bytes_be());

    let deposit_call = Call {
        to: contract_address,
        selector: get_selector_from_name("deposit")?,
        calldata: vec![
            secret_nullifier_hash_u256.low.into(),
            secret_nullifier_hash_u256.high.into(),
            amount_u256.low.into(),
            amount_u256.high.into(),
            token_address,
        ],
    };
    let result = account.execute_v3(vec![deposit_call]).send().await?;
    println!("result: {:#?}", result);
    Ok(result)
}
