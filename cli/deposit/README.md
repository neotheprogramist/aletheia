### Example run
```cmd
cargo run --bin deposit -- \
  --provider-url http://localhost:5050 \
  --contract-address 0x2fa113718e111df4e32ea6e0235c501278f5d1199bcf2773134b1e738698e35 \
  --secret-nullifier-hash 0x00000000C1AF16A123EE98FFB20C31F5CD61D6AB07201858F4287C938D \
  --account-private-key 0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912 \
  --account-address 0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec \
  --token-address 0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D \
  --amount 0x5000000000000000
```