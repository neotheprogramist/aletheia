### Example run

```cmd
cargo run --bin deposit -- \
  --provider-url http://localhost:5050 \
  --contract-address 0x49bd7fef51024140b95885e7b64f947ba411a4107cc04d737e235974d5b76e7 \
  --secret-nullifier-hash 0xbfe4d17ce245856474e4e09e13897c0f0a952ea5da8837cbe300bee4a7a887d \
  --account-private-key 0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912 \
  --account-address 0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec \
  --token-address 0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D \
  --amount 0x4563918244f40000
```

### Notes:

- **Replace Contract Addresses:** Make sure to replace the contract addresses in the command with those that are deployed on the network you are working with.
  - `--contract-address`: The address of the smart contract you want to interact with.
