use num_bigint::BigUint;
use num_traits::Num;
use reqwest;
use serde::{Deserialize, Serialize};
use starknet_rs_core::types::Felt;
use std::str::FromStr;

/// Accepts either a hex string (`"0x..."`) or a decimal string, and returns
/// a 32-nibble, zero-padded hex felt (u128).
fn encode_u128(src: &str) -> Result<String, Box<dyn std::error::Error>> {
    let clean = src.trim_start_matches("0x");
    let value = if src.starts_with("0x") {
        BigUint::from_str_radix(clean, 16)?
    } else {
        BigUint::from_str(clean)?
    };
    Ok(format!("0x{:032x}", value))
}

/// Splits a hex u256 string (`"0x..."`) into low and high u128 parts,
/// each returned as a 32-nibble, zero-padded hex felt.
fn encode_u256(src: &str) -> Result<(String, String), Box<dyn std::error::Error>> {
    let clean = src.trim_start_matches("0x");
    let value = BigUint::from_str_radix(clean, 16)?;
    let mask = (BigUint::from(1u32) << 128) - BigUint::from(1u32);
    let low = &value & &mask;
    let high = &value >> 128;
    Ok((format!("0x{:032x}", low), format!("0x{:032x}", high)))
}

/// Encodes a signed decimal string into (magnitude_felt, sign_felt).
/// The magnitude is padded to a 32-nibble hex felt, the sign is `"0x0"` or `"0x1"`.
fn encode_i129(signed_dec: &str) -> Result<(String, String), Box<dyn std::error::Error>> {
    let (neg, mag) = if signed_dec.starts_with('-') {
        (true, &signed_dec[1..])
    } else {
        (false, signed_dec)
    };
    let mag_felt = encode_u128(mag)?;
    let sign_felt = if neg {
        "0x1".to_string()
    } else {
        "0x0".to_string()
    };
    Ok((mag_felt, sign_felt))
}

