# Example Run for Starknet Proving Circuit

This guide provides the steps to execute the proving circuit and submit the proof on Starknet.

### Prerequisites

Make sure you have the following dependencies installed:

```bash
noirup --version 1.0.0-beta.2
bbup --version 0.82.2
pip install garaga==0.16.0
```

### Setup and Execution

1. **Navigate to the circuit directory**:

   ```bash
   cd circuits
   cd withdraw
   ```

2. **Run nargo to check the prover**:

   ```bash
   nargo check
   ```

   - Fill in the required fields in the `Prover.toml` configuration file.

3. **Generate the witness file**:

   ```bash
   nargo execute witness
   ```

4. **Generate the proof file using bb**:

   ```bash
   bb prove_ultra_keccak_honk -b target/withdraw.json -w target/witness.gz -o target/proof.bin
   ```

5. **Generate verification key using bb**:

   ```bash
   bb write_vk_ultra_keccak_honk -b target/withdraw.json -o target/vk_withdraw.bin
   ```

6. **Generate calldata using Garaga**:

   ```bash
   garaga calldata --system ultra_keccak_honk --vk target/vk_withdraw.bin --proof target/proof.bin --format starkli > proof.txt
   ```

7. **Run the withdraw binary to submit the proof**:

   ```bash
   cargo run --bin withdraw -- \
     --provider-url http://localhost:5050 \
     --account-private-key 0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912 \
     --account-address 0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec \
     --contract-address 0xd52d9c1810de33216b68273b9d73a62fed4b74ea86cb789c0c6e3d7fa20a3b \
     --proof-path "circuits/withdraw/proof.txt" \
     --external-contract-address 0x37c28a1619395361998444f26c7bcea961390b38addde3d85ab50669510e557 \
     --receipient 0x13d9ee239f33fea4f8785b9e3870ade909e20a9599ae7cd62c1c292b73af1b7 \
     --token-address 0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D \
     --amount 0x4563918244f40000
   ```

### Notes:

- **Replace Contract Addresses:** Make sure to replace the contract addresses in the command with those that are deployed on the network you are working with.
  - `--contract-address`: The address of the smart contract you want to interact with.
  - `--external-contract-address`: The address of the external contract (if applicable).
  - `--receipient`: The recipient address for the transaction.
  - `--token-address`: The address of the token being transferred.
- **Proof Generation:**

  - The command `bb prove_ultra_keccak_honk` generates the proof file based on the circuit and witness.
  - The command `garaga calldata` generates the calldata, which includes the proof and verification key.

- **Custom Network:** If you're working with a custom network, replace `http://localhost:5050` with the appropriate provider URL.

---

### How to Save this README:

1. Copy the content above and save it to a file named `README.md`.
2. Make sure to update the `README.md` file with any necessary changes specific to your network setup or environment.
