fn main(
    // first deposit data
    secret_1: Field,
    nullifier_1: pub Field,
    commitment_amount_1: Field,
    token_address_1: pub Field,
    hashpath_1: [Field; 31],
    index_1: Field,
    root_1: pub Field, // root 1/2 bcs root can change between get_proof_data requests
    // second deposit data
    secret_2: Field,
    nullifier_2: pub Field,
    commitment_amount_2: Field,
    token_address_2: Field,
    hashpath_2: [Field; 31],
    index_2: Field,
    root_2: pub Field, // root 1/2 bcs root can change between get_proof_data requests
    refund_secret_1: Field,
    refund_nullifier_1: Field,
    refund_amount_1: Field,
    refund_commitment_hash_1: pub Field,
    // gas fees
    gas_fee: pub Field,
    paymaster_fee: pub Field,
) {
    // token asserts
    assert(token_address_1 == token_address_2);
    let final_token_address = token_address_1; // final token address can be token_address_1 because is equal token_address_2 and merge can only be make from 2 the same tokens

    // amount asserts
    assert(refund_amount_1 == commitment_amount_1 + commitment_amount_2 - gas_fee - paymaster_fee);

    // first deposit checks
    let computed_secret_nullifier_hash_1 =
        std::hash::poseidon::bn254::hash_2([secret_1, nullifier_1]);
    let secret_nullifier_amount_hash_1 =
        std::hash::poseidon::bn254::hash_2([computed_secret_nullifier_hash_1, commitment_amount_1]);
    let deposit_1 =
        std::hash::poseidon::bn254::hash_2([secret_nullifier_amount_hash_1, token_address_1]);
    verify_membership(root_1, deposit_1, index_1, hashpath_1);

    // second deposit checks
    let computed_secret_nullifier_hash_2 =
        std::hash::poseidon::bn254::hash_2([secret_2, nullifier_2]);
    let secret_nullifier_amount_hash_2 =
        std::hash::poseidon::bn254::hash_2([computed_secret_nullifier_hash_2, commitment_amount_2]);
    let deposit_2 =
        std::hash::poseidon::bn254::hash_2([secret_nullifier_amount_hash_2, token_address_2]);
    verify_membership(root_2, deposit_2, index_2, hashpath_2);

    // cant merge 2 the same deposits
    assert(deposit_1 != deposit_2);

    // final merge deposit checks
    let computed_secret_nullifier_hash_final =
        std::hash::poseidon::bn254::hash_2([refund_secret_1, refund_nullifier_1]);
    let secret_nullifier_amount_hash_final =
        std::hash::poseidon::bn254::hash_2([computed_secret_nullifier_hash_final, refund_amount_1]);
    let final_computed_commitment = std::hash::poseidon::bn254::hash_2([
        secret_nullifier_amount_hash_final,
        final_token_address,
    ]);
    assert(refund_commitment_hash_1 == final_computed_commitment);
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
        current = std::hash::poseidon::bn254::hash_2([hash_left, hash_right]);
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
