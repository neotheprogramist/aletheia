# Aletheia Frontend

This is a demo frontend application showcasing how to integrate the **Privacy Extension** with a smart contract that implements **Privacy Pools**-style logic using **zero-knowledge proofs (ZKPs)**.

The app demonstrates a practical implementation of private deposits and withdrawals on Starknet, while delegating all ZK proof generation to a lightweight browser **privacy-extension**.

## 💡 What is this?

The goal of this app is to show how a minimal frontend can:

- Integrate with a Chrome Extension (`Privacy Extension`) that acts as a ZK API provider.
- Interact with a privacy-preserving smart contract (`PrivacyPools` on Starknet).
- Offload all ZK-heavy operations (Poseidon hashing, proof generation) to the extension.
- Maintain clean separation of responsibilities between frontend, circuits, and proof engine.

In short: **Aletheia is a working prototype of a frontend ↔ ZK extension ↔ smart contract stack**.

Circuits and verifier contracts live outside this directory. Circuits are hosted (for example) in:

👉 [circuits-playground repo](https://github.com/Uacias/circuits-playground)

## 🔧 Requirements

- Node.js (tested with `23.11.0`)
- Chrome with the [Argent X wallet](https://www.argent.xyz/argent-x/) extension installed and set up
- Chrome with the [Aletheia Privacy Extension](https://chromewebstore.google.com/detail/dhillhiicoipmmpgohngknjpepmleepe?utm_source=item-share-cb) installed and set up
- Starknet Sepolia STRK (can be obtained from the [Starknet Faucet](https://starknet-faucet.vercel.app/))

> 🧪 If the Aletheia Privacy Extension is not yet available in the Chrome Web Store (latest version pending approval: `v1.1.0`), please contact the repository owner to obtain the `.zip` file.  
> Once received, unzip it and load it manually via `chrome://extensions → Enable dev mode → Load unpacked → Select build folder`.

### Argent Wallet setup

- Installed and set up [Argent X](https://www.argent.xyz/argent-x/) on Starknet Sepolia
- Obtained **Sepolia ETH** from the [Starknet Faucet](https://starknet-faucet.vercel.app/).

### Aletheia Privacy Extension setup

1. Install or load the extension into Chrome
2. Open the extension popup
3. Set a password to encrypt your ZK seed
4. Close the popup and reopen it
5. Unlock the extension using the password

That's it! The extension is now ready to handle private ZK operations from the frontend app.

---

## 🚀 Running Locally

Once the extension is ready, and you have:

- Installed and set up **Argent X**
- Obtained **testnet ETH** from the [Starknet Faucet](https://starknet-faucet.vercel.app/)

You can now start the frontend app:

Inside `cleint` directory create `.env` file and insert these envs

```
PUBLIC_TORNADO_CONTRACT_ADDRESS="0x0737c26de1579c8f93b539d68b7f74b12f68ce1fef682265e0b3ccc4cc73be39"
PUBLIC_STRK_TOKEN_ADDRESS="0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
PUBLIC_PRIVACY_API="https://privacypoolsstaging.visoft.dev"
```

```bash
git clone git@github.com:neotheprogramist/aletheia.git
cd aletheia
npm install
npm run dev
```

Then open your browser at:  
[http://localhost:5173](http://localhost:5173)

> ⚠️ Make sure both the **Aletheia Privacy Extension** and **Argent X** are installed, unlocked, and have access to localhost.

---

## 🧭 App Flow: How to Use

Once the app is running locally and both extensions are unlocked, here’s what you can do inside the Aletheia app:

### 1. Connect Your Wallet

- On the landing page, click the **Connect Wallet** button.
- This will connect your **Argent X** wallet to the app.
- After a successful connection, you'll be redirected to the **Deposit** page.

### 2. Make a Private Deposit

On the **Deposit** page, you can:

- Enter the **token address** (currently supported token is the Starknet native token — STARK).
- Enter the **amount** you want to deposit.

> ⚠️ Make sure your **Argent X** wallet on Starknet Sepolia has enough testnet ETH (STARK).  
> Otherwise, the deposit transaction will fail. You can top up using the [Starknet Faucet](https://starknet-faucet.vercel.app/).

- After submitting the deposit, your wallet will ask you to confirm the transaction.
- Once the transaction is accepted and **included in a block**, the deposit is complete.

> ⏳ Sometimes you may need to wait a few seconds for the deposit to be indexed before it's available for withdrawal.

### 3. Withdraw Anonymously

- Navigate to the **Withdraw** page.
- Select one of your previously confirmed deposits from the list.
- Enter the **recipient address** — the account you want to send the funds to.
- Enter the **withdrawal amount** (must be equal or less than the deposited amount).
- Confirm the operation — the extension will generate a ZK proof and the app will trigger a withdrawal transaction.

Once confirmed, your funds will be sent **privately** to the recipient address.

---

Happy experimenting with private onchain actions on Starknet! 🕵️‍♂️🧪

## 📄 License

MIT
