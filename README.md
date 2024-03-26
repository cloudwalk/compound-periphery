# Compound Periphery

<p align="center">
  <img src="./docs/media/brlc-cover.png">
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![example branch parameter](https://github.com/cloudwalk/compound-periphery/actions/workflows/build.yml/badge.svg?branch=main)
![example branch parameter](https://github.com/cloudwalk/compound-periphery/actions/workflows/test.yml/badge.svg?branch=main)

This repository contains [Compound protocol](https://github.com/cloudwalk/compound-protocol) periphery smart contracts.

## Project Setup
1. Clone the repo.
2. Create the `.env` file based on the `.env.example` one:
    * Windows:
    ```sh
    copy .env.example .env
    ```
    * MacOS/Linux:
    ```sh
    cp .env.example .env
    ```
3. Update settings in the newly created `.env` file if needed (e.g. another solidity version, number of optimization runs, private keys (PK) for networks, network RPC URLs, etc.).


## Build and test

```sh
# Install all dependencies
npm install

# Compile all contracts
npx hardhat compile

# Run all tests
npx hardhat test
```

## Networks and deployments

Information about deployed contracts across all the networks can be found [here](./docs/deployed-contracts.md).

## Licensing

This project is released under the MIT License, see [LICENSE](./LICENSE).
