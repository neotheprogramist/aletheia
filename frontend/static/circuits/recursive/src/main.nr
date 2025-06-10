global HONK_VK_SIZE: u32 = 112;
global HONK_PROOF_SIZE: u32 = 456;
global HONK_IDENTIFIER: u32 = 1;
fn main(
    proof: [Field; HONK_PROOF_SIZE],
    public_inputs: pub [Field; 11],
    verification_key: pub [Field; HONK_VK_SIZE],
) {
    std::verify_proof_with_type(verification_key, proof, public_inputs, 0x0, HONK_IDENTIFIER);
}
