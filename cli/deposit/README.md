### Example run
```cmd
cargo run --bin deposit -- \
  --provider-url http://localhost:5050 \
  --contract-address 0xd52d9c1810de33216b68273b9d73a62fed4b74ea86cb789c0c6e3d7fa20a3b \
  --secret-nullifier-hash 0xbfe4d17ce245856474e4e09e13897c0f0a952ea5da8837cbe300bee4a7a887d \
  --account-private-key 0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912 \
  --account-address 0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec \
  --token-address 0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D \
  --amount 0x4563918244f40000
```