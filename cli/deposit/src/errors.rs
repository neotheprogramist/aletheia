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
    ParseBigIntError(#[from] num::bigint::ParseBigIntError),
}
