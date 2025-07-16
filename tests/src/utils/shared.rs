use std::{
    path::{Path, PathBuf},
    str::FromStr,
};

use crate::{
    hash,
    utils::{
        bb::{get_current_dir, run_bb_prove, run_bb_write_vks, run_nargo_build, run_nargo_witness},
        merkle::HybridMerkleTree,
    },
};
use cainome::cairo_serde::U256;
use devnet_lib::devnet::{Devnet, ETH_ERC20_CONTRACT_ADDRESS};
use garaga_rs::calldata::full_proof_with_hints::honk::{
    get_honk_calldata, HonkFlavor, HonkProof, HonkVerificationKey,
};
use num_bigint::BigUint;
use num_traits::Num;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::from_str;
use starknet_devnet_types::contract_address::ContractAddress;
use starknet_rs_core::{
    types::{BlockId as CoreBlock, BlockTag, Call, Felt},
    utils::{get_contract_address, get_selector_from_name},
};
use starknet_rs_providers::{jsonrpc::HttpTransport, JsonRpcClient, Provider};
use tokio::{
    fs::{self, File},
    io::{AsyncReadExt, AsyncWriteExt},
};

use url::Url;

pub const SECOND_FUNDING_ACCOUNT_ADDRESS: Felt =
    Felt::from_hex_unchecked("0x064fa47c02430E5d69c0c5d340e23397bca308f7B9d85247565fc91F2C2aD2f2");

pub const SECOND_FUNDING_ACCOUNT_PK: Felt =
    Felt::from_hex_unchecked("0x04b10399eb3eee3bddbe485790b2d81ab30be8019b634e44728b96e6ec383d47");

pub const STRK_ERC20_CONTRACT_ADDRESS: Felt =
    Felt::from_hex_unchecked("0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d");

#[derive(Clone, Serialize, Deserialize)]
pub struct SecretNote {
    pub secret: U256,
    pub nullifier: U256,
    pub amount: Option<U256>,
    pub token_address: Option<Felt>,
}

impl SecretNote {
    pub fn generate_empty() -> Self {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);

        let secret = hash::hash_one(U256::from_bytes_be(&bytes));
        let nullifier = hash::hash_one(secret);

