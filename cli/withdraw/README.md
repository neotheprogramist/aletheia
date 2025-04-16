### Example run

```cmd
cargo run --bin withdraw -- \
  --provider-url http://localhost:5050 \
  --account-private-key 0xc5b2fcab997346f3ea1c00b002ecf6f382c5f9c9659a3894eb783c5320f912 \
  --account-address 0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec \
  --contract-address 0x1d15ec531b87e17db361d6441505eb06f40c41a0fb75e90b2bb17fa41c1be4f \
  --proof-path "/home/piotrstec/dev/aletheia/calldata.json" \
  --external-contract-address 0x4c9bd44ce90b5b7ceb3230dcd9ddec1a15225e3befdb44550d5c849be0b4721 \
  --receipient 0x13d9ee239f33fea4f8785b9e3870ade909e20a9599ae7cd62c1c292b73af1b7 \
  --token-address 0x4718F5A0FC34CC1AF16A1CDEE98FFB20C31F5CD61D6AB07201858F4287C938D \
  --amount 0x1bc16d674ec80000
```
