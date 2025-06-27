use std::{
    path::{Path, PathBuf},
    str::FromStr,
};

use cainome::cairo_serde::U256;
use starknet_rs_core::types::Felt;

use crate::utils::{
    bb::run_nargo_witness,
    merkle::HybridMerkleTree,
    shared::{
        build_merkle_and_set_witness, deploy_extension, deploy_privacy_pools, execute_extension,
        get_contract_balance, perform_deposits, setup_devnet, setup_privacy_pool_config,
        WitnessExecute, SECOND_FUNDING_ACCOUNT_ADDRESS, STRK_ERC20_CONTRACT_ADDRESS,
    },
};

pub async fn withdraw(withdraw_amount: u128) {
    let sierra_path = PathBuf::from("../sn/target/release/sn_WithdrawExtension.contract_class.json");
    let casm_path = PathBuf::from("../sn/target/release/sn_WithdrawExtension.compiled_contract_class.json");

    let devnet = setup_devnet(None).await;
    let privacy_pool_deployed_contract_address = deploy_privacy_pools(&devnet).await;
    let withdraw_extension_address = deploy_extension(&devnet, sierra_path, casm_path, None).await;
    let execute_vk = setup_privacy_pool_config(
        &devnet,
        privacy_pool_deployed_contract_address,
        withdraw_extension_address,
        Felt::from_dec_str("22000").unwrap(),
    )
    .await;

    let mut witness_execute = WitnessExecute::new_with_secrets();
    let mut merkle_tree = HybridMerkleTree::new(None, 32);

    let commitment_amount_1 = U256::from(withdraw_amount);
    // fee amount mocked as 5 STRK
    let commitment_amount_2 = U256::from_str("0x4563918244f40000").unwrap();

    // Mint STRK tokens to the funding account
    devnet
        .mint_token(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            withdraw_amount,
            STRK_ERC20_CONTRACT_ADDRESS,
        )
        .await
        .unwrap();

    let deposits_commitments = perform_deposits(
        &devnet,
        &mut witness_execute,
        commitment_amount_1.clone(),
        STRK_ERC20_CONTRACT_ADDRESS,
        commitment_amount_2.clone(),
        privacy_pool_deployed_contract_address,
    )
    .await;

    build_merkle_and_set_witness(
        &mut merkle_tree,
        &deposits_commitments,
        &mut witness_execute,
    );

    witness_execute.set_amounts_and_tokens_with_commitments(
        commitment_amount_1.to_string(),
        commitment_amount_2.to_string(),
        commitment_amount_1.to_string(),
        commitment_amount_2.to_string(),
        STRK_ERC20_CONTRACT_ADDRESS,
        STRK_ERC20_CONTRACT_ADDRESS,
        "0x0".to_string(),
        "0x0".to_string(),
    );

    witness_execute._recipient = Some(SECOND_FUNDING_ACCOUNT_ADDRESS);

    let _ = witness_execute.save_to_toml_file(Path::new("../frontend/static/circuits/execute/Prover.toml"));

    run_nargo_witness("execute").unwrap();

    // Prepare withdrawal calldata
    let withdraw_extension_calldata = vec![
        withdraw_extension_address,
        Felt::from(4),
        privacy_pool_deployed_contract_address,
        SECOND_FUNDING_ACCOUNT_ADDRESS,
        STRK_ERC20_CONTRACT_ADDRESS,
        Felt::from_bytes_be(&commitment_amount_1.to_bytes_be()),
    ];

    let balace_before_withdrawal = get_contract_balance(
        &devnet,
        STRK_ERC20_CONTRACT_ADDRESS,
        SECOND_FUNDING_ACCOUNT_ADDRESS,
    )
    .await;

    execute_extension(
        &devnet,
        privacy_pool_deployed_contract_address,
        execute_vk,
        withdraw_extension_calldata,
    )
    .await;

    let balace_after_withdrawal = get_contract_balance(
        &devnet,
        STRK_ERC20_CONTRACT_ADDRESS,
        SECOND_FUNDING_ACCOUNT_ADDRESS,
    )
    .await;

    let expected_balance_after_withdrawal =
        balace_before_withdrawal + Felt::from_bytes_be(&commitment_amount_1.to_bytes_be());

    assert!(
        expected_balance_after_withdrawal == balace_after_withdrawal,
        "Expected balance after withdrawal: {:?}, but got: {:?}",
        expected_balance_after_withdrawal,
        balace_after_withdrawal
    );
}
