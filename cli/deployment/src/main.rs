pub mod args;
pub mod errors;
pub mod utils;
use clap::Parser;
use errors::AppError;
use utils::deployment;

use args::Args;
#[tokio::main]
async fn main() -> Result<(), AppError> {
    let args = Args::parse();

    let provider_url = args.provider_url.clone();
    deployment(
        provider_url,
        args.account_address,
        args.account_private_key,
        args.contracts_path,
    )
    .await?;

    Ok(())
}