        Self {
            secret,
            nullifier,
            amount: None,
            token_address: None,
        }
    }

    pub fn generate_with_token_and_amount(amount: U256, token_address: Felt) -> Self {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);

        let secret = hash::hash_one(U256::from_bytes_be(&bytes));
        let nullifier = hash::hash_one(secret);

        Self {
            secret,
            nullifier,
            amount: Some(amount),
            token_address: Some(token_address),
        }
    }

    pub fn get_secret_nullifier_hash(&self) -> U256 {
        hash::hash(self.secret, self.nullifier)
    }

    pub fn get_note_hash(&self) -> Option<U256> {
        match (&self.amount, &self.token_address) {
            (Some(amount), Some(token_address)) => {
                let secret_nullifier_hash = self.get_secret_nullifier_hash();
                let secret_nullifier_amount = hash::hash(secret_nullifier_hash, *amount);
                let note_hash = hash::hash(
                    secret_nullifier_amount,
                    U256::from_bytes_be(&token_address.to_bytes_be()),
                );
                Some(note_hash)
            }
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WitnessExecute {
    pub root_1: Option<String>,
    pub secret_1: Option<String>,
    pub nullifier_1: Option<String>,
    pub commitment_amount_1: Option<String>,
    pub token_address_1: Option<Felt>,
    pub hashpath_1: Option<[String; 31]>,
    pub index_1: Option<Felt>,
    pub amount: Option<String>,
    pub root_2: Option<String>,
    pub secret_2: Option<String>,
    pub nullifier_2: Option<String>,
    pub commitment_amount_2: Option<String>,
    pub token_address_2: Option<Felt>,
    pub hashpath_2: Option<[String; 31]>,
    pub index_2: Option<Felt>,
    pub gas_fee: Option<String>,
    pub refund_secret_1: Option<String>,
    pub refund_nullifier_1: Option<String>,
    pub refund_amount_1: Option<String>,
    pub refund_commitment_hash_1: Option<String>,
    pub refund_secret_2: Option<String>,
    pub refund_nullifier_2: Option<String>,
    pub refund_amount_2: Option<String>,
    pub refund_commitment_hash_2: Option<String>,
    pub _recipient: Option<Felt>,
}

impl WitnessExecute {
    pub fn from_secret_note(note_1: &SecretNote, note_2: &SecretNote) -> Self {
        Self {
            root_1: None,
            secret_1: Some(note_1.secret.to_string()),
            nullifier_1: Some(note_1.nullifier.to_string()),
            commitment_amount_1: note_1.amount.as_ref().map(|a| a.to_string()),
            token_address_1: note_1.token_address,
            hashpath_1: None,
            index_1: None,
            amount: note_1.amount.as_ref().map(|a| a.to_string()),
            root_2: None,
            secret_2: Some(note_2.secret.to_string()),
            nullifier_2: Some(note_2.nullifier.to_string()),
            commitment_amount_2: note_2.amount.as_ref().map(|a| a.to_string()),
            token_address_2: note_2.token_address,
            hashpath_2: None,
            index_2: None,
            gas_fee: None,
            refund_secret_1: None,
            refund_nullifier_1: None,
            refund_amount_1: None,
            refund_commitment_hash_1: None,
            refund_secret_2: None,
            refund_nullifier_2: None,
            refund_amount_2: None,
            refund_commitment_hash_2: None,
            _recipient: None,
        }
    }

    pub async fn save_to_toml_file(&self, path: &Path) -> std::io::Result<()> {
        let toml_string = toml::to_string(self).unwrap();
        let mut file = File::create(path).await?;
        file.write_all(toml_string.as_bytes()).await?;
        Ok(())
    }

    pub fn new_with_secrets() -> Self {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);

        let secret_1 = hash::hash_one(U256::from_bytes_be(&bytes));
        let nullifier_1 = hash::hash_one(secret_1);

        let mut bytes_2 = [0u8; 32];
        OsRng.fill_bytes(&mut bytes_2);

        let secret_2 = hash::hash_one(U256::from_bytes_be(&bytes_2));
        let nullifier_2 = hash::hash_one(secret_2);

        let mut refund_bytes_1 = [0u8; 32];
        OsRng.fill_bytes(&mut refund_bytes_1);

        let refund_secret_1 = hash::hash_one(U256::from_bytes_be(&refund_bytes_1));
        let refund_nullifier_1 = hash::hash_one(refund_secret_1);

        let mut refund_bytes_2 = [0u8; 32];
        OsRng.fill_bytes(&mut refund_bytes_2);

        let refund_secret_2 = hash::hash_one(U256::from_bytes_be(&refund_bytes_2));
        let refund_nullifier_2 = hash::hash_one(refund_secret_2);

        Self {
            root_1: None,
            secret_1: Some(secret_1.to_string()),
            nullifier_1: Some(nullifier_1.to_string()),
            commitment_amount_1: None,
            token_address_1: None,
            hashpath_1: None,
            index_1: None,
            amount: None,
            root_2: None,
            secret_2: Some(secret_2.to_string()),
            nullifier_2: Some(nullifier_2.to_string()),
            commitment_amount_2: None,
            token_address_2: None,
            hashpath_2: None,
            index_2: None,
            gas_fee: None,
            refund_secret_1: Some(refund_secret_1.to_string()),
            refund_nullifier_1: Some(refund_nullifier_1.to_string()),
            refund_amount_1: None,
            refund_commitment_hash_1: None,
            refund_secret_2: Some(refund_secret_2.to_string()),
            refund_nullifier_2: Some(refund_nullifier_2.to_string()),
            refund_amount_2: None,
            refund_commitment_hash_2: None,
            _recipient: None,
        }
    }

    pub fn set_amounts_and_tokens_with_commitments(
        &mut self,
        commitment_amount_1: String,
        commitment_amount_2: String,
        amount: String,
        gas_fee: String,
        token_address_1: Felt,
        token_address_2: Felt,
        refund_amount_1: String,
        refund_amount_2: String,
    ) {
        self.commitment_amount_1 = Some(commitment_amount_1);
        self.commitment_amount_2 = Some(commitment_amount_2);
        self.amount = Some(amount);
        self.gas_fee = Some(gas_fee);
        self.token_address_1 = Some(token_address_1.clone());
        self.token_address_2 = Some(token_address_2.clone());
        self.refund_amount_1 = Some(refund_amount_1.clone());
        self.refund_amount_2 = Some(refund_amount_2.clone());

        let refund_sn_1 = match (&self.refund_secret_1, &self.refund_nullifier_1) {
            (Some(secret_str), Some(nullifier_str)) => {
                let secret = U256::from_str(secret_str).expect("invalid refund_secret_1 format");
                let nullifier =
                    U256::from_str(nullifier_str).expect("invalid refund_nullifier_1 format");
                Some(hash::hash(secret, nullifier))
            }
            _ => None,
        };

        let refund_sn_2 = match (&self.refund_secret_2, &self.refund_nullifier_2) {
            (Some(secret_str), Some(nullifier_str)) => {
                let secret = U256::from_str(secret_str).expect("invalid refund_secret_2 format");
                let nullifier =
                    U256::from_str(nullifier_str).expect("invalid refund_nullifier_2 format");
                Some(hash::hash(secret, nullifier))
            }
            _ => None,
        };

        let refund_sn_amount = hash::hash(
            refund_sn_1.unwrap(),
            U256::from_str(&refund_amount_1).unwrap(),
        );
        let refund_commitment_hash_1 = hash::hash(
            refund_sn_amount,
            U256::from_bytes_be(&token_address_1.to_bytes_be()),
        );

        let refund_sn_amount_2 = hash::hash(
            refund_sn_2.unwrap(),
            U256::from_str(&refund_amount_2).unwrap(),
        );

        let refund_commitment_hash_2 = hash::hash(
            refund_sn_amount_2,
            U256::from_bytes_be(&token_address_2.to_bytes_be()),
        );

        self.refund_commitment_hash_1 = Some(refund_commitment_hash_1.to_string());
        self.refund_commitment_hash_2 = Some(refund_commitment_hash_2.to_string());
    }

    pub fn set_merkle_data(
        &mut self,
        root: U256,
        hashpath_1: Vec<U256>,
        index_1: usize,
        hashpath_2: Vec<U256>,
        index_2: usize,
    ) {
        self.root_1 = Some(root.to_string());
        self.root_2 = Some(root.to_string());
        self.hashpath_1 = Some(
            hashpath_1
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
                .try_into()
                .unwrap(),
        );
        self.hashpath_2 = Some(
            hashpath_2
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
                .try_into()
                .unwrap(),
        );
        self.index_1 = Some(index_1.into());
        self.index_2 = Some(index_2.into());
    }

    pub fn get_secret_nullifier_hashes(&self) -> Option<(U256, U256)> {
        let secret_nullifier_hash_1 = match (&self.secret_1, &self.nullifier_1) {
            (Some(secret_str), Some(nullifier_str)) => {
                let secret = U256::from_str(secret_str).expect("invalid secret_1 format");
                let nullifier = U256::from_str(nullifier_str).expect("invalid nullifier_1 format");
                Some(hash::hash(secret, nullifier))
            }
            _ => None,
        };

        let secret_nullifier_hash_2 = match (&self.secret_2, &self.nullifier_2) {
            (Some(secret_str), Some(nullifier_str)) => {
                let secret = U256::from_str(secret_str).expect("invalid secret_2 format");
                let nullifier = U256::from_str(nullifier_str).expect("invalid nullifier_2 format");
                Some(hash::hash(secret, nullifier))
            }
            _ => None,
        };

        match (secret_nullifier_hash_1, secret_nullifier_hash_2) {
            (Some(hash1), Some(hash2)) => Some((hash1, hash2)),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WitnessMerge {
    pub root_1: Option<String>,
    pub secret_1: Option<String>,
    pub nullifier_1: Option<String>,
    pub commitment_amount_1: Option<String>,
    pub token_address_1: Option<Felt>,
    pub hashpath_1: Option<[String; 31]>,
    pub index_1: Option<Felt>,

    pub root_2: Option<String>,
    pub secret_2: Option<String>,
    pub nullifier_2: Option<String>,
    pub commitment_amount_2: Option<String>,
    pub token_address_2: Option<Felt>,
    pub hashpath_2: Option<[String; 31]>,
    pub index_2: Option<Felt>,

    pub root_3: Option<String>,
    pub secret_3: Option<String>,
    pub nullifier_3: Option<String>,
    pub commitment_amount_3: Option<String>,
    pub token_address_3: Option<Felt>,
    pub hashpath_3: Option<[String; 31]>,
    pub index_3: Option<Felt>,
    pub gas_fee: Option<String>,

    pub refund_secret_1: Option<String>,
    pub refund_nullifier_1: Option<String>,
    pub refund_amount_1: Option<String>,
    pub refund_commitment_hash_1: Option<String>,

    pub refund_secret_2: Option<String>,
    pub refund_nullifier_2: Option<String>,
    pub refund_amount_2: Option<String>,
    pub refund_commitment_hash_2: Option<String>,
}

impl WitnessMerge {
    pub async fn save_to_toml_file(&self, path: &Path) -> std::io::Result<()> {
        let toml_string = toml::to_string(self).unwrap();
        let mut file = File::create(path).await?;
        file.write_all(toml_string.as_bytes()).await?;
        Ok(())
    }

    pub fn new_with_secrets() -> Self {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);

        let secret_1 = hash::hash_one(U256::from_bytes_be(&bytes));
        let nullifier_1 = hash::hash_one(secret_1);

        let mut bytes_2 = [0u8; 32];
        OsRng.fill_bytes(&mut bytes_2);

        let secret_2 = hash::hash_one(U256::from_bytes_be(&bytes_2));
        let nullifier_2 = hash::hash_one(secret_2);

        let mut bytes_3 = [0u8; 32];
        OsRng.fill_bytes(&mut bytes_3);

        let secret_3 = hash::hash_one(U256::from_bytes_be(&bytes_3));
        let nullifier_3 = hash::hash_one(secret_3);

        let mut refund_bytes_1 = [0u8; 32];
        OsRng.fill_bytes(&mut refund_bytes_1);

        let refund_secret_1 = hash::hash_one(U256::from_bytes_be(&refund_bytes_1));
        let refund_nullifier_1 = hash::hash_one(refund_secret_1);

        let mut refund_bytes_2 = [0u8; 32];
        OsRng.fill_bytes(&mut refund_bytes_2);

        let refund_secret_2 = hash::hash_one(U256::from_bytes_be(&refund_bytes_2));
        let refund_nullifier_2 = hash::hash_one(refund_secret_2);

        Self {
            root_1: None,
            secret_1: Some(secret_1.to_string()),
            nullifier_1: Some(nullifier_1.to_string()),
            commitment_amount_1: None,
            token_address_1: None,
            hashpath_1: None,
            index_1: None,
            root_2: None,
            secret_2: Some(secret_2.to_string()),
            nullifier_2: Some(nullifier_2.to_string()),
            commitment_amount_2: None,
            token_address_2: None,
            hashpath_2: None,
            index_2: None,
            root_3: None,
            secret_3: Some(secret_3.to_string()),
            nullifier_3: Some(nullifier_3.to_string()),
            commitment_amount_3: None,
            token_address_3: None,
            hashpath_3: None,
            index_3: None,
            gas_fee: None,
            refund_secret_1: Some(refund_secret_1.to_string()),
            refund_nullifier_1: Some(refund_nullifier_1.to_string()),
            refund_amount_1: None,
            refund_commitment_hash_1: None,
            refund_secret_2: Some(refund_secret_2.to_string()),
            refund_nullifier_2: Some(refund_nullifier_2.to_string()),
            refund_amount_2: None,
            refund_commitment_hash_2: None,
        }
    }

    pub fn set_amounts_and_tokens_with_commitments(
        &mut self,
        commitment_amount_1: String,
        commitment_amount_2: String,
        commitment_amount_3: String,

        gas_fee: String,
        token_address_1: Felt,
        token_address_2: Felt,
        token_address_3: Felt,

        refund_amount_1: String,
        refund_amount_2: String,
    ) {
        self.commitment_amount_1 = Some(commitment_amount_1);
        self.commitment_amount_2 = Some(commitment_amount_2);
        self.commitment_amount_3 = Some(commitment_amount_3);

        self.gas_fee = Some(gas_fee);
        self.token_address_1 = Some(token_address_1.clone());
        self.token_address_2 = Some(token_address_2.clone());
        self.token_address_3 = Some(token_address_3.clone());

        self.refund_amount_1 = Some(refund_amount_1.clone());
        self.refund_amount_2 = Some(refund_amount_2.clone());

        let refund_sn_1 = match (&self.refund_secret_1, &self.refund_nullifier_1) {
            (Some(secret_str), Some(nullifier_str)) => {
                let secret = U256::from_str(secret_str).expect("invalid refund_secret_1 format");
                let nullifier =
                    U256::from_str(nullifier_str).expect("invalid refund_nullifier_1 format");
                Some(hash::hash(secret, nullifier))
            }
            _ => None,
        };

        let refund_sn_2 = match (&self.refund_secret_2, &self.refund_nullifier_2) {
            (Some(secret_str), Some(nullifier_str)) => {
                let secret = U256::from_str(secret_str).expect("invalid refund_secret_2 format");
                let nullifier =
                    U256::from_str(nullifier_str).expect("invalid refund_nullifier_2 format");
                Some(hash::hash(secret, nullifier))
            }
            _ => None,
        };

        let refund_sn_amount = hash::hash(
            refund_sn_1.unwrap(),
            U256::from_str(&refund_amount_1).unwrap(),
        );
        let refund_commitment_hash_1 = hash::hash(
            refund_sn_amount,
            U256::from_bytes_be(&token_address_1.to_bytes_be()),
        );

        let refund_sn_amount_2 = hash::hash(
            refund_sn_2.unwrap(),
            U256::from_str(&refund_amount_2).unwrap(),
        );

        let refund_commitment_hash_2 = hash::hash(
            refund_sn_amount_2,
            U256::from_bytes_be(&token_address_2.to_bytes_be()),
        );

        self.refund_commitment_hash_1 = Some(refund_commitment_hash_1.to_string());
        self.refund_commitment_hash_2 = Some(refund_commitment_hash_2.to_string());
    }

    pub fn set_merkle_data(
        &mut self,
        root: U256,
        hashpath_1: Vec<U256>,
        index_1: usize,
        hashpath_2: Vec<U256>,
        index_2: usize,
        hashpath_3: Vec<U256>,
        index_3: usize,
    ) {
        self.root_1 = Some(root.to_string());
        self.root_2 = Some(root.to_string());
        self.root_3 = Some(root.to_string());

        self.hashpath_1 = Some(
            hashpath_1
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
                .try_into()
                .unwrap(),
        );
        self.hashpath_2 = Some(
            hashpath_2
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
                .try_into()
                .unwrap(),
        );
        self.hashpath_3 = Some(
            hashpath_3
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
                .try_into()
                .unwrap(),
        );
        self.index_1 = Some(index_1.into());
        self.index_2 = Some(index_2.into());
        self.index_3 = Some(index_3.into());
    }

    pub fn get_secret_nullifier_hashes(&self) -> Option<(U256, U256, U256)> {
        let secret_nullifier_hash_1 = match (&self.secret_1, &self.nullifier_1) {
            (Some(secret_str), Some(nullifier_str)) => {
                let secret = U256::from_str(secret_str).expect("invalid secret_1 format");
                let nullifier = U256::from_str(nullifier_str).expect("invalid nullifier_1 format");
                Some(hash::hash(secret, nullifier))
            }
            _ => None,
        };

        let secret_nullifier_hash_2 = match (&self.secret_2, &self.nullifier_2) {
            (Some(secret_str), Some(nullifier_str)) => {
                let secret = U256::from_str(secret_str).expect("invalid secret_2 format");
                let nullifier = U256::from_str(nullifier_str).expect("invalid nullifier_2 format");
                Some(hash::hash(secret, nullifier))
            }
            _ => None,
        };

        let secret_nullifier_hash_3 = match (&self.secret_3, &self.nullifier_3) {
            (Some(secret_str), Some(nullifier_str)) => {
                let secret = U256::from_str(secret_str).expect("invalid secret_3 format");
                let nullifier = U256::from_str(nullifier_str).expect("invalid nullifier_3 format");
                Some(hash::hash(secret, nullifier))
            }
            _ => None,
        };

        match (
            secret_nullifier_hash_1,
            secret_nullifier_hash_2,
            secret_nullifier_hash_3,
        ) {
            (Some(hash1), Some(hash2), Some(hash3)) => Some((hash1, hash2, hash3)),
            _ => None,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct WitnessRecursive {
    pub proof: Vec<String>,
    pub public_inputs: Vec<String>,
    pub verification_key: Vec<Felt>,
}

impl WitnessRecursive {
    pub async fn save_to_toml_file(&self, path: &Path) -> std::io::Result<()> {
        let toml_string = toml::to_string(self).unwrap();
        let mut file = File::create(path).await?;
        file.write_all(toml_string.as_bytes()).await?;
        Ok(())
    }
}

pub async fn setup_devnet(block_number: Option<u64>) -> Devnet {
    Devnet::new(
        Url::parse("https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/ffGrvRxnad_MXHATSkRmHUu8vUlghEok").unwrap(),
        block_number,
        None,
    ).await
}

pub async fn deploy_privacy_pools(devnet: &Devnet) -> Felt {
    let dir = get_current_dir().expect("Failed to get current directory");
    println!("Current dir: {:?}", dir);

    let privacy_sierra_path =
        PathBuf::from("../sn/target/dev/sn_PrivacyAccount.contract_class.json");
    let privacy_casm_path =
        PathBuf::from("../sn/target/dev/sn_PrivacyAccount.compiled_contract_class.json");

    let privacy_pool_declare = devnet
        .declare_contract(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            privacy_sierra_path,
            privacy_casm_path,
        )
        .await
        .unwrap();

    let constructor_calldata = get_privacy_pool_constructor_calldata();
    let salt = Felt::from_hex_unchecked("0x1234");
    let deployer = Felt::ZERO;

    let calculated_contract_address =
        get_contract_address(salt, privacy_pool_declare, &constructor_calldata, deployer);

    // Approve tokens for initial buffer
    approve_tokens_for_contract(devnet, calculated_contract_address, "0x2b5e3af16b1880000").await;

    let privacy_pool_deployment = devnet
        .deploy_contract(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            privacy_pool_declare,
            constructor_calldata,
            Some(salt),
        )
        .await
        .unwrap();

    let deploy_trace = devnet
        .get_transaction_trace(privacy_pool_deployment)
        .await
        .unwrap();
    println!("Deploy trace: {:?}", deploy_trace);

    let deployed_address = devnet
        .get_deployed_contract_address(privacy_pool_deployment)
        .await
        .unwrap();

    println!("Deployed privacy pool at: {:?}", deployed_address);
    assert_eq!(deployed_address, calculated_contract_address);

    deployed_address
}

fn get_privacy_pool_constructor_calldata() -> Vec<Felt> {
    vec![
        Felt::from_hex_unchecked(
            "0x064fa47c02430E5d69c0c5d340e23397bca308f7B9d85247565fc91F2C2aD2f2",
        ), // default_admin
        Felt::from_hex_unchecked(
            "0x064fa47c02430E5d69c0c5d340e23397bca308f7B9d85247565fc91F2C2aD2f2",
        ), // upgrader
        Felt::from_hex_unchecked(
            "0x04f619102a5d0feaf265334d8cbee4a403f468c31448364e320b87801bc4fc27",
        ), // recursive verifier
        Felt::from_hex_unchecked(
            "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
        ), // strk address
        Felt::from_hex_unchecked("0x2b5e3af16b1880000"), // 50 STRK initial buffer
        Felt::from_hex_unchecked("0x0"),
        Felt::from_hex_unchecked("0x22d68309d6cc"), // gas price
        Felt::from_hex_unchecked("0x0"),
        Felt::from_hex_unchecked("0x61a8"), // gas consumed for merge
        Felt::from_hex_unchecked("0x6590"), // gas consumed for transfer
    ]
}

async fn approve_tokens_for_contract(devnet: &Devnet, contract_address: Felt, amount: &str) {
    let approve_call = Call {
        to: STRK_ERC20_CONTRACT_ADDRESS,
        selector: get_selector_from_name("approve").unwrap(),
        calldata: vec![
            contract_address,
            Felt::from_hex_unchecked(amount),
            Felt::from_hex_unchecked("0x0"),
        ],
    };

    devnet
        .execute_v3(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            &[approve_call],
        )
        .await
        .unwrap();
}

pub async fn deploy_extension(
    devnet: &Devnet,
    sierra_path: PathBuf,
    casm_path: PathBuf,
    constructor_args: Option<Vec<Felt>>,
) -> Felt {
    let declare_hash = devnet
        .declare_contract(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            sierra_path,
            casm_path,
        )
        .await
        .unwrap();

    println!("Extension class hash: {:?}", declare_hash);

    let deploy_tx = devnet
        .deploy_contract(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            declare_hash,
            constructor_args.unwrap_or(vec![]),
            None,
        )
        .await
        .unwrap();

    devnet
        .get_deployed_contract_address(deploy_tx)
        .await
        .unwrap()
}

pub async fn setup_privacy_pool_config(
    devnet: &Devnet,
    privacy_pool_address: Felt,
    extension_address: Felt,
    extension_gas_consumed: Felt,
) -> (Vec<Felt>, Vec<Felt>) {
    // Build circuits and set verification keys
    run_nargo_build().unwrap();
    let (concat_vks, execute_vk) = run_bb_write_vks(false).await.unwrap();

    let mut vks_calldata = concat_vks.clone();
    vks_calldata.push(Felt::ONE);
    vks_calldata.push(Felt::ZERO);

    let set_vk_call = Call {
        to: privacy_pool_address,
        selector: get_selector_from_name("set_vk").unwrap(),
        calldata: vks_calldata,
    };

    let set_vk_hash = devnet
        .execute_v3(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            &[set_vk_call],
        )
        .await
        .unwrap();

    let set_vk_trace = devnet.get_transaction_trace(set_vk_hash).await.unwrap();
    println!("Set VK trace: {:?}", set_vk_trace);

    // Deploy recursive verifier
    deploy_recursive_verifier(devnet).await;

    // Add trusted extension
    let trusted_extension_call = Call {
        to: privacy_pool_address,
        selector: get_selector_from_name("add_trusted_extension").unwrap(),
        calldata: vec![extension_address, extension_gas_consumed],
    };

    devnet
        .execute_v3(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            &[trusted_extension_call],
        )
        .await
        .unwrap();
    (concat_vks, execute_vk)
}

async fn deploy_recursive_verifier(devnet: &Devnet) -> Felt {
    let sierra_path =
        PathBuf::from("../sn/target/dev/sn_UltraKeccakHonkVerifier.contract_class.json");
    let casm_path =
        PathBuf::from("../sn/target/dev/sn_UltraKeccakHonkVerifier.compiled_contract_class.json");

    let declare_hash = devnet
        .declare_contract(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            sierra_path,
            casm_path,
        )
        .await
        .unwrap();

    let deploy_tx = devnet
        .deploy_contract(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            declare_hash,
            vec![],
            None,
        )
        .await
        .unwrap();

    devnet
        .get_deployed_contract_address(deploy_tx)
        .await
        .unwrap()
}

pub async fn perform_deposits(
    devnet: &Devnet,
    witness_execute: &mut WitnessExecute,
    amount_execute: U256,
    token_execute: Felt,
    amount_fee: U256,
    privacy_pool_address: Felt,
) -> Vec<U256> {
    let deposits = get_deposit_configs(witness_execute, amount_execute, token_execute, amount_fee);
    let mut leafs: Vec<U256> = Vec::new();

    for deposit_config in deposits {
        let approve_call = Call {
            to: *deposit_config.calldata.last().unwrap(),
            selector: get_selector_from_name("approve").unwrap(),
            calldata: vec![
                privacy_pool_address,
                Felt::from(deposit_config.amount.low),
                Felt::from(deposit_config.amount.high),
            ],
        };

        let deposit_call = Call {
            to: privacy_pool_address,
            selector: get_selector_from_name("deposit").unwrap(),
            calldata: deposit_config.calldata,
        };

        let tx_hash = devnet
            .execute_v3(
                SECOND_FUNDING_ACCOUNT_ADDRESS,
                SECOND_FUNDING_ACCOUNT_PK,
                &[approve_call, deposit_call],
            )
            .await
            .unwrap();

        let trace = devnet.get_transaction_trace(tx_hash).await.unwrap();
        println!("Deposit trace: {:?}", trace);

        let events = devnet
            .get_events(
                None,
                Some(CoreBlock::Tag(BlockTag::Latest)),
                Some(ContractAddress::new(privacy_pool_address).unwrap()),
                Some(
                    [[Felt::from_hex_unchecked(
                        "0x2f8ea430e5eca9b5d3a23e1cce4fc9d7da98cceeaa994d4fca332ea7e3b82cd",
                    )]
                    .to_vec()]
                    .to_vec(),
                ),
                0,
                None,
            )
            .await
            .unwrap();

        let deposit = events.last().unwrap();

        let leaf: U256 = (deposit.data[0], deposit.data[1]).try_into().unwrap();
        leafs.push(leaf);
    }
    leafs
}

pub async fn get_leaf_added_events(
    devnet: &Devnet,
    privacy_pool_address: Felt,
) -> Vec<U256> {
    let events = devnet
        .get_events(
            None,
            Some(CoreBlock::Tag(BlockTag::Latest)),
            Some(ContractAddress::new(privacy_pool_address).unwrap()),
            Some(
                [[Felt::from_hex_unchecked(
                    "0x2f8ea430e5eca9b5d3a23e1cce4fc9d7da98cceeaa994d4fca332ea7e3b82cd",
                )]
                .to_vec()]
                .to_vec(),
            ),
            0,
            None,
        )
        .await
        .unwrap();

    events
        .iter()
        .map(|event| (event.data[0], event.data[1]).try_into().unwrap())
        .collect()
}

pub async fn perform_deposits_merge(
    devnet: &Devnet,
    witness_merge: &mut WitnessMerge,
    amount_merge_1: U256,
    amount_merge_2: U256,
    token_merge: Felt,
    amount_fee: U256,
    privacy_pool_address: Felt,
) -> Vec<U256> {
    let deposits = get_deposit_configs_merge(
        witness_merge,
        amount_merge_1,
        amount_merge_2,
        token_merge,
        amount_fee,
    );
    let mut leafs: Vec<U256> = Vec::new();

    for deposit_config in deposits {
        let approve_call = Call {
            to: *deposit_config.calldata.last().unwrap(),
            selector: get_selector_from_name("approve").unwrap(),
            calldata: vec![
                privacy_pool_address,
                Felt::from(deposit_config.amount.low),
                Felt::from(deposit_config.amount.high),
            ],
        };

        let deposit_call = Call {
            to: privacy_pool_address,
            selector: get_selector_from_name("deposit").unwrap(),
            calldata: deposit_config.calldata,
        };

        let tx_hash = devnet
            .execute_v3(
                SECOND_FUNDING_ACCOUNT_ADDRESS,
                SECOND_FUNDING_ACCOUNT_PK,
                &[approve_call, deposit_call],
            )
            .await
            .unwrap();

        let trace = devnet.get_transaction_trace(tx_hash).await.unwrap();
        println!("Deposit trace: {:?}", trace);

        let events = devnet
            .get_events(
                None,
                Some(CoreBlock::Tag(BlockTag::Latest)),
                Some(ContractAddress::new(privacy_pool_address).unwrap()),
                Some(
                    [[Felt::from_hex_unchecked(
                        "0x2f8ea430e5eca9b5d3a23e1cce4fc9d7da98cceeaa994d4fca332ea7e3b82cd",
                    )]
                    .to_vec()]
                    .to_vec(),
                ),
                0,
                None,
            )
            .await
            .unwrap();

        let deposit = events.last().unwrap();

        let leaf: U256 = (deposit.data[0], deposit.data[1]).try_into().unwrap();
        leafs.push(leaf);
    }
    leafs
}

struct DepositConfig {
    amount: U256,
    calldata: Vec<Felt>,
}

fn get_deposit_configs(
    witness_execute: &mut WitnessExecute,
    amount_execute: U256,
    token_execute: Felt,
    amount_fee: U256,
) -> Vec<DepositConfig> {
    let sn_hashes = witness_execute.get_secret_nullifier_hashes().unwrap();

    vec![
        DepositConfig {
            amount: amount_execute,
            calldata: vec![
                Felt::from(sn_hashes.0.low),
                Felt::from(sn_hashes.0.high),
                Felt::from(amount_execute.low),
                Felt::from(amount_execute.high),
                token_execute,
            ],
        },
        DepositConfig {
            amount: amount_fee,
            calldata: vec![
                Felt::from(sn_hashes.1.low),
                Felt::from(sn_hashes.1.high),
                Felt::from(amount_fee.low),
                Felt::from(amount_fee.high),
                STRK_ERC20_CONTRACT_ADDRESS,
            ],
        },
    ]
}

fn get_deposit_configs_merge(
    witness_merge: &mut WitnessMerge,
    amount_merge_1: U256,
    amount_merge_2: U256,
    token_merge: Felt,
    amount_fee: U256,
) -> Vec<DepositConfig> {
    let sn_hashes = witness_merge.get_secret_nullifier_hashes().unwrap();

    vec![
        DepositConfig {
            amount: amount_merge_1,
            calldata: vec![
                Felt::from(sn_hashes.0.low),
                Felt::from(sn_hashes.0.high),
                Felt::from(amount_merge_1.low),
                Felt::from(amount_merge_1.high),
                token_merge,
            ],
        },
        DepositConfig {
            amount: amount_merge_2,
            calldata: vec![
                Felt::from(sn_hashes.1.low),
                Felt::from(sn_hashes.1.high),
                Felt::from(amount_merge_2.low),
                Felt::from(amount_merge_2.high),
                token_merge,
            ],
        },
        DepositConfig {
            amount: amount_fee,
            calldata: vec![
                Felt::from(sn_hashes.2.low),
                Felt::from(sn_hashes.2.high),
                Felt::from(amount_fee.low),
                Felt::from(amount_fee.high),
                STRK_ERC20_CONTRACT_ADDRESS,
            ],
        },
    ]
}

pub fn build_merkle_and_set_witness(
    merkle_tree: &mut HybridMerkleTree,
    deposits_commitments: &[U256],
    witness_execute: &mut WitnessExecute,
) {
    for leaf in deposits_commitments.iter() {
        merkle_tree.add_leaf(leaf);
    }

    let root = merkle_tree.root();

    let index_1 = merkle_tree
        .find_leaf_index(&deposits_commitments[0])
        .unwrap();
    let index_2 = merkle_tree
        .find_leaf_index(&deposits_commitments[1])
        .unwrap();
    let hashpath_1 = merkle_tree.path(index_1).0;
    let hashpath_2 = merkle_tree.path(index_2).0;

    witness_execute.set_merkle_data(root, hashpath_1, index_1, hashpath_2, index_2);
}

pub fn build_merkle_and_set_witness_merge(
    merkle_tree: &mut HybridMerkleTree,
    deposits_commitments: &[U256],
    witness_merge: &mut WitnessMerge,
) {
    for leaf in deposits_commitments.iter() {
        merkle_tree.add_leaf(leaf);
    }

    let root = merkle_tree.root();

    let index_1 = merkle_tree
        .find_leaf_index(&deposits_commitments[0])
        .unwrap();
    let index_2 = merkle_tree
        .find_leaf_index(&deposits_commitments[1])
        .unwrap();
    let index_3 = merkle_tree
        .find_leaf_index(&deposits_commitments[2])
        .unwrap();
    let hashpath_1 = merkle_tree.path(index_1).0;
    let hashpath_2 = merkle_tree.path(index_2).0;
    let hashpath_3 = merkle_tree.path(index_3).0;

    witness_merge.set_merkle_data(
        root, hashpath_1, index_1, hashpath_2, index_2, hashpath_3, index_3,
    );
}

pub async fn get_contract_balance(devnet: &Devnet, erc20_contract: Felt, account: Felt) -> Felt {
    let balance_call = Call {
        to: erc20_contract,
        selector: get_selector_from_name("balance_of").unwrap(),
        calldata: vec![account],
    };

    devnet.call(balance_call).await.unwrap()[0]
}

pub async fn get_block_number() -> u64 {
    let json_rpc_client = JsonRpcClient::new(HttpTransport::new(Url::parse("https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/C0_A4jbIW1aXb5xxT1Lmuwrsmd4WtvZK").unwrap()));
    json_rpc_client.block_number().await.unwrap()
}

pub async fn generate_withdrawal_proof(execute_vk: Vec<Felt>) -> Vec<Felt> {
    // Generate execute circuit proof
    run_bb_prove(
        "execute",
        "../target/execute/witness.gz",
        "../target/execute",
        false,
    )
    .await
    .unwrap();

    let proof = fs::read_to_string("../target/execute/proof_fields.json")
        .await
        .unwrap();
    let vec_proof: Vec<String> = from_str(&proof).unwrap();

    let pub_inputs = fs::read_to_string("../target/execute/public_inputs_fields.json")
        .await
        .unwrap();
    let vec_pub_inputs: Vec<String> = from_str(&pub_inputs).unwrap();

    // Load execute verification key

    let recursive_witness = WitnessRecursive {
        proof: vec_proof,
        public_inputs: vec_pub_inputs,
        verification_key: execute_vk,
    };

    recursive_witness
        .save_to_toml_file(Path::new(
            "../frontend/static/circuits/recursive/Prover.toml",
        ))
        .await
        .unwrap();

    // Generate recursive proof
    run_nargo_witness("recursive").unwrap();
    run_bb_prove(
        "recursive",
        "../target/recursive/witness.gz",
        "../target/recursive",
        true,
    )
    .await
    .unwrap();

    let recursive_proof = fs::read_to_string("../target/recursive/proof_fields.json")
        .await
        .unwrap();
    let vec_recursive_proof: Vec<String> = from_str(&recursive_proof).unwrap();
    let vec_recursive_proof_u = parse_hex_strings_to_biguint(vec_recursive_proof);

    let recursive_pub_inputs = fs::read_to_string("../target/recursive/public_inputs_fields.json")
        .await
        .unwrap();
    let vec_recursive_pub_inputs: Vec<String> = from_str(&recursive_pub_inputs).unwrap();
    let vec_recursive_pub_inputs_u = parse_hex_strings_to_biguint(vec_recursive_pub_inputs);

    // Load recursive verification key
    let mut vk_file = File::open("../target/recursive/vk").await.unwrap();
    let mut vk_bytes = vec![];
    vk_file.read_to_end(&mut vk_bytes).await.unwrap();

    let calldata = get_honk_calldata(
        &HonkProof::from(vec_recursive_proof_u, vec_recursive_pub_inputs_u).unwrap(),
        &HonkVerificationKey::from_bytes(&vk_bytes).unwrap(),
        HonkFlavor::KECCAK,
    )
    .unwrap();

    let mut felt_calldata: Vec<Felt> = calldata.iter().map(|item| Felt::from(item)).collect();
    felt_calldata.insert(0, Felt::from(felt_calldata.len()));

    felt_calldata
}

pub async fn execute_extension(
    devnet: &Devnet,
    privacy_pool_address: Felt,
    execute_vk: Vec<Felt>,
    extension_calldata: Vec<Felt>,
) {
    let balance_before =
        get_contract_balance(devnet, STRK_ERC20_CONTRACT_ADDRESS, privacy_pool_address).await;
    println!("Balance before withdrawal STRK: {:?}", balance_before);

    let balance_before_eth =
        get_contract_balance(devnet, ETH_ERC20_CONTRACT_ADDRESS, privacy_pool_address).await;
    println!("Balance before withdrawal ETH: {:?}", balance_before_eth);

    // Generate proofs
    let proof_calldata = generate_withdrawal_proof(execute_vk).await;

    let mut execute_extension_calldata = Vec::new();
    execute_extension_calldata.extend(proof_calldata.clone());
    execute_extension_calldata.extend(extension_calldata);

    let execute_extension_call = Call {
        to: privacy_pool_address,
        selector: get_selector_from_name("execute_extension").unwrap(),
        calldata: execute_extension_calldata.clone(),
    };
    println!("extension_calldata: {:?}", &execute_extension_calldata);

    let execute_tx = devnet
        .execute_v3(privacy_pool_address, Felt::ZERO, &[execute_extension_call])
        .await
        .unwrap();

    let balance_after =
        get_contract_balance(devnet, STRK_ERC20_CONTRACT_ADDRESS, privacy_pool_address).await;
    println!("Balance after execute STRK: {:?}", balance_after);

    let balance_after_eth =
        get_contract_balance(devnet, ETH_ERC20_CONTRACT_ADDRESS, privacy_pool_address).await;
    println!("Balance after execute ETH: {:?}", balance_after_eth);

    let trace = devnet.get_transaction_trace(execute_tx).await.unwrap();
    println!("Execute execution trace: {:?}", trace);
}

fn parse_hex_strings_to_biguint(hex_strings: Vec<String>) -> Vec<BigUint> {
    hex_strings
        .into_iter()
        .map(|hex| {
            let no_prefix = hex
                .strip_prefix("0x")
                .unwrap_or_else(|| panic!("Hex string {} not starting from 0x", hex));
            BigUint::from_str_radix(no_prefix, 16)
                .unwrap_or_else(|e| panic!("Error parsing {}: {}", no_prefix, e))
        })
        .collect()
}

pub async fn generate_merge_proof(merge_vk: Vec<Felt>) -> Vec<Felt> {
    // Generate execute circuit proof
    run_bb_prove(
        "merge",
        "../target/merge/witness.gz",
        "../target/merge",
        false,
    )
    .await
    .unwrap();

    let proof = fs::read_to_string("../target/merge/proof_fields.json")
        .await
        .unwrap();
    let vec_proof: Vec<String> = from_str(&proof).unwrap();

    let pub_inputs = fs::read_to_string("../target/merge/public_inputs_fields.json")
        .await
        .unwrap();
    let vec_pub_inputs: Vec<String> = from_str(&pub_inputs).unwrap();

    // Load execute verification key
    let recursive_witness = WitnessRecursive {
        proof: vec_proof,
        public_inputs: vec_pub_inputs,
        verification_key: merge_vk,
    };

    recursive_witness
        .save_to_toml_file(Path::new(
            "../frontend/static/circuits/recursive/Prover.toml",
        ))
        .await
        .unwrap();

    // Generate recursive proof
    run_nargo_witness("recursive").unwrap();
    run_bb_prove(
        "recursive",
        "../target/recursive/witness.gz",
        "../target/recursive",
        true,
    )
    .await
    .unwrap();

    let recursive_proof = fs::read_to_string("../target/recursive/proof_fields.json")
        .await
        .unwrap();
    let vec_recursive_proof: Vec<String> = from_str(&recursive_proof).unwrap();
    let vec_recursive_proof_u = parse_hex_strings_to_biguint(vec_recursive_proof);

    let recursive_pub_inputs = fs::read_to_string("../target/recursive/public_inputs_fields.json")
        .await
        .unwrap();
    let vec_recursive_pub_inputs: Vec<String> = from_str(&recursive_pub_inputs).unwrap();
    let vec_recursive_pub_inputs_u = parse_hex_strings_to_biguint(vec_recursive_pub_inputs);

    // Load recursive verification key
    let mut vk_file = File::open("../target/recursive/vk").await.unwrap();
    let mut vk_bytes = vec![];
    vk_file.read_to_end(&mut vk_bytes).await.unwrap();

    let calldata = get_honk_calldata(
        &HonkProof::from(vec_recursive_proof_u, vec_recursive_pub_inputs_u).unwrap(),
        &HonkVerificationKey::from_bytes(&vk_bytes).unwrap(),
        HonkFlavor::KECCAK,
    )
    .unwrap();

    let mut felt_calldata: Vec<Felt> = calldata.iter().map(|item| Felt::from(item)).collect();
    felt_calldata.insert(0, Felt::from(felt_calldata.len()));

    felt_calldata
}

pub async fn execute_merge(devnet: &Devnet, privacy_pool_address: Felt, merge_vk: Vec<Felt>) {
    // Generate proofs
    let proof_calldata = generate_merge_proof(merge_vk).await;

    let mut execute_merge_calldata = Vec::new();
    execute_merge_calldata.extend(proof_calldata.clone());

    let execute_extension_call = Call {
        to: privacy_pool_address,
        selector: get_selector_from_name("merge").unwrap(),
        calldata: execute_merge_calldata.clone(),
    };

    let execute_tx = devnet
        .execute_v3(privacy_pool_address, Felt::ZERO, &[execute_extension_call])
        .await
        .unwrap();

    let trace = devnet.get_transaction_trace(execute_tx).await.unwrap();
    println!("Merge execution trace: {:?}", trace);
}
