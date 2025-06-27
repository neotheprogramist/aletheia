use cainome::cairo_serde::U256;

use crate::hash;

/// Generates a vector of precomputed "null" hashes as Felt values for the given tree height.
/// Here we use a custom base value (which can be set to Felt::ZERO if desired).
pub fn precomputed_hashes(height: usize) -> Vec<U256> {
    let mut hashes = Vec::with_capacity(height);
    let base = hash::hash(U256::ZERO, U256::ZERO);
    hashes.push(base);
    let mut current = base;
    for _ in 1..height {
        current = hash::hash(current, current);
        hashes.push(current);
    }
    hashes
}

// This is used in testing
/// Simulates the Noir circuit function to compute the Merkle root from a leaf and its proof.
#[allow(dead_code)]
pub fn compute_merkle_root_rust(leaf: U256, mut index: u32, hash_path: &[U256]) -> U256 {
    let mut current = leaf;
    for sibling in hash_path {
        if index % 2 == 1 {
            current = hash::hash(*sibling, current);
        } else {
            current = hash::hash(current, *sibling);
        }
        index /= 2;
    }
    current
}