/// (Optional) helper to convert a hex-string u256 into decimal string for API calls.
pub fn u256_to_decimal_string(hex_value: &str) -> Result<String, Box<dyn std::error::Error>> {
    let clean = hex_value.trim_start_matches("0x");
    let n = BigUint::from_str_radix(clean, 16)?;
    Ok(n.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EkuboPoolKey {
    pub token0: String,
    pub token1: String,
    pub fee: String,       // hex-string u128
    pub tick_spacing: u64, // u128
    pub extension: String, // address or "0x0"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EkuboRouteNode {
    pub pool_key: EkuboPoolKey,
    pub sqrt_ratio_limit: String, // hex-string u256
    pub skip_ahead: u64,          // u128
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EkuboSplit {
    pub amount_specified: String,  // input tokens down this path
    pub amount_calculated: String, // output tokens this path produces
    pub route: Vec<EkuboRouteNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EkuboQuoteResponse {
    pub total_calculated: String, // sum of all amount_calculated
    pub price_impact: f64,        // percent impact
    pub splits: Vec<EkuboSplit>,
}

/// Fetches a quote from the Ekubo quoter API.
pub async fn fetch_ekubo_quote(
    amount_in_wei: &str,
    token_in: &str,
    token_out: &str,
) -> Result<EkuboQuoteResponse, Box<dyn std::error::Error>> {
    const EKUBO_QUOTER_BASE_URL: &str = "https://starknet-sepolia-quoter-api.ekubo.org";
    let url = format!(
        "{}/{}/{}/{}",
        EKUBO_QUOTER_BASE_URL, amount_in_wei, token_in, token_out
    );
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await?;
    println!("\n\nEKUBO RES {:?} \n\n", res);
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(format!("Ekubo quoter error: {} - {}", status, text).into());
    }
    Ok(serde_json::from_str(&text)?)
}

/// Builds the swap calldata to match the JavaScript implementation exactly.
/// Returns a `Vec<String>` of hex felts.
pub fn build_swap_calldata(
    ekubo: &EkuboQuoteResponse,
    input_token: &str,
    secret_and_nullifier_hash: Option<u128>,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut data = Vec::new();

    // 1) number of swaps
    data.push(encode_u128(&ekubo.splits.len().to_string())?);

    // 2) each split → route nodes + token amount
    for split in &ekubo.splits {
        // a) route length
        data.push(encode_u128(&split.route.len().to_string())?);

        // b) route nodes
        for node in &split.route {
            // token0, token1 (as-is)
            data.push(node.pool_key.token0.clone());
            data.push(node.pool_key.token1.clone());

            // fee (u128) & tick_spacing (u128)
            data.push(encode_u128(&node.pool_key.fee)?);
            data.push(encode_u128(&node.pool_key.tick_spacing.to_string())?);

            // extension
            data.push(node.pool_key.extension.clone());

            // sqrt_ratio_limit → low/high
            let (low, high) = encode_u256(&node.sqrt_ratio_limit)?;
            data.push(low);
            data.push(high);

            // skip_ahead
            data.push(encode_u128(&node.skip_ahead.to_string())?);
        }

        // c) token amount: token + amount (i129)
        data.push(input_token.to_lowercase());
        let (amt_mag, amt_sign) = encode_i129(&split.amount_specified)?;
        data.push(amt_mag);
        data.push(amt_sign);
    }

    // 3) secret_and_nullifier_hash as u256 → low/high
    if let Some(secret_and_nullifier_hash) = secret_and_nullifier_hash {
        let secret_hex = format!("0x{:x}", secret_and_nullifier_hash);
        let (sec_low, sec_high) = encode_u256(&secret_hex)?;
        data.push(sec_low);
        data.push(sec_high);
    }
    // 4) prepend total felts count
    let total = data.len();
    let total_felts = encode_u128(&total.to_string())?;
    let mut result = Vec::with_capacity(total + 1);
    result.push(total_felts);
    result.extend(data);

    Ok(result)
}

/// Converts the Vec<String> of hex felts into Vec<Felt> for Starknet calls.
fn strings_to_felts(strings: Vec<String>) -> Result<Vec<Felt>, Box<dyn std::error::Error>> {
    strings
        .into_iter()
        .map(|s| Felt::from_hex(&s).map_err(|e| e.into()))
        .collect()
}

/// Prepares the full calldata for calling your SwapExtensionZk, including
/// the extension address and the length prefix for `execute_extension`.
pub async fn prepare_swap_extension_calldata(
    user_swap_amount_wei: &str,
    input_token: &str,
    target_token: &str,
    secret_and_nullifier_hash: u128,
    swap_extension_address: Felt,
    ekubo_quote: Option<EkuboQuoteResponse>,
) -> Result<Vec<Felt>, Box<dyn std::error::Error>> {
    let ekubo = match ekubo_quote {
        Some(q) => q,
        None => fetch_ekubo_quote(user_swap_amount_wei, input_token, target_token).await?,
    };
    let string_calldata =
        build_swap_calldata(&ekubo, input_token, Some(secret_and_nullifier_hash))?;
    let mut extension_calldata = strings_to_felts(string_calldata)?;
    let mut final_calldata = vec![swap_extension_address];
    final_calldata.append(&mut extension_calldata);
    Ok(final_calldata)
}

/// Prepares the full calldata for calling your SwapExtensionZk, including
/// the extension address and the length prefix for `execute_extension`.
pub async fn prepare_swap_router_calldata(
    user_swap_amount_wei: &str,
    input_token: &str,
    target_token: &str,
    ekubo_quote: Option<EkuboQuoteResponse>,
) -> Result<Vec<Felt>, Box<dyn std::error::Error>> {
    let ekubo = match ekubo_quote {
        Some(q) => q,
        None => fetch_ekubo_quote(user_swap_amount_wei, input_token, target_token).await?,
    };
    let string_calldata = build_swap_calldata(&ekubo, input_token, None)?;
    let router_calldata = strings_to_felts(string_calldata)?;
    Ok(router_calldata)
}

#[tokio::test]
async fn test_build_swap_calldata_with_real_ekubo_data() {
    // Exact response from Ekubo API for 0.1 STRK -> ETH swap
    let real_ekubo_response = EkuboQuoteResponse {
        total_calculated: "15536039172203".to_string(),
        price_impact: -0.16894932,
        splits: vec![EkuboSplit {
            amount_specified: "100000000000000000".to_string(),
            amount_calculated: "15536039172203".to_string(),
            route: vec![EkuboRouteNode {
                pool_key: EkuboPoolKey {
                    token0: "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
                        .to_string(),
                    token1: "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                        .to_string(),
                    fee: "0xc49ba5e353f7d00000000000000000".to_string(),
                    tick_spacing: 5982,
                    extension: "0x0".to_string(),
                },
                sqrt_ratio_limit: "0x18227127a68af1667d19509cea645d1".to_string(),
                skip_ahead: 0,
            }],
        }],
    };

    let input_token = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
    let secret_and_nullifier_hash = 123456789u128;

    println!("🧪 Testing build_swap_calldata with real Ekubo data");
    println!("📊 Input:");
    println!("  - Amount: 100000000000000000 (0.1 STRK)");
    println!("  - Swapping STRK → ETH");
    println!("  - Expected output: 15536039172203 wei ETH");

    let calldata = build_swap_calldata(
        &real_ekubo_response,
        input_token,
        Some(secret_and_nullifier_hash),
    )
    .expect("Failed to build calldata");

    println!("\n📝 Generated calldata:");
    println!("  Total elements: {}", calldata.len());
    for (i, element) in calldata.iter().enumerate() {
        println!("  [{}] {}", i, element);
    }
}

#[tokio::test]
async fn test_build_swap_calldata_with_large_ekubo_data() {
    // Dokładne dane z Ekubo API
    let real_ekubo_response = EkuboQuoteResponse {
        total_calculated: "471614311717323".to_string(),
        price_impact: -0.0025218467,
        splits: vec![
            EkuboSplit {
                amount_specified: "5000000000000000000".to_string(),
                amount_calculated: "235758300499845".to_string(),
                route: vec![
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x20c49ba5e353f80000000000000000".to_string(),
                            tick_spacing: 1000,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x503cf97aa8602cba70a30d6d756".to_string(),
                        skip_ahead: 0,
                    },
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x20c49ba5e353f80000000000000000".to_string(),
                            tick_spacing: 354892,
                            extension:
                                "0x43e4f09c32d13d43a880e85f69f7de93ceda62d6cf2581a582c6db635548fdc"
                                    .to_string(),
                        },
                        sqrt_ratio_limit: "0xd66374d559cec6aec510970e832971fd5abbdcedca1d16b1"
                            .to_string(),
                        skip_ahead: 0,
                    },
                ],
            },
            EkuboSplit {
                amount_specified: "2500000000000000000".to_string(),
                amount_calculated: "118023897898511".to_string(),
                route: vec![
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x20c49ba5e353f80000000000000000".to_string(),
                            tick_spacing: 1000,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x503cf281cbaec48aa2de25be176".to_string(),
                        skip_ahead: 0,
                    },
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x0".to_string(),
                            tick_spacing: 1,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x33c320355bd80fe2c42f7ee6baa44".to_string(),
                        skip_ahead: 4027,
                    },
                ],
            },
            EkuboSplit {
                amount_specified: "1250000000000000000".to_string(),
                amount_calculated: "58963483957917".to_string(),
                route: vec![
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x20c49ba5e353f80000000000000000".to_string(),
                            tick_spacing: 1000,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x503cef055dca62041d9f7083674".to_string(),
                        skip_ahead: 0,
                    },
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x68db8bac710cb4000000000000000".to_string(),
                            tick_spacing: 354892,
                            extension:
                                "0x43e4f09c32d13d43a880e85f69f7de93ceda62d6cf2581a582c6db635548fdc"
                                    .to_string(),
                        },
                        sqrt_ratio_limit: "0xd66374d559cec6aec510970e832971fd5abbdcedca1d16b1"
                            .to_string(),
                        skip_ahead: 0,
                    },
                ],
            },
            EkuboSplit {
                amount_specified: "625000000000000000".to_string(),
                amount_calculated: "29435627748397".to_string(),
                route: vec![
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x20c49ba5e353f80000000000000000".to_string(),
                            tick_spacing: 1000,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x503ced4726f54520c76679c45f0".to_string(),
                        skip_ahead: 0,
                    },
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x0".to_string(),
                            tick_spacing: 1003,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x3ab67d9a70710c8adf20c25600689".to_string(),
                        skip_ahead: 0,
                    },
                ],
            },
            EkuboSplit {
                amount_specified: "312500000000000000".to_string(),
                amount_calculated: "14719508072501".to_string(),
                route: vec![
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x20c49ba5e353f80000000000000000".to_string(),
                            tick_spacing: 1000,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x503cec680b91fbc689e37eb830f".to_string(),
                        skip_ahead: 0,
                    },
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x0".to_string(),
                            tick_spacing: 1,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x33c6752601b96930b4f78caf3f443".to_string(),
                        skip_ahead: 502,
                    },
                ],
            },
            EkuboSplit {
                amount_specified: "156250000000000000".to_string(),
                amount_calculated: "7357521935368".to_string(),
                route: vec![
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x20c49ba5e353f80000000000000000".to_string(),
                            tick_spacing: 1000,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x503cebf87de2285f34d8816a56d".to_string(),
                        skip_ahead: 0,
                    },
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x0".to_string(),
                            tick_spacing: 1003,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x3ab6f8fd87e01c5583264dffe799d".to_string(),
                        skip_ahead: 0,
                    },
                ],
            },
            EkuboSplit {
                amount_specified: "78125000000000000".to_string(),
                amount_calculated: "3678618265653".to_string(),
                route: vec![
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x20c49ba5e353f80000000000000000".to_string(),
                            tick_spacing: 1000,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x503cebc0b70ab2fcfa8ac8b4066".to_string(),
                        skip_ahead: 0,
                    },
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x0".to_string(),
                            tick_spacing: 1,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x33c74a60a59818ffab1a635fa6d25".to_string(),
                        skip_ahead: 125,
                    },
                ],
            },
            EkuboSplit {
                amount_specified: "78125000000000000".to_string(),
                amount_calculated: "3677353339131".to_string(),
                route: vec![
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x20c49ba5e353f80000000000000000".to_string(),
                            tick_spacing: 1000,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x503ceb88f0338b265f8c8047799".to_string(),
                        skip_ahead: 0,
                    },
                    EkuboRouteNode {
                        pool_key: EkuboPoolKey {
                            token0:
                                "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
                                    .to_string(),
                            token1:
                                "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
                                    .to_string(),
                            fee: "0x0".to_string(),
                            tick_spacing: 1003,
                            extension: "0x0".to_string(),
                        },
                        sqrt_ratio_limit: "0x3ab736a9caeaa8777adc562459f57".to_string(),
                        skip_ahead: 0,
                    },
                ],
            },
        ],
    };

    let input_token = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
    let secret_and_nullifier_hash = 123456789u128;

    println!("🧪 Testing build_swap_calldata with large Ekubo data");
    let calldata = build_swap_calldata(
        &real_ekubo_response,
        input_token,
        Some(secret_and_nullifier_hash),
    )
    .expect("Failed to build calldata");

    let arr_json = serde_json::to_string_pretty(&calldata).expect("failed to serialize calldata");
    println!("\n📝 calldata array as JSON:\n{}", arr_json);
}
