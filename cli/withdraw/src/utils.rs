use std::{fs, path::PathBuf, vec};

use crate::errors::AppError;
use starknet::{
    accounts::{Account, ExecutionEncoding, SingleOwnerAccount},
    core::{
        types::{
            Call, InvokeTransactionResult, 
        },
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

pub async fn withdraw(
    url: Url,
    account_address: Felt,
    account_private_key: Felt,
    contract_address: Felt,
    external_contract_address: Felt,
    proof: Vec<Felt>,
    calldata: Vec<Felt>,
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

    let mut extended_calldata = proof.clone();
    extended_calldata.extend(vec![external_contract_address]);
    extended_calldata.extend(calldata);

    println!("proof {:?}", proof[5]);

    let deposit_call = Call {
        to: contract_address,
        selector: get_selector_from_name("execute")?,
        calldata: proof,
    };
    let result = account.execute_v3(vec![deposit_call]).send().await?;
    println!("result: {:#?}", result);
    Ok(result)
}

pub fn load_proof(path: &PathBuf) -> Result<Vec<Felt>, AppError> {
    let content = fs::read_to_string(path)?;
    let hex_vec: Vec<String> = serde_json::from_str(&content)?;
    let proof = hex_vec
        .into_iter()
        .map(|s| Felt::from_hex_unchecked(&s))
        .collect();
    Ok(proof)
}

