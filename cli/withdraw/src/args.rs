use std::path::PathBuf;

use clap::Parser;
use starknet_types_core::felt::Felt;
use url::Url;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct Args {
    /// The StarkNet provider URL
    #[arg(long, env, default_value = "http://localhost:5050")]
    pub provider_url: Url,

    /// The account private key (Hex string)
    #[arg(long, env)]
    pub account_private_key: Felt,

    /// The account address (Hex string)
    #[arg(long, env)]
    pub account_address: Felt,

    /// path to the proof
    #[arg(long, env)]
    pub proof_path: PathBuf,
    /// PrivacyPool contract address
    #[arg(long, short, env)]
    pub contract_address: Felt,

    /// PrivacyPool contract address
    #[arg(long, short, env)]
    pub external_contract_address: Felt,
    
    /// Withdrawal receipient
    #[arg(long, env)]
    pub receipient: Felt,

    /// The deposited token address (Hex string)
    #[arg(long, env)]
    pub token_address: Felt,

    /// The amount for deposit (Hex string)
    #[arg(long, env)]
    pub amount: Felt,
}
