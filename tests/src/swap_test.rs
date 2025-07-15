use std::{
    path::{Path, PathBuf},
    str::FromStr,
};

use cainome::cairo_serde::U256;
use devnet_lib::devnet::ETH_ERC20_CONTRACT_ADDRESS;
use starknet_rs_core::{
    types::{Call, Felt},
    utils::get_selector_from_name,
};

use crate::utils::{
    bb::run_nargo_witness,
    merkle::HybridMerkleTree,
    shared::{
        build_merkle_and_set_witness, deploy_extension, deploy_privacy_pools, execute_extension,
        get_block_number, get_contract_balance, perform_deposits, setup_devnet,
        setup_privacy_pool_config, WitnessExecute, SECOND_FUNDING_ACCOUNT_ADDRESS,
        SECOND_FUNDING_ACCOUNT_PK, STRK_ERC20_CONTRACT_ADDRESS,
    },
    swap::{
        fetch_ekubo_quote, prepare_swap_extension_calldata, prepare_swap_router_calldata,
        u256_to_decimal_string,
    },
};

pub async fn swap(amount_to_swap: u128) {
    let block_for_testing = get_block_number().await;
    // Official Starknet Sepolia token addresses
    let input_token = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"; // STRK
    let target_token = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"; // ETH
    let ekubo_router = Felt::from_hex_unchecked(
        "0x050d4da9f66589eadaa1d5e31cf73b08ac1a67c8b4dcd88e6fd4fe501c628af2",
    );

    let user_swap_amount = U256::from(amount_to_swap);
    // Prepare swap calldata - convert U256 hex to decimal string
    let user_swap_amount_decimal = u256_to_decimal_string(&user_swap_amount.to_string())
        .expect("Failed to convert U256 to decimal string");

    let ekubo = fetch_ekubo_quote(&user_swap_amount_decimal, input_token, target_token)
        .await
        .unwrap();

    // Swap using only Ekubo contract
    let devnet = setup_devnet(Some(block_for_testing)).await;

    devnet
        .mint_token(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            amount_to_swap,
            STRK_ERC20_CONTRACT_ADDRESS,
        )
        .await
        .unwrap();

    let mut swap_router_calldata = prepare_swap_router_calldata(
        &user_swap_amount_decimal, // Now passing decimal string
        input_token,
        target_token,
        Some(ekubo.clone()),
    )
    .await
    .expect("Failed to prepare swap calldata");

    // Remove length prefix for Ekubo router
    swap_router_calldata.remove(0);

    println!(
        "✅ Swap router calldata prepared: {:?}",
        swap_router_calldata
    );

    let transfer_router_call = Call {
        to: STRK_ERC20_CONTRACT_ADDRESS,
        selector: get_selector_from_name("transfer").unwrap(),
        calldata: vec![
            ekubo_router,
            Felt::from(user_swap_amount.low),
            Felt::from(user_swap_amount.high),
        ],
    };

    let binding = [transfer_router_call];
    let _transfer_hash = devnet
        .execute_v3(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            &binding,
        )
        .await
        .unwrap();

    let multi_multihop_swap_call = Call {
        to: ekubo_router,
        selector: get_selector_from_name("multi_multihop_swap").unwrap(),
        calldata: swap_router_calldata,
    };

    let eth_before_swap = get_contract_balance(
        &devnet,
        ETH_ERC20_CONTRACT_ADDRESS,
        SECOND_FUNDING_ACCOUNT_ADDRESS,
    )
    .await;

    let _swap_hash = devnet
        .execute_v3(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            &[multi_multihop_swap_call],
        )
        .await
        .unwrap();

    let clear_minimum_call = Call {
        to: ekubo_router,
        selector: get_selector_from_name("clear_minimum_to_recipient").unwrap(),
        calldata: vec![
            ETH_ERC20_CONTRACT_ADDRESS,
            Felt::from(0),
            Felt::from(0),
            SECOND_FUNDING_ACCOUNT_ADDRESS,
        ],
    };

    let _clear_minimum_result = devnet
        .execute_v3(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            SECOND_FUNDING_ACCOUNT_PK,
            &[clear_minimum_call],
        )
        .await
        .unwrap();

    let eth_after_swap = get_contract_balance(
        &devnet,
        ETH_ERC20_CONTRACT_ADDRESS,
        SECOND_FUNDING_ACCOUNT_ADDRESS,
    )
    .await;

    println!("Eth balance before swap: {:?}", eth_before_swap);
    println!("Eth balance after swap: {:?}", eth_after_swap);

    let ekubo_router_swapped = eth_after_swap - eth_before_swap;

    println!(
        "Swapped tokens using Ekubo Router: {:?}",
        ekubo_router_swapped
    );

    let second_devnet = setup_devnet(Some(block_for_testing)).await;

    devnet
        .mint_token(
            SECOND_FUNDING_ACCOUNT_ADDRESS,
            amount_to_swap,
            STRK_ERC20_CONTRACT_ADDRESS,
        )
        .await
        .unwrap();

    let privacy_pool_deployed_contract_address = deploy_privacy_pools(&second_devnet).await;
    let sierra_path = PathBuf::from("../sn/target/dev/sn_SwapExtension.contract_class.json");
    let casm_path = PathBuf::from("../sn/target/dev/sn_SwapExtension.compiled_contract_class.json");
    let ekubo_core =
        Felt::from_hex("0x0444a09d96389aa7148f1aada508e30b71299ffe650d9c97fdaae38cb9a23384")
            .unwrap();
    let swap_extension_address = deploy_extension(
        &second_devnet,
        sierra_path,
        casm_path,
        Some(vec![ekubo_core, privacy_pool_deployed_contract_address]),
    )
    .await;

    println!(
        "\n-------->\n EXTENSION ADDRESS {:?} \n-------->\n",
        swap_extension_address
    );

    let execute_vk = setup_privacy_pool_config(
        &second_devnet,
        privacy_pool_deployed_contract_address,
        swap_extension_address,
        Felt::from_dec_str("22000").unwrap(),
    )
    .await
    .1;

    let mut witness_execute = WitnessExecute::new_with_secrets();
    let mut merkle_tree = HybridMerkleTree::new(None, 32);

    let commitment_amount_1 = U256::from(amount_to_swap);
    let commitment_amount_2 = U256::from_str("0x4563918244f40000").unwrap();

    let deposits_commitments = perform_deposits(
        &second_devnet,
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

    let _ = witness_execute
        .save_to_toml_file(Path::new("../frontend/static/circuits/execute/Prover.toml"))
        .await
        .unwrap();

    run_nargo_witness("execute").unwrap();

    // Prepare swap calldata - convert U256 hex to decimal string
    let user_swap_amount_decimal = u256_to_decimal_string(&commitment_amount_1.to_string())
        .expect("Failed to convert U256 to decimal string");

    let secret_and_nullifier_hash = 123456789u128; // Could add generating secret -> nullifier -> hash

    println!(
        "🔄 Preparing swap calldata for: {} STRK -> ETH",
        user_swap_amount_decimal
    );
    println!("📝 Using official Sepolia addresses:");
    println!("   STRK: {}", input_token);
    println!("   ETH:  {}", target_token);
    println!(
        "📊 Amount hex: {} -> decimal: {}",
        commitment_amount_1, user_swap_amount_decimal
    );

    // Build the swap calldata using real Ekubo data (with fallback to mock)
    let swap_extension_calldata = prepare_swap_extension_calldata(
        &user_swap_amount_decimal, // Now passing decimal string
        input_token,
        target_token,
        secret_and_nullifier_hash,
        swap_extension_address,
        Some(ekubo.clone()),
    )
    .await
    .expect("Failed to prepare swap calldata");

    println!(
        "✅ Swap extension calldata prepared with {} elements",
        swap_extension_calldata.len()
    );
    println!("📊 Calldata breakdown:");
    for (i, felt) in swap_extension_calldata.iter().enumerate() {
        println!("  [{}]: {:?}", i, felt);
    }

    let balance_eth_before_swap = get_contract_balance(
        &second_devnet,
        ETH_ERC20_CONTRACT_ADDRESS,
        privacy_pool_deployed_contract_address,
    )
    .await;
    // Execute the swap extension
    execute_extension(
        &second_devnet,
        privacy_pool_deployed_contract_address,
        execute_vk,
        swap_extension_calldata,
    )
    .await;

    let balance_eth_after_swap = get_contract_balance(
        &second_devnet,
        ETH_ERC20_CONTRACT_ADDRESS,
        privacy_pool_deployed_contract_address,
    )
    .await;

    let extension_swapped = balance_eth_after_swap - balance_eth_before_swap;

    println!("Eth balance before swap: {:?}", balance_eth_before_swap);
    println!("Eth balance after swap: {:?}", balance_eth_after_swap);

    println!(
        "Swapped tokens using Aletheia Extension: {:?}",
        extension_swapped
    );

    assert!(
        ekubo_router_swapped == extension_swapped,
        "Ekubo Router and Aletheia Extension swapped amounts do not match!"
    );
    println!("🎉 Swap test completed successfully!");
}
