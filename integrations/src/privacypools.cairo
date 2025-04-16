use starknet::ContractAddress;

#[starknet::interface]
pub trait IPrivacyPools<TContractState> {
    fn deposit(
        ref self: TContractState,
        secret_and_nullifier_hash: u256,
        amount: u256,
        token_address: ContractAddress,
    ) -> bool;
    fn execute(
        ref self: TContractState,
        proof: Span<felt252>,
        external_contract_address: ContractAddress,
        calldata: Span<felt252>,
    ) -> bool;
    fn current_root(self: @TContractState) -> u256;
}

#[derive(Drop)]
struct PublicInputWithdraw {
    root: u256,
    token_address: ContractAddress,
    nullifier_hash: u256,
    amount: u256,
    refund_commitment_hash: u256,
    recipient: ContractAddress,
}

#[generate_trait]
impl PublicInputWithdrawImpl of PublicInputWithdrawTrait {
    fn from_u256_span(span: Span<u256>) -> PublicInputWithdraw {
        let token_address: felt252 = (*span[2]).try_into().unwrap();
        let recipient: felt252 = (*span[5]).try_into().unwrap();

        PublicInputWithdraw {
            root: *span[0],
            nullifier_hash: *span[1],
            recipient: recipient.try_into().unwrap(),
            refund_commitment_hash: *span[4],
            amount: *span[3],
            token_address: token_address.try_into().unwrap(),
        }
    }
}

#[starknet::contract]
pub mod PrivacyPools {
    const WITHDRAW_VERIFIER_CLASS_HASH: felt252 =
        0x6ba729580701d81e463f293d0106e94a4a2ed662ae2c04a8310bc9dff165236;

    use starknet::storage::StoragePointerWriteAccess;
    use starknet::storage::StoragePathEntry;
    use starknet::storage::StorageMapReadAccess;
    use starknet::storage::StoragePointerReadAccess;
    use crate::{hash, verify_ultra_keccak_honk_proof_call};
    use crate::merkle::{MerkleTreeComponent, MerkleTreeComponent::InternalTrait};
    use super::{PublicInputWithdrawImpl};
    use openzeppelin::{
        access::ownable::OwnableComponent,
        token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait},
    };
    use crate::zk_extension::{IZkExtensionDispatcher, IZkExtensionDispatcherTrait};
    use starknet::{
        ContractAddress, get_caller_address, get_contract_address, event::EventEmitter,
        storage::{Map},
    };

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: MerkleTreeComponent, storage: merkle, event: MerkleEvent);

    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;

    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        pub nullifier_hashes: Map<u256, bool>,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        merkle: MerkleTreeComponent::Storage,
        deposits: u256,
    }

    #[event]
    #[derive(Drop, PartialEq, starknet::Event)]
    enum Event {
        Deposit: Deposit,
        Execute: Execute,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        MerkleEvent: MerkleTreeComponent::Event,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    pub struct Deposit {
        #[key]
        pub caller: ContractAddress,
        pub deposit_commitment_hash: u256,
    }

    #[derive(Drop, PartialEq, starknet::Event)]
    pub struct Execute {
        #[key]
        pub caller: ContractAddress,
        #[key]
        pub recipient: ContractAddress,
        pub amount: u256,
        pub token_address: ContractAddress,
        pub refund_commitment_hash: u256,
    }

    pub mod Errors {
        pub const INVALID_PROOF: felt252 = 'Pool: invalid proof';
        pub const NULLIFIER_ALREADY_USED: felt252 = 'Pool: nullifier already used';
        pub const INVALID_ROOT: felt252 = 'Pool: invalid root';
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
        self.merkle.initializer();
    }

    #[abi(embed_v0)]
    impl PrivacyPools of super::IPrivacyPools<ContractState> {
        fn deposit(
            ref self: ContractState,
            secret_and_nullifier_hash: u256,
            amount: u256,
            token_address: ContractAddress,
        ) -> bool {
            let secret_nullifier_amount_hash = hash(secret_and_nullifier_hash, amount);
            let token_felt: felt252 = token_address.into();
            let token_u256: u256 = token_felt.into();
            let deposit_commitment_hash = hash(secret_nullifier_amount_hash, token_u256);
            self.merkle.add_leaf(deposit_commitment_hash);
            let caller = get_caller_address();
            let this = get_contract_address();
            let token = IERC20Dispatcher { contract_address: token_address };
            token.transfer_from(caller, this, amount.into());
            self.emit(Deposit { caller, deposit_commitment_hash });

            true
        }

        fn execute(
            ref self: ContractState,
            proof: Span<felt252>,
            external_contract_address: ContractAddress,
            calldata: Span<felt252>,
        ) -> bool {
            let public_input_serialized = verify_ultra_keccak_honk_proof_call(
                WITHDRAW_VERIFIER_CLASS_HASH.try_into().unwrap(), proof,
            );

            let public_input = PublicInputWithdrawImpl::from_u256_span(public_input_serialized);

            assert(
                self.nullifier_hashes.read(public_input.nullifier_hash) == false,
                Errors::NULLIFIER_ALREADY_USED,
            );
            self.nullifier_hashes.entry(public_input.nullifier_hash).write(true);

            assert(self.merkle.roots.read(public_input.root) == true, Errors::INVALID_ROOT);

            let token = IERC20Dispatcher { contract_address: public_input.token_address };

            token.approve(external_contract_address, public_input.amount);

            let external_contract = IZkExtensionDispatcher {
                contract_address: external_contract_address,
            };
            external_contract.execute(calldata);

            token.approve(external_contract_address, 0);

            self.merkle.add_leaf(public_input.refund_commitment_hash);

            let caller = get_caller_address();
            self
                .emit(
                    Execute {
                        caller,
                        recipient: public_input.recipient,
                        amount: public_input.amount,
                        token_address: public_input.token_address,
                        refund_commitment_hash: public_input.refund_commitment_hash,
                    },
                );

            true
        }

        fn current_root(self: @ContractState) -> u256 {
            self.merkle.root.read()
        }
    }
}
