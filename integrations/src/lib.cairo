mod poseidon;
mod merkle;
pub mod privacypools;


use starknet::class_hash::ClassHash;
use starknet::SyscallResultTrait;
use core::circuit::u384;
use poseidon::run_poseidon_grumpkin_circuit;

fn hash(a: u256, b: u256) -> u256 {
    let a: u384 = a.into();
    let b: u384 = b.into();
    run_poseidon_grumpkin_circuit(a, b).try_into().unwrap()
}

fn hash_one(a: u256) -> u256 {
    hash(a, a)
}

pub fn verify_ultra_keccak_honk_proof_call(
    verifier_class_hash: ClassHash, proof: Span<felt252>,
) -> Span<u256> {
    let mut output_serialized = core::starknet::syscalls::library_call_syscall(
        verifier_class_hash, selector!("verify_ultra_keccak_honk_proof"), proof,
    )
        .unwrap_syscall();
    let output = Serde::<Option<Span<u256>>>::deserialize(ref output_serialized).unwrap().unwrap();

    output
}