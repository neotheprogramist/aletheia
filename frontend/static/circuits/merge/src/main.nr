fn main(
    // first deposit data
    secret_1: Field,
    nullifier_1: pub Field, // 0
    commitment_amount_1: Field,
    token_address_1: pub Field, // 1
    hashpath_1: [Field; 31],
    index_1: Field,
    root_1: pub Field, // root 1/2 bcs root can change between get_proof_data requests
    // second deposit data
    secret_2: Field,
    nullifier_2: pub Field, // 3
    commitment_amount_2: Field,
    token_address_2: Field,
    hashpath_2: [Field; 31],
    index_2: Field,
    root_2: pub Field, // root 1/2 bcs root can change between get_proof_data requests
    // Fee deposit
    secret_3: Field,
    nullifier_3: pub Field, //5
    commitment_amount_3: Field,
    token_address_3: pub Field, // 6
    hashpath_3: [Field; 31],
    index_3: Field,
    root_3: pub Field, // 7
    gas_fee: pub Field, //8
    // Refund fee deposit
    refund_secret_1: Field,
    refund_nullifier_1: Field,
    refund_amount_1: Field,
    refund_commitment_hash_1: pub Field, //9
    // New deposit after merge
    refund_secret_2: Field,
    refund_nullifier_2: Field,
    refund_amount_2: Field,
    refund_commitment_hash_2: pub Field, // 10
) {
    // token asserts -> checking if fee_token == STRK is in the contract
    assert(token_address_1 == token_address_2);
    let final_token_address = token_address_1; // final token address can be token_address_1 because is equal token_address_2 and merge can only be make from 2 the same tokens

    // amount asserts
    // Check fee
    assert(refund_amount_1 == commitment_amount_3 - gas_fee);
    // Check merge
    assert(refund_amount_2 == commitment_amount_1 + commitment_amount_2);

    // first deposit checks
    let computed_secret_nullifier_hash_1 =
        poseidon::poseidon::bn254::hash_2([secret_1, nullifier_1]);
    let secret_nullifier_amount_hash_1 =
        poseidon::poseidon::bn254::hash_2([computed_secret_nullifier_hash_1, commitment_amount_1]);
    let deposit_1 =
        poseidon::poseidon::bn254::hash_2([secret_nullifier_amount_hash_1, token_address_1]);
    verify_membership(root_1, deposit_1, index_1, hashpath_1);

    // second deposit checks
    let computed_secret_nullifier_hash_2 =
        poseidon::poseidon::bn254::hash_2([secret_2, nullifier_2]);
    let secret_nullifier_amount_hash_2 =
        poseidon::poseidon::bn254::hash_2([computed_secret_nullifier_hash_2, commitment_amount_2]);
    let deposit_2 =
        poseidon::poseidon::bn254::hash_2([secret_nullifier_amount_hash_2, token_address_2]);
    verify_membership(root_2, deposit_2, index_2, hashpath_2);

    // cant merge 2 the same deposits
    assert(deposit_1 != deposit_2);

    // Fee deposit check
    let computed_secret_nullifier_hash_3 =
        poseidon::poseidon::bn254::hash_2([secret_3, nullifier_3]);
    let secret_nullifier_amount_hash_3 =
        poseidon::poseidon::bn254::hash_2([computed_secret_nullifier_hash_3, commitment_amount_3]);
    let deposit_3 =
        poseidon::poseidon::bn254::hash_2([secret_nullifier_amount_hash_3, token_address_3]);
    verify_membership(root_3, deposit_3, index_3, hashpath_3);

    // Refund fee deposit check
    let computed_secret_nullifier_hash_final =
        poseidon::poseidon::bn254::hash_2([refund_secret_1, refund_nullifier_1]);
    let secret_nullifier_amount_hash_final =
        poseidon::poseidon::bn254::hash_2([computed_secret_nullifier_hash_final, refund_amount_1]);
    let final_computed_commitment =
        poseidon::poseidon::bn254::hash_2([secret_nullifier_amount_hash_final, token_address_3]);
    assert(refund_commitment_hash_1 == final_computed_commitment);

    // Merged deposits check
    let computed_secret_nullifier_hash_final2 =
        poseidon::poseidon::bn254::hash_2([refund_secret_2, refund_nullifier_2]);
    let secret_nullifier_amount_hash_final2 =
        poseidon::poseidon::bn254::hash_2([computed_secret_nullifier_hash_final2, refund_amount_2]);
    let final_computed_commitment2 = poseidon::poseidon::bn254::hash_2([
        secret_nullifier_amount_hash_final2,
        final_token_address,
    ]);
    assert(refund_commitment_hash_2 == final_computed_commitment2);
}

pub fn compute_merkle_root<let N: u32>(leaf: Field, index: Field, hash_path: [Field; N]) -> Field {
    let index_bits: [u1; N] = index.to_le_bits();
    let mut current = leaf;
    for i in 0..N {
        let path_bit = index_bits[i] as bool;
        let (hash_left, hash_right) = if path_bit {
            (hash_path[i], current)
        } else {
            (current, hash_path[i])
        };
        current = poseidon::poseidon::bn254::hash_2([hash_left, hash_right]);
    }
    current
}

pub fn verify_membership<let N: u32>(
    root: Field,
    leaf: Field,
    index: Field,
    hash_path: [Field; N],
) {
    let computed_root = compute_merkle_root(leaf, index, hash_path);
    assert(computed_root == root);
}
