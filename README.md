# Vecnopool-payment

This app is used together with [Vecnopool](https://github.com/Vecno-Foundation/vecnopool "Vecnopool App"), it pays out rewards for mining.

## Installation

- Checkout repository and `cd` to the folder
- Run `bun install`

## Docker

Build docker image, by running

```
docker build -t vecnopool-payment .
```

Run the docker by

```
docker run vecnopool-payment
```

## Usage

1. Create a pool wallet using the latest [WASM](https://github.com/Vecno-Foundation/vecnod/releases "WASM") release. Follow the instructions.
2. Edit config\config.json if needed.
3. Create a .env file and copy content of the .env.example. Enter your own configs. Make sure to enter the correct privatekey that was printed when creating the pool wallet.

To start the payment app, simply run

```commandline
bun run index.ts
```

This will start the payment app. Default payment interval
