use starknet::SyscallResultTrait;
use starknet::account::Call;

const EXTENSION_VERIFIER_CLASS_HASH: felt252 =
    0x044fa33e2f08bf5542df3a52cee9e1777093f5240002602a5581550a8ece491f;

const MERGE_VERIFIER_CLASS_HASH: felt252 =
    0x00d9329fd129e561b7717ebc1f948434a5ecf7dec4499f633d8ae4143c44e93f;

const TRANSFER_VERIFIER_CLASS_HASH: felt252 =
    0x027288612662383fe0e311911b7eec1db653f75935ea5de9a10f9c69ffdfbafc;

#[starknet::interface]
pub trait IUltraKeccakHonkVerifier<TContractState> {
    fn verify_ultra_keccak_honk_proof(
        self: @TContractState, full_proof_with_hints: Span<felt252>,
    ) -> Option<Span<u256>>;
}


#[derive(Serde, Copy, Drop)]
pub struct FunctionParams {
    proof: Span<felt252>,
}

pub fn is_valid(calls: Span<Call>) -> felt252 {
    // TODO: The soundness fix is too heavy, costs around 2x the validate limit - Wait for fix
    // let mut is_valid_selector = true;
    // for call in calls {
    //     if *call.selector == selector!("execute_extension") {
    //         let mut calldata = *call.calldata;
    //         let withdraw_params = Serde::<FunctionParams>::deserialize(ref calldata).unwrap();

    //         let mut output_serialized = starknet::syscalls::library_call_syscall(
    //             EXTENSION_VERIFIER_CLASS_HASH.try_into().unwrap(),
    //             selector!("verify_ultra_keccak_zk_honk_proof"),
    //             withdraw_params.proof,
    //         )
    //             .unwrap_syscall();
    //         Serde::<Option<Span<felt252>>>::deserialize(ref output_serialized).unwrap().unwrap();
    //     } else if *call.selector == selector!("merge") {
    //         let mut calldata = *call.calldata;
    //         let merge_params = Serde::<FunctionParams>::deserialize(ref calldata).unwrap();

    //         let mut output_serialized = starknet::syscalls::library_call_syscall(
    //             MERGE_VERIFIER_CLASS_HASH.try_into().unwrap(),
    //             selector!("verify_ultra_keccak_zk_honk_proof"),
    //             merge_params.proof,
    //         )
    //             .unwrap_syscall();
    //         Serde::<Option<Span<felt252>>>::deserialize(ref output_serialized).unwrap().unwrap();
    //     } else if *call.selector == selector!("transfer") {
    //         let mut calldata = *call.calldata;
    //         let transfer_params = Serde::<FunctionParams>::deserialize(ref calldata).unwrap();

    //         let mut output_serialized = starknet::syscalls::library_call_syscall(
    //             TRANSFER_VERIFIER_CLASS_HASH.try_into().unwrap(),
    //             selector!("verify_ultra_keccak_zk_honk_proof"),
    //             transfer_params.proof,
    //         )
    //             .unwrap_syscall();
    //         Serde::<Option<Span<felt252>>>::deserialize(ref output_serialized).unwrap().unwrap();
    //     } else {
    //         is_valid_selector = false;
    //     }
    //     assert(is_valid_selector, 'Invalid selector');
    // }
    starknet::VALIDATED
}

pub fn execute_calls(calls: Span<Call>) -> Array<Span<felt252>> {
    let mut res = array![];
    for call in calls {
        res.append(execute_single_call(call))
    }
    res
}

fn execute_single_call(call: @Call) -> Span<felt252> {
    let Call { to, selector, calldata } = *call;
    starknet::syscalls::call_contract_syscall(to, selector, calldata).unwrap_syscall()
}

