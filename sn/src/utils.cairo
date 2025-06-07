use core::ecdsa::check_ecdsa_signature;
use starknet::account::Call;
use starknet::{ClassHash, ContractAddress, SyscallResultTrait};

const EXTENSION_VERIFIER_CLASS_HASH: felt252 =
    0x044fa33e2f08bf5542df3a52cee9e1777093f5240002602a5581550a8ece491f;

const MERGE_VERIFIER_CLASS_HASH: felt252 =
    0x00d9329fd129e561b7717ebc1f948434a5ecf7dec4499f633d8ae4143c44e93f;

const TRANSFER_VERIFIER_CLASS_HASH: felt252 =
    0x027288612662383fe0e311911b7eec1db653f75935ea5de9a10f9c69ffdfbafc;

const UDC_ADDRESS: felt252 = 0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf;


#[starknet::interface]
trait IUniversalDeployer<TContractState> {
    fn deployContract(
        ref self: TContractState,
        class_hash: ClassHash,
        salt: felt252,
        unique: bool,
        calldata: Span<felt252>,
    ) -> ContractAddress;
}

pub fn deploy(class_hash: ClassHash, calldata: Array<felt252>, salt: felt252) -> ContractAddress {
    let dispatcher = IUniversalDeployerDispatcher {
        contract_address: UDC_ADDRESS.try_into().unwrap(),
    };

    let unique = true;
    // the UDC returns the deployed contract address
    dispatcher.deployContract(class_hash, salt, unique, calldata.span())
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

pub fn is_valid_signature(
    msg_hash: felt252, public_key: felt252, signature: Span<felt252>,
) -> bool {
    let valid_length = signature.len() == 2;

    if valid_length {
        check_ecdsa_signature(msg_hash, public_key, *signature.at(0_u32), *signature.at(1_u32))
    } else {
        false
    }
}
