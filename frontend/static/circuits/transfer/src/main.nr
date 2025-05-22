fn main(
    // Deposit Data
    root_1: pub Field,
    secret_1: Field,
    nullifier_1: pub Field,
    commitment_amount_1: Field,
    token_address_1: pub Field,
    hashpath_1: [Field; 31],
    index_1: Field,
    amount: pub Field,
    // Refund Data
    refund_secret_1: Field,
    refund_nullifier_1: Field,
    refund_amount_1: Field,
    refund_commitment_hash_1: pub Field,
    _recipient_secret_and_nullifier_hash_1: pub Field,
    gas_fee: pub Field,
    paymaster_fee: pub Field,
) {
    assert(amount == commitment_amount_1 - refund_amount_1 - gas_fee - paymaster_fee);

    let computed_secret_and_nullifier_hash =
        std::hash::poseidon::bn254::hash_2([secret_1, nullifier_1]);
    let secret_nullifier_amount_hash = std::hash::poseidon::bn254::hash_2([
        computed_secret_and_nullifier_hash,
        commitment_amount_1,
    ]);
    let leaf = std::hash::poseidon::bn254::hash_2([secret_nullifier_amount_hash, token_address_1]);
    verify_membership(root_1, leaf, index_1, hashpath_1);

    // Refund deposit checks
    let computed_secret_nullifier_hash_refund =
        std::hash::poseidon::bn254::hash_2([refund_secret_1, refund_nullifier_1]);
    let secret_nullifier_amount_hash_final = std::hash::poseidon::bn254::hash_2([
        computed_secret_nullifier_hash_refund,
        refund_amount_1,
    ]);
    let refund_computed_commitment =
        std::hash::poseidon::bn254::hash_2([secret_nullifier_amount_hash_final, token_address_1]);
    println(refund_computed_commitment);
    assert(refund_commitment_hash_1 == refund_computed_commitment);
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
