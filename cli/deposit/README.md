### Example run
```cmd
cargo run --bin deposit -- \
  --provider-url http://localhost:5050 \
  --contract-address 0x0144397bd342a5f92737ba85a6afdfed9139aac90049e37392b1708db0d9e51c \
  --secret-nullifier-hash 0x00000000C1AF16A123EE98FFB20C31F5CD61D6AB07201858F4287C938D \
  --account-private-key 0x71d7bb07b9a64f6f78ac4c816aff4da9 \
  --account-address 0x64b48806902a367c8598f4f95c305e8c1a1acba5f082d294a43793113115691 \
  --strk-address 0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D \
  --amount 0x5000000000000000
```