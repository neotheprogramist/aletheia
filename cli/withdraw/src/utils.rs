use std::{fs, path::PathBuf, vec};

use crate::errors::AppError;
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
    extended_calldata.extend(vec![Felt::from(calldata.len())]);
    extended_calldata.extend(calldata);


    let deposit_call = Call {
        to: contract_address,
        selector: get_selector_from_name("execute")?,
        calldata: extended_calldata,
    };
    let result = account.execute_v3(vec![deposit_call]).send().await?;
    println!("result: {:#?}", result);
    Ok(result)
}

pub fn load_garaga_proof(path: &PathBuf) -> Result<Vec<Felt>, AppError> {
    let content = fs::read_to_string(path)?;
    let numbers: Vec<&str> = content.split_whitespace().collect();

    let proof: Vec<Felt> = numbers
        .into_iter()
        .map(|s| {
            Felt::from_dec_str(&s)
                .map_err(|e| AppError::FeltFromStr(e))
                .unwrap()
        })
        .collect();

    let proof_length = Felt::from(proof.len());
    let mut extended_proof = vec![proof_length];
    extended_proof.extend(proof);

    Ok(extended_proof)
}
