use std::{fs, path::PathBuf, sync::Arc, time::Duration};

use rand::{rngs::StdRng, RngCore, SeedableRng};
use starknet::{
    accounts::{Account, ConnectedAccount, ExecutionEncoding, SingleOwnerAccount},
    contract::ContractFactory,
    core::types::{
        contract::{CompiledClass, SierraClass},
        BlockId, BlockTag, MaybePendingBlockWithTxHashes, TransactionExecutionStatus,
        TransactionReceipt, TransactionStatus,
    },
    providers::{jsonrpc::HttpTransport, JsonRpcClient, Provider},
    signers::{LocalWallet, SigningKey},
};
use starknet_types_core::felt::Felt;
use tracing::info;
use url::Url;

use crate::errors::AppError;

pub async fn deployment(
    url: Url,
    account_address: Felt,
    account_private_key: Felt,
    contracts_path: PathBuf,
) -> Result<(), AppError> {
    let provider = JsonRpcClient::new(HttpTransport::new(url));
    let chain_id = provider.chain_id().await?;

    let private_key = SigningKey::from_secret_scalar(account_private_key);

    let account = SingleOwnerAccount::new(
        provider.clone(),
        LocalWallet::from(private_key),
        account_address,
        chain_id,
        ExecutionEncoding::New,
    );

    let casm1 = fs::read_to_string(
        contracts_path.join("integrations_UltraKeccakHonkVerifier.compiled_contract_class.json"),
    )?;

    let sierra1 = fs::read_to_string(
        contracts_path.join("integrations_UltraKeccakHonkVerifier.contract_class.json"),
    )?;

    let casm_class_hash1 = serde_json::from_str::<CompiledClass>(&casm1)
        .unwrap()
        .class_hash()
        .map_err(|e| e.to_string())
        .unwrap();

    let flattened_class1 = serde_json::from_str::<SierraClass>(&sierra1)
        .unwrap()
        .clone()
        .flatten()
        .map_err(|e| e.to_string())
        .unwrap();

    let declare_result = account
        .declare_v3(Arc::new(flattened_class1), casm_class_hash1)
        .send()
        .await?;

    wait_for_sent_transaction(declare_result.transaction_hash, &account).await?;

    let casm1 = fs::read_to_string(
        contracts_path.join("integrations_WithdrawExtension.compiled_contract_class.json"),
    )?;

    let sierra1 = fs::read_to_string(
        contracts_path.join("integrations_WithdrawExtension.contract_class.json"),
    )?;

    let casm_class_hash1 = serde_json::from_str::<CompiledClass>(&casm1)
        .unwrap()
        .class_hash()
        .map_err(|e| e.to_string())
        .unwrap();

    let flattened_class1 = serde_json::from_str::<SierraClass>(&sierra1)
        .unwrap()
        .clone()
        .flatten()
        .map_err(|e| e.to_string())
        .unwrap();

    let declare_result = account
        .declare_v3(Arc::new(flattened_class1), casm_class_hash1)
        .send()
        .await?;

    wait_for_sent_transaction(declare_result.transaction_hash, &account).await?;

    let mut salt_buffer = [0u8; 32];
    let mut rng = StdRng::from_entropy();
    rng.fill_bytes(&mut salt_buffer[1..]);

    let deploy_extension = ContractFactory::new(declare_result.class_hash, account.clone())
        .deploy_v3(vec![], Felt::from_bytes_be(&salt_buffer), true)
        .send()
        .await?;

    wait_for_sent_transaction(deploy_extension.transaction_hash, &account).await?;

    let deployment_receipt = provider
        .get_transaction_receipt(deploy_extension.transaction_hash)
        .await?;

    let deployed_contract_address = match &deployment_receipt.receipt {
        TransactionReceipt::Deploy(receipt) => receipt.contract_address,
        TransactionReceipt::Invoke(receipt) => receipt
            .events
            .first()
            .and_then(|event| event.data.first())
            .cloned()
            .ok_or("Missing contract_address in Invoke receipt")
            .unwrap(),
        _ => {
            return Err(AppError::UnexpectedReceiptType);
        }
    };

    println!(
        "Extension contract address:  {:?}",
        deployed_contract_address
    );

    let casm2 = fs::read_to_string(
        contracts_path.join("integrations_PrivacyPools.compiled_contract_class.json"),
    )?;

    let sierra2 =
        fs::read_to_string(contracts_path.join("integrations_PrivacyPools.contract_class.json"))?;

    let casm_class_hash2 = serde_json::from_str::<CompiledClass>(&casm2)
        .unwrap()
        .class_hash()
        .map_err(|e| e.to_string())
        .unwrap();

    let flattened_class2 = serde_json::from_str::<SierraClass>(&sierra2)
        .unwrap()
        .clone()
        .flatten()
        .map_err(|e| e.to_string())
        .unwrap();

    let declare_result = account
        .declare_v3(Arc::new(flattened_class2), casm_class_hash2)
        .send()
        .await?;
    wait_for_sent_transaction(declare_result.transaction_hash, &account).await?;

    let mut salt_buffer = [0u8; 32];
    let mut rng = StdRng::from_entropy();
    rng.fill_bytes(&mut salt_buffer[1..]);

    let deploy_privacy = ContractFactory::new(declare_result.class_hash, account.clone())
        .deploy_v3(
            vec![Felt::from_hex_unchecked(
                "0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec",
            )],
            Felt::from_bytes_be(&salt_buffer),
            true,
        )
        .send()
        .await?;

    wait_for_sent_transaction(deploy_privacy.transaction_hash, &account).await?;

    let deployment_receipt = provider
        .get_transaction_receipt(deploy_privacy.transaction_hash)
        .await?;

    let deployed_contract_address = match &deployment_receipt.receipt {
        TransactionReceipt::Deploy(receipt) => receipt.contract_address,
        TransactionReceipt::Invoke(receipt) => receipt
            .events
            .first()
            .and_then(|event| event.data.first())
            .cloned()
            .ok_or("Missing contract_address in Invoke receipt")
            .unwrap(),
        _ => {
            return Err(AppError::UnexpectedReceiptType);
        }
    };

    println!("Privacy contract address:  {:?}", deployed_contract_address);

    Ok(())
}

