pub mod args;
pub mod errors;
pub mod utils;
use args::Args;
use clap::Parser;
use errors::AppError;
use utils::{load_proof, withdraw};

#[tokio::main]
async fn main() -> Result<(), AppError> {
    let args = Args::parse();

    let provider_url = args.provider_url.clone();

    let calldata = vec![
        args.contract_address,
        args.receipient,
        args.token_address,
        args.amount,
    ];

    let proof = load_proof(&args.proof_path)?;

    withdraw(
        provider_url,
        args.account_address,
        args.account_private_key,
        args.contract_address,
        args.external_contract_address,
        proof,
        calldata,
    )
    .await?;


    Ok(())
}
