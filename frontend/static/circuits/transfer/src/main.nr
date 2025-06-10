fn main(
    // Deposit Data
    root_1: pub Field, // 0
    secret_1: Field,
    nullifier_1: pub Field, // 1
    commitment_amount_1: Field,
    token_address_1: pub Field, //2
    hashpath_1: [Field; 31],
    index_1: Field,
    amount: pub Field, // 3
    // Fee deposit
    root_2: pub Field, // 4
    secret_2: Field,
    nullifier_2: pub Field, // 5
    commitment_amount_2: Field,
    token_address_2: pub Field, // 6
    hashpath_2: [Field; 31],
    index_2: Field,
    gas_fee: pub Field, // 7
    // refund data for deposit
    refund_secret_1: Field,
    refund_nullifier_1: Field,
    refund_amount_1: Field,
    refund_commitment_hash_1: pub Field, //8
    // refund data for fee deposit
    refund_secret_2: Field,
    refund_nullifier_2: Field,
    refund_amount_2: Field,
    refund_commitment_hash_2: pub Field, // 9
    _recipient_secret_and_nullifier_hash_1: pub Field, // 10
) {
    // Validate deposit
    assert(commitment_amount_1 == amount + refund_amount_1);
    let computed_secret_nullifier_hash = poseidon::poseidon::bn254::hash_2([secret_1, nullifier_1]);
    let secret_nullifier_amount_hash =
        poseidon::poseidon::bn254::hash_2([computed_secret_nullifier_hash, commitment_amount_1]);
    let leaf = poseidon::poseidon::bn254::hash_2([secret_nullifier_amount_hash, token_address_1]);
    verify_membership(root_1, leaf, index_1, hashpath_1);

    // Validate fee deposit
    let computed_secret_nullifier_hash_fee =
        poseidon::poseidon::bn254::hash_2([secret_2, nullifier_2]);
    assert(commitment_amount_2 == gas_fee + refund_amount_2);
    let secret_nullifier_amount_hash_fee = poseidon::poseidon::bn254::hash_2([
        computed_secret_nullifier_hash_fee,
        commitment_amount_2,
    ]);
    let leaf_fee =
        poseidon::poseidon::bn254::hash_2([secret_nullifier_amount_hash_fee, token_address_2]);
    verify_membership(root_2, leaf_fee, index_2, hashpath_2);

    // Make sure deposit != fee deposit
    assert(leaf != leaf_fee);

    // Validate new refund deposit
    let computed_secret_nullifier_hash_refund =
        poseidon::poseidon::bn254::hash_2([refund_secret_1, refund_nullifier_1]);
    let secret_nullifier_amount_hash_final =
        poseidon::poseidon::bn254::hash_2([computed_secret_nullifier_hash_refund, refund_amount_1]);
    let refund_computed_commitment =
        poseidon::poseidon::bn254::hash_2([secret_nullifier_amount_hash_final, token_address_1]);
    assert(refund_commitment_hash_1 == refund_computed_commitment);

    // Validate fee refund deposit
    let computed_secret_nullifier_hash_refund_fee =
        poseidon::poseidon::bn254::hash_2([refund_secret_2, refund_nullifier_2]);
    let secret_nullifier_amount_hash_final_fee = poseidon::poseidon::bn254::hash_2([
        computed_secret_nullifier_hash_refund_fee,
        refund_amount_2,
    ]);
    let refund_computed_commitment_fee = poseidon::poseidon::bn254::hash_2([
        secret_nullifier_amount_hash_final_fee,
        token_address_2,
    ]);
    assert(refund_commitment_hash_2 == refund_computed_commitment_fee);
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
