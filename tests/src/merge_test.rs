use std::{path::Path, str::FromStr};

use cainome::cairo_serde::U256;
use starknet_rs_core::types::Felt;

use crate::utils::{
    bb::run_nargo_witness,
    merkle::HybridMerkleTree,
    shared::{
        build_merkle_and_set_witness_merge, deploy_privacy_pools, execute_merge,
        perform_deposits_merge, setup_devnet, setup_privacy_pool_config, WitnessMerge,
        SECOND_FUNDING_ACCOUNT_ADDRESS, STRK_ERC20_CONTRACT_ADDRESS,
    },
};

pub async fn merge(deposit_1: u128, deposit_2: u128) {
    let devnet = setup_devnet(None).await;
    let privacy_pool_deployed_contract_address = deploy_privacy_pools(&devnet).await;
    let merge_vk = setup_privacy_pool_config(
        &devnet,
        privacy_pool_deployed_contract_address,
        Felt::ZERO, // hardcore - extension address is not used in this test
        Felt::ZERO,
    )
    .await
    .0[1..113]
        .to_vec();

    println!("Merge Vk latst elemtent: {:?}", merge_vk.last().unwrap());

    let mut witness_merge = WitnessMerge::new_with_secrets();
    let mut merkle_tree = HybridMerkleTree::new(None, 32);

    let commitment_amount_1 = U256::from(deposit_1);
    let commitment_amount_2 = U256::from(deposit_2);
    // fee amount mocked as 5 STRK
    let commitment_amount_3 = U256::from_str("0x4563918244f40000").unwrap();

    let merge_refund_amount = commitment_amount_1 + commitment_amount_2;

    // Mint STRK tokens to the funding account
    devnet
        .mint_token(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            deposit_1 + deposit_2 + 5000000000000000000u128, // merge deposits + fee
            STRK_ERC20_CONTRACT_ADDRESS,
        )
        .await
        .unwrap();

    let deposits_commitments = perform_deposits_merge(
        &devnet,
        &mut witness_merge,
        commitment_amount_1.clone(),
        commitment_amount_2.clone(),
        STRK_ERC20_CONTRACT_ADDRESS,
        commitment_amount_3.clone(),
        privacy_pool_deployed_contract_address,
    )
    .await;

    build_merkle_and_set_witness_merge(&mut merkle_tree, &deposits_commitments, &mut witness_merge);

    witness_merge.set_amounts_and_tokens_with_commitments(
        commitment_amount_1.to_string(),
        commitment_amount_2.to_string(),
        commitment_amount_3.to_string(),
        commitment_amount_3.to_string(),
        STRK_ERC20_CONTRACT_ADDRESS,
        STRK_ERC20_CONTRACT_ADDRESS,
        STRK_ERC20_CONTRACT_ADDRESS,
        "0x0".to_string(), // refund fee equal to 0 - all fee deposit used for merge
        merge_refund_amount.to_string(),
    );

    let _ = witness_merge
        .save_to_toml_file(Path::new("../frontend/static/circuits/merge/Prover.toml"))
        .await
        .unwrap();

    run_nargo_witness("merge").unwrap();

    execute_merge(&devnet, privacy_pool_deployed_contract_address, merge_vk).await;
}
