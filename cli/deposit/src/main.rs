pub mod args;
pub mod errors;
pub mod utils;
use clap::Parser;
use errors::AppError;
use utils::{approve, deposit};

use args::Args;

#[tokio::main]
async fn main() -> Result<(), AppError> {
    let args = Args::parse();

    let provider_url = args.provider_url.clone();
    approve(
        provider_url.clone(),
        args.account_address,
        args.account_private_key,
        args.contract_address,
        args.amount,
        args.strk_address,
    )
    .await?;

    deposit(
        provider_url,
        args.account_address,
        args.account_private_key,
        args.contract_address,
        args.secret_nullifier_hash,
        args.amount,
        args.strk_address,
    )
    .await?;

    Ok(())
}