pub async fn wait_for_sent_transaction(
    transaction_hash: Felt,
    user_passed_account: &SingleOwnerAccount<JsonRpcClient<HttpTransport>, LocalWallet>,
) -> Result<TransactionStatus, AppError> {
    let start_fetching = std::time::Instant::now();
    let wait_for = Duration::from_secs(60);

    loop {
        if start_fetching.elapsed() > wait_for {
            return Err(AppError::TransactionFailed(format!(
                "Transaction {:?} not mined in 60 seconds.",
                transaction_hash
            )));
        }

        // Check transaction status
        let status = match user_passed_account
            .provider()
            .get_transaction_status(transaction_hash)
            .await
        {
            Ok(status) => status,
            Err(_e) => {
                info!(
                    "Error while checking status for transaction: {:?}. Retrying...",
                    transaction_hash
                );
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
        };

        match status {
            TransactionStatus::Received => {
                info!(
                    "🛎️ Transaction {:?} received. Retrying...",
                    transaction_hash
                );
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
            TransactionStatus::Rejected => {
                info!(
                    "❌ Transaction {:?} rejected. Stopping...",
                    transaction_hash
                );
                return Err(AppError::TransactionFailed(transaction_hash.to_string()));
            }
            TransactionStatus::AcceptedOnL2(transaction_execution_status) => {
                match transaction_execution_status {
                    TransactionExecutionStatus::Succeeded => {
                        info!(
                        "Transaction {:?} status: AcceptedOnL2 and Succeeded. Checking block inclusion...",
                        transaction_hash
                    );

                        // Check if the transaction is in the pending block
                        let in_pending = match user_passed_account
                            .provider()
                            .get_block_with_tx_hashes(BlockId::Tag(BlockTag::Pending))
                            .await
                        {
                            Ok(MaybePendingBlockWithTxHashes::PendingBlock(block)) => {
                                block.transactions.contains(&transaction_hash)
                            }
                            _ => false,
                        };

                        // Check if the transaction is in the latest block
                        let in_latest = match user_passed_account
                            .provider()
                            .get_block_with_tx_hashes(BlockId::Tag(BlockTag::Latest))
                            .await
                        {
                            Ok(MaybePendingBlockWithTxHashes::Block(block)) => {
                                block.transactions.contains(&transaction_hash)
                            }
                            _ => false,
                        };

                        if in_pending && !in_latest {
                            info!(
                            "Transaction {:?} is in Pending block but not yet in Latest block. Retrying...",
                            transaction_hash
                        );
                            tokio::time::sleep(Duration::from_secs(2)).await;
                            continue;
                        }

                        if in_latest && !in_pending {
                            info!(
                            "✅ Transaction {:?} confirmed in Latest block and not in Pending. Finishing...",
                            transaction_hash
                        );
                            return Ok(status);
                        }

                        info!(
                            "Transaction {:?} is neither in Latest nor finalized. Retrying...",
                            transaction_hash
                        );
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                    TransactionExecutionStatus::Reverted => {
                        info!(
                            "❌ Transaction {:?} reverted on L2. Stopping...",
                            transaction_hash
                        );
                        return Err(AppError::TransactionFailed(transaction_hash.to_string()));
                    }
                }
            }
            TransactionStatus::AcceptedOnL1(transaction_execution_status) => {
                match transaction_execution_status {
                    TransactionExecutionStatus::Succeeded => {
                        info!(
                            "Transaction {:?} status: AcceptedOnL1 and Succeeded. Finishing...",
                            transaction_hash
                        );
                        return Ok(status);
                    }
                    TransactionExecutionStatus::Reverted => {
                        info!(
                            "❌ Transaction {:?} reverted on L1. Stopping...",
                            transaction_hash
                        );
                        return Err(AppError::TransactionFailed(transaction_hash.to_string()));
                    }
                }
            }
        }
    }
}
