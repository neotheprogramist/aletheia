mod extension_verifier;
mod merge_verifier;
mod merkle;
mod poseidon;
mod privacy_account;
pub mod swap_extension;
mod transfer_verifier;
mod utils;
mod vesu_borrow_extension;
mod vesu_data_model;
mod vesu_position;
pub mod withdraw_extension;
mod zk_extension;
use core::circuit::u384;
use poseidon::run_poseidon_grumpkin_circuit;
use starknet::SyscallResultTrait;

fn hash(a: u256, b: u256) -> u256 {
    let a: u384 = a.into();
    let b: u384 = b.into();
    run_poseidon_grumpkin_circuit(a, b).try_into().unwrap()
}

fn hash_one(a: u256) -> u256 {
    hash(a, a)
}

pub fn verify_ultra_keccak_honk_proof(
    verifier_class_hash: starknet::ClassHash, proof: Span<felt252>,
) -> Span<u256> {
    let mut output_serialized = starknet::syscalls::library_call_syscall(
        verifier_class_hash, selector!("verify_ultra_keccak_honk_proof"), proof,
    )
        .unwrap_syscall();
    let output = Serde::<Option<Span<u256>>>::deserialize(ref output_serialized).unwrap().unwrap();

    output
}

fn add(a: u32, b: u32) -> u32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::add;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }
}
