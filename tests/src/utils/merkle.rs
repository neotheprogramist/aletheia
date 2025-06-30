use cainome::cairo_serde::U256;
use hash::hash;

use crate::{hash, utils::helpers::precomputed_hashes};

/// HybridMerkleTree builds the tree dynamically only for added leaves.
#[derive(Debug, Clone)]
pub struct HybridMerkleTree {
    height: usize,
    precomputed: Vec<U256>,
    left_path: Vec<U256>,
    layers: Vec<Vec<U256>>, // Each layer stores computed hashes.
    free_index: usize,      // Number of leaves added.
    leafs: Vec<U256>,
}

impl HybridMerkleTree {
    pub fn get_leafs(&self) -> &Vec<U256> {
        &self.leafs
    }

    pub fn get_layer0(&self) -> &Vec<U256> {
        &self.layers[0]
    }

    pub fn new(leafs: Option<Vec<U256>>, height: usize) -> Self {
        let precomputed = precomputed_hashes(height);
        let left_path = precomputed.clone();
        let layers = vec![Vec::new(); height];
        let mut tree = Self {
            height,
            precomputed,
            left_path,
            layers,
            free_index: 0,
            leafs: Vec::new(),
        };
        match leafs {
            Some(leafs) => {
                for leaf in leafs {
                    tree.add_leaf(&leaf);
                }
            }
            None => {}
        }
        tree
    }

    /// Adds a new leaf and updates only the affected path to the root.
    pub fn add_leaf(&mut self, leaf: &U256) {
        match self.leafs.contains(leaf) {
            false => {
                let mut hash_val = *leaf;
                let mut index = self.free_index;
                self.free_index += 1;

                // Add the leaf to layer 0.
                self.layers[0].push(*leaf);

                // Compute parent hashes up the tree.
                for i in 1..self.height {
                    if index % 2 == 0 {
                        // For an even index, combine with the precomputed null value.
                        let combined = hash(hash_val, self.precomputed[i - 1]);
                        self.left_path[i - 1] = hash_val;
                        hash_val = combined;
                    } else {
                        // For an odd index, combine with the left sibling from left_path.
                        hash_val = hash(self.left_path[i - 1], hash_val);
                    }
                    index /= 2;
                    if self.layers[i].len() > index {
                        self.layers[i][index] = hash_val;
                    } else {
                        self.layers[i].push(hash_val);
                    }
                }
                self.left_path[self.height - 1] = hash_val;
                self.leafs.push(*leaf);
            }
            true => (),
        }
    }

    /// Returns the current tree root.
    pub fn root(&self) -> U256 {
        self.left_path[self.height - 1]
    }

    /// Generates a proof (sibling hashes and side indicators) for a given leaf index.
    /// The proof is returned as a tuple: (vector of sibling hashes, vector of booleans indicating if the sibling is on the right).
    pub fn path(&self, mut index: usize) -> (Vec<U256>, Vec<bool>) {
        if index >= self.layers[0].len() {
            panic!("Leaf does not exist!");
        }
        let mut elements = Vec::new();
        let mut indices = Vec::new();
        // For each level (except the root level), retrieve the sibling from the corresponding layer.
        for i in 0..(self.height - 1) {
            let is_right = index % 2 == 1;
            let sibling = if is_right {
                // For a right child, the sibling is at index-1 in the same layer.
                self.layers[i][index - 1]
            } else {
                // For a left child, if the right sibling exists, use it; otherwise, use the precomputed null value.
                if index + 1 < self.layers[i].len() {
                    self.layers[i][index + 1]
                } else {
                    self.precomputed[i]
                }
            };
            elements.push(sibling);
            indices.push(is_right);
            index /= 2;
        }
        (elements, indices)
    }

    pub fn find_leaf_index(&self, leaf: &U256) -> Option<usize> {
        self.layers[0]
            .iter()
            .enumerate()
            .filter(|(_, f)| *f == leaf)
            .map(|(i, _)| i)
            .next()
    }
}

// #[cfg(test)]
// mod tests {
//     use super::*;
//     use crate::utils::helpers::{compute_merkle_root_rust, precomputed_hashes};

