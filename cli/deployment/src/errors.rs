use starknet::{core::utils::NonAsciiNameError, providers::ProviderError};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error(transparent)]
    AccountError(
        #[from]
        starknet::accounts::AccountError<
            starknet::accounts::single_owner::SignError<starknet::signers::local_wallet::SignError>,
        >,
    ),
    #[error(transparent)]
    ProviderError(#[from] ProviderError),
    #[error(transparent)]
    NonAsciiNameError(#[from] NonAsciiNameError),
    #[error(transparent)]
    IoError(#[from] std::io::Error),
    #[error(transparent)]
    SerdeError(#[from] serde_json::Error),
    #[error("Unexpected receipt type")]
    UnexpectedReceiptType,
    #[error("Transaction failed: {0}")]
    TransactionFailed(String),
    #[error(transparent)]
    FeltFromStr(#[from] starknet_types_core::felt::FromStrError),
}