//     #[test]
//     fn test_hybrid_merkle_tree_root() {
//         let mut tree = HybridMerkleTree::new(None, 3); // 3 levels for 4 leaves
//         let leaf0 = U256::from(1u32);
//         let leaf1 = U256::from(2u32);
//         let leaf2 = U256::from(3u32);
//         let leaf3 = U256::from(4u32);
//         tree.add_leaf(&leaf0);
//         tree.add_leaf(&leaf1);
//         tree.add_leaf(&leaf2);
//         tree.add_leaf(&leaf3);

//         let root = tree.root();
//         assert_ne!(
//             root,
//             precomputed_hashes(3)[2],
//             "Root should not be the default null value"
//         );
//     }

//     #[test]
//     fn test_compute_merkle_root_rust_simulation() {
//         let height = 3;
//         let mut tree = HybridMerkleTree::new(None, height);
//         let leaf0 = U256::from(1u32);
//         let leaf1 = U256::from(2u32);
//         let leaf2 = U256::from(3u32);
//         let leaf3 = U256::from(4u32);
//         tree.add_leaf(&leaf0);
//         tree.add_leaf(&leaf1);
//         tree.add_leaf(&leaf2);
//         tree.add_leaf(&leaf3);

//         let index = 0u32;
//         let (proof, _bits) = tree.path(index as usize);
//         let computed_root = compute_merkle_root_rust(leaf0.clone(), index, &proof);
//         let tree_root = tree.root();
//         assert_eq!(
//             computed_root, tree_root,
//             "Computed root from proof does not match tree root"
//         );
//     }

//     #[test]
//     fn test_high_depth_tree_memory() {
//         let height = 32;
//         let mut tree = HybridMerkleTree::new(None, height);
//         let num_leaves = 100;
//         for i in 0..num_leaves {
//             tree.add_leaf(&U256::from(i as u32));
//         }
//         assert_eq!(tree.layers[0].len(), num_leaves);
//         for (i, layer) in tree.layers.iter().enumerate() {
//             let expected_max = ((num_leaves as f64) / (2.0f64.powi(i as i32))).ceil() as usize;
//             assert!(
//                 layer.len() <= expected_max,
//                 "Layer {} has {} elements, expected at most {}",
//                 i,
//                 layer.len(),
//                 expected_max
//             );
//         }
//         assert_ne!(
//             tree.root(),
//             tree.precomputed[height - 1],
//             "Root should not be the default null value"
//         );
//     }

//     #[test]
//     fn test_compute_merkle_root_high_depth() {
//         let height = 32;
//         let mut tree = HybridMerkleTree::new(None, height);
//         let leaves: Vec<U256> = (0..10).map(|i| U256::from(i as u32 + 1)).collect();
//         for leaf in &leaves {
//             tree.add_leaf(leaf);
//         }
//         let index = 0u32;
//         let (proof, _bits) = tree.path(index as usize);
//         let computed_root = compute_merkle_root_rust(leaves[0].clone(), index, &proof);
//         let tree_root = tree.root();
//         assert_eq!(
//             computed_root, tree_root,
//             "Computed root from proof does not match tree root for high depth tree"
//         );
//     }

//     #[test]
//     #[should_panic(expected = "Leaf does not exist!")]
//     fn test_path_for_nonexistent_leaf() {
//         let tree = HybridMerkleTree::new(None, 3);
//         let _ = tree.path(0);
//     }

//     #[test]
//     fn test_single_leaf_tree() {
//         let mut tree = HybridMerkleTree::new(None, 3);
//         let leaf = U256::from(42u32);
//         tree.add_leaf(&leaf);
//         let root = tree.root();
//         assert_ne!(
//             root, tree.precomputed[2],
//             "Root for single leaf should not be the default null value"
//         );
//     }

//     #[test]
//     fn test_path_consistency() {
//         let mut tree = HybridMerkleTree::new(None, 3);
//         let leaf0 = U256::from(1u32);
//         let leaf1 = U256::from(2u32);
//         tree.add_leaf(&leaf0);
//         tree.add_leaf(&leaf1);
//         let leaf0_index = tree.find_leaf_index(&leaf0).unwrap();
//         let leaf1_index = tree.find_leaf_index(&leaf1).unwrap();

//         let (proof0, bits0) = tree.path(leaf0_index);
//         let (proof1, bits1) = tree.path(leaf1_index);
//         assert_ne!(proof0, proof1, "Proofs for different leaves should differ");
//         assert_ne!(
//             bits0, bits1,
//             "Proof bit patterns for different leaves should differ"
//         );
//     }
// }
