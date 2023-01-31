import { ethers, network, upgrades } from "hardhat";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { proveTx } from "../test-utils/eth";

interface HelperContracts {
  comptroller: Contract,
  cToken: Contract,
  uToken: Contract
}

interface AllContracts {
  agent: Contract,
  comptroller: Contract,
  cToken: Contract,
  uToken: Contract
}

async function setUpFixture(func: any) {
  if (network.name === "hardhat") {
    return loadFixture(func);
  } else {
    return func();
  }
}

describe("Contract 'CompoundAgent'", function () {
  const TOKEN_AMOUNT_STUB = 123;
  const BORROWER_ADDRESS_STUB = "0x0000000000000000000000000000000000000001";

  const MARKET_MINT_FUNCTION_BAD_RESULT = 12301;
  const MARKET_REDEEM_FUNCTION_BAR_RESULT = 12302;
  const MARKET_REDEEM_UNDERLYING_BAD_RESULT = 12303;
  const MARKET_REPAY_BORROW_BEHALF_BAD_RESULT = 12304;
  const COMPTROLLER_ENTER_MARKET_BAD_RESULT = 12305;

  const BORROW_IS_DEFAULTED = true;
  const BORROW_IS_NOT_DEFAULTED = false;

  const EVENT_NAME_CONFIGURE_ADMIN = "ConfigureAdmin";
  const EVENT_NAME_ENTER_MARKETS = "EnterMarkets";
  const EVENT_NAME_MINT_ON_DEBT_COLLECTION = "MintOnDebtCollection";
  const EVENT_NAME_OWNERSHIP_TRANSFERRED = "OwnershipTransferred";
  const EVENT_NAME_REPAY_TRUSTED_BORROW = "RepayTrustedBorrow";
  const EVENT_NAME_REPAY_DEFAULTED_BORROW = "RepayDefaultedBorrow";
  const EVENT_NAME_SET_MINT_ON_DEBT_COLLECTION_CAP = "SetMintOnDebtCollectionCap";

  const EVENT_NAME_MOCK_BORROW_BALANCE_CURRENT = "CTokenMockBorrowBalanceCurrent";
  const EVENT_NAME_MOCK_MINT_C_TOKEN = "CTokenMockMint";
  const EVENT_NAME_MOCK_REDEEM = "CTokenMockRedeem";
  const EVENT_NAME_MOCK_REDEEM_UNDERLYING = "CTokenMockRedeemUnderlying";
  const EVENT_NAME_MOCK_REPAY_BORROW_BEHALF = "CTokenMockRepayBorrowBehalf";

  const EVENT_NAME_MOCK_MINT = "ERC20MockMint";
  const EVENT_NAME_MOCK_BURN = "ERC20MockBurn";

  const REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER = "Ownable: caller is not the owner";
  const REVERT_MESSAGE_IF_CONTRACT_IS_ALREADY_INITIALIZED = "Initializable: contract is already initialized";
  const REVERT_MESSAGE_IF_CONTRACT_IS_PAUSED = "Pausable: paused";
  const REVERT_MESSAGE_IF_NEW_OWNER_IS_ZERO = "Ownable: new owner is the zero address";

  const REVERT_ERROR_IF_ADMIN_IS_ALREADY_CONFIGURED = "AdminAlreadyConfigured";
  const REVERT_ERROR_IF_ADMIN_IS_UNAUTHORIZED = "UnauthorizedAdmin";
  const REVERT_ERROR_IF_COMPOUND_COMPTROLLER_FAILURE = "CompoundComptrollerFailure";
  const REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE = "CompoundMarketFailure";
  const REVERT_ERROR_IF_INPUT_ARRAYS_LENGTH_MISMATCH = "InputArraysLengthMismatch";
  const REVERT_ERROR_IF_MINT_FAILURE = "MintFailure";
  const REVERT_ERROR_IF_MINT_ON_DEBT_COLLECTION_CAP_EXCESS = "MintOnDebtCollectionCapExcess";
  const REVERT_ERROR_IF_MINT_ON_DEBT_COLLECTION_CAP_UNCHANGED = "MintOnDebtCollectionCapUnchanged";
  const REVERT_ERROR_IF_OWNER_IS_UNCHANGED = "OwnerUnchanged";

  let agentFactory: ContractFactory;
  let comptrollerFactory: ContractFactory;
  let cTokenFactory: ContractFactory;
  let uTokenFactory: ContractFactory;

  let deployer: SignerWithAddress;
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let stranger: SignerWithAddress;

  before(async () => {
    [deployer, admin, user, stranger] = await ethers.getSigners();
    agentFactory = await ethers.getContractFactory("CompoundAgent");
    comptrollerFactory = await ethers.getContractFactory("ComptrollerMock");
    cTokenFactory = await ethers.getContractFactory("CTokenMock");
    uTokenFactory = await ethers.getContractFactory("ERC20MintableMock");
  });

  async function deployHelperContracts(): Promise<HelperContracts> {
    const uToken = await uTokenFactory.deploy("ERC20 Test", "TEST");
    await uToken.deployed();

    const comptroller = await comptrollerFactory.deploy();
    await comptroller.deployed();

    const cToken = await cTokenFactory.deploy(comptroller.address, uToken.address);
    await cToken.deployed();

    return {
      comptroller,
      cToken,
      uToken,
    };
  }

  async function deployAllContracts(): Promise<AllContracts> {
    const { comptroller, cToken, uToken } = await deployHelperContracts();
    const agent = await upgrades.deployProxy(agentFactory, [cToken.address]);
    await agent.deployed();

    return {
      agent,
      comptroller,
      cToken,
      uToken,
    };
  }

  async function deployAndConfigureAllContracts(): Promise<AllContracts> {
    const contracts = await deployAllContracts();
    await proveTx(contracts.agent.configureAdmin(admin.address, true));
    return contracts;
  }

  describe("Function 'initialize()'", () => {
    it("Configures the contract as expected", async () => {
      const { agent, comptroller, cToken, uToken } = await setUpFixture(deployAllContracts);

      await expect(
        agent.deployTransaction
      ).to.emit(
        comptroller,
        EVENT_NAME_ENTER_MARKETS
      ).withArgs(cToken.address, 1);

      expect(await agent.owner()).to.eq(deployer.address);
      expect(await agent.isAdmin(deployer.address)).to.eq(false);
      expect(await agent.market()).to.eq(cToken.address);

      const ownerApproval: BigNumber = await uToken.allowance(agent.address, deployer.address);
      const marketApproval: BigNumber = await uToken.allowance(agent.address, cToken.address);
      expect(ownerApproval).to.eq(ethers.constants.MaxUint256);
      expect(marketApproval).to.eq(ethers.constants.MaxUint256);
    });

    it("Is reverted if it is called a second time", async () => {
      const { agent, cToken } = await setUpFixture(deployAllContracts);
      await expect(
        agent.initialize(cToken.address)
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_ALREADY_INITIALIZED);
    });

    it("Is reverted if the 'enterMarkets()' function of the comptroller contract fails", async () => {
      const { comptroller, cToken } = await deployHelperContracts();
      await proveTx(comptroller.setEnterMarketsResult(COMPTROLLER_ENTER_MARKET_BAD_RESULT));
      const uninitializedAgent = await upgrades.deployProxy(agentFactory, [], { initializer: false });

      await expect(
        uninitializedAgent.initialize(cToken.address)
      ).to.revertedWithCustomError(
        agentFactory, REVERT_ERROR_IF_COMPOUND_COMPTROLLER_FAILURE
      ).withArgs(COMPTROLLER_ENTER_MARKET_BAD_RESULT);
    });

    it("Is reverted for the contract implementation if it is called even for the first time", async () => {
      const agent = await agentFactory.deploy();
      await agent.deployed();

      await expect(
        agent.initialize(ethers.constants.AddressZero)
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_ALREADY_INITIALIZED);
    });
  });

  describe("Function 'configureAdmin()'", () => {
    async function checkExecutionOfConfigureAdmin(
      params: {
        agent: Contract,
        newAdminStatus: boolean
      }
    ) {
      const { agent, newAdminStatus } = params;
      await expect(
        agent.configureAdmin(admin.address, newAdminStatus)
      ).to.emit(
        agent,
        EVENT_NAME_CONFIGURE_ADMIN
      ).withArgs(
        admin.address,
        newAdminStatus
      );
      expect(await agent.isAdmin(admin.address)).to.eq(newAdminStatus);
    }

    it("Executes as expected and emits the correct event", async () => {
      const { agent } = await setUpFixture(deployAllContracts);
      await checkExecutionOfConfigureAdmin({ agent, newAdminStatus: true });
      await checkExecutionOfConfigureAdmin({ agent, newAdminStatus: false });
    });

    it("Is reverted if is called not by the owner", async () => {
      const { agent } = await setUpFixture(deployAllContracts);
      await expect(
        agent.connect(stranger).configureAdmin(admin.address, true)
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
    });

    it("Is reverted if the new admin status equals the previously set one", async () => {
      const { agent } = await setUpFixture(deployAllContracts);
      let adminStatus = false;
      expect(await agent.isAdmin(admin.address)).to.eq(adminStatus);

      await expect(
        agent.configureAdmin(admin.address, adminStatus)
      ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_ADMIN_IS_ALREADY_CONFIGURED);

      adminStatus = true;
      await proveTx(agent.configureAdmin(admin.address, adminStatus));

      await expect(
        agent.configureAdmin(admin.address, adminStatus)
      ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_ADMIN_IS_ALREADY_CONFIGURED);
    });
  });

  describe("Function 'setMintOnDebtCollectionCap()'", () => {
    it("Executes as expected and emits the correct event", async () => {
      const { agent } = await setUpFixture(deployAllContracts);
      const newCap = TOKEN_AMOUNT_STUB;

      await expect(
        agent.setMintOnDebtCollectionCap(newCap)
      ).to.emit(
        agent,
        EVENT_NAME_SET_MINT_ON_DEBT_COLLECTION_CAP
      ).withArgs(
        0,
        newCap
      );
      expect(await agent.mintOnDebtCollectionCap()).to.eq(newCap);
    });

    it("Is reverted if is called not by the owner", async () => {
      const { agent } = await setUpFixture(deployAllContracts);
      await expect(
        agent.connect(stranger).setMintOnDebtCollectionCap(TOKEN_AMOUNT_STUB)
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
    });

    it("Is reverted if the new limit value equals the previously set one", async () => {
      const { agent } = await setUpFixture(deployAllContracts);
      let limit = 0;
      expect(await agent.mintOnDebtCollectionCap()).to.eq(limit);

      await expect(
        agent.setMintOnDebtCollectionCap(limit)
      ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_MINT_ON_DEBT_COLLECTION_CAP_UNCHANGED);

      limit = TOKEN_AMOUNT_STUB;
      await proveTx(agent.setMintOnDebtCollectionCap(limit));

      await expect(
        agent.setMintOnDebtCollectionCap(limit)
      ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_MINT_ON_DEBT_COLLECTION_CAP_UNCHANGED);
    });
  });

  describe("Function 'mint()'", () => {

    describe("Executes as expected with the correspondent cToken function call if the token amount is", () => {
      async function checkExecutionOfMint(params: { tokenAmount: number }) {
        const { agent, cToken } = await setUpFixture(deployAllContracts);
        await expect(
          agent.mint(params.tokenAmount)
        ).to.emit(
          cToken,
          EVENT_NAME_MOCK_MINT_C_TOKEN
        ).withArgs(
          params.tokenAmount
        );
      }

      it("Non-zero", async () => {
        await checkExecutionOfMint({ tokenAmount: TOKEN_AMOUNT_STUB });
      });

      it("Zero", async () => {
        await checkExecutionOfMint({ tokenAmount: 0 });
      });
    });

    describe("Is reverted if", () => {
      it("It is called not by the owner", async () => {
        const { agent } = await setUpFixture(deployAllContracts);
        await expect(
          agent.connect(stranger).mint(TOKEN_AMOUNT_STUB)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
      });

      it("The correspondent cToken function fails", async () => {
        const { agent, cToken } = await setUpFixture(deployAllContracts);
        await proveTx(cToken.setMintResult(MARKET_MINT_FUNCTION_BAD_RESULT));
        await expect(
          agent.mint(TOKEN_AMOUNT_STUB)
        ).to.be.revertedWithCustomError(
          agent, REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE
        ).withArgs(MARKET_MINT_FUNCTION_BAD_RESULT);
      });
    });
  });

  describe("Function 'redeem()'", () => {
    describe("Executes as expected with the correspondent cToken function call if the token amount is", () => {
      async function checkExecutionOfRedeem(params: { tokenAmount: number }) {
        const { agent, cToken } = await setUpFixture(deployAllContracts);
        await expect(
          agent.redeem(params.tokenAmount)
        ).to.emit(
          cToken,
          EVENT_NAME_MOCK_REDEEM
        ).withArgs(
          params.tokenAmount
        );
      }

      it("Nonzero", async () => {
        await checkExecutionOfRedeem({ tokenAmount: TOKEN_AMOUNT_STUB });
      });

      it("Zero", async () => {
        await checkExecutionOfRedeem({ tokenAmount: 0 });
      });
    });

    describe("Is reverted if", () => {
      it("It is called not by the owner", async () => {
        const { agent } = await setUpFixture(deployAllContracts);
        await expect(
          agent.connect(stranger).redeem(TOKEN_AMOUNT_STUB)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
      });

      it("The correspondent cToken function call fails", async () => {
        const { agent, cToken } = await setUpFixture(deployAllContracts);
        await proveTx(cToken.setRedeemResult(MARKET_REDEEM_FUNCTION_BAR_RESULT));
        await expect(
          agent.redeem(TOKEN_AMOUNT_STUB)
        ).to.be.revertedWithCustomError(
          agent, REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE
        ).withArgs(MARKET_REDEEM_FUNCTION_BAR_RESULT);
      });
    });
  });

  describe("Function 'redeemUnderlying()'", () => {
    describe("Executes as expected with the correspondent cToken function call if the token amount is", () => {
      async function checkExecutionOfRedeemUnderlying(params: { tokenAmount: number }) {
        const { agent, cToken } = await setUpFixture(deployAllContracts);
        await expect(
          agent.redeemUnderlying(params.tokenAmount)
        ).to.emit(
          cToken,
          EVENT_NAME_MOCK_REDEEM_UNDERLYING
        ).withArgs(
          params.tokenAmount
        );
      }

      it("Nonzero", async () => {
        await checkExecutionOfRedeemUnderlying({ tokenAmount: TOKEN_AMOUNT_STUB });
      });

      it("Zero", async () => {
        await checkExecutionOfRedeemUnderlying({ tokenAmount: 0 });
      });
    });

    describe("Is reverted if", () => {
      it("It is called not by the owner", async () => {
        const { agent } = await setUpFixture(deployAllContracts);
        await expect(
          agent.connect(stranger).redeemUnderlying(TOKEN_AMOUNT_STUB)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
      });

      it("The correspondent cToken function fails", async () => {
        const { agent, cToken } = await setUpFixture(deployAllContracts);
        await proveTx(cToken.setRedeemUnderlyingResult(MARKET_REDEEM_UNDERLYING_BAD_RESULT));
        await expect(
          agent.redeemUnderlying(TOKEN_AMOUNT_STUB)
        ).to.be.revertedWithCustomError(
          agent, REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE
        ).withArgs(MARKET_REDEEM_UNDERLYING_BAD_RESULT);
      });
    });
  });

  describe("Function 'mintAndRepayTrustedBorrow()'", () => {
    describe("Executes as expected if the borrow is", () => {
      async function checkExecutionOfMintAndRepayTrustedBorrow(
        params: {
          isBorrowDefaulted: boolean,
          inputTokenAmount: BigNumber
        }
      ) {
        const { agent, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        const { isBorrowDefaulted, inputTokenAmount } = params;
        const isInputTokenAmountMaximum = inputTokenAmount === ethers.constants.MaxUint256;
        const actualTokenAmount = isInputTokenAmountMaximum ? TOKEN_AMOUNT_STUB - 1 : inputTokenAmount;

        if (isInputTokenAmountMaximum) {
          await proveTx(cToken.setBorrowBalanceCurrentResult(actualTokenAmount));
        }

        const tx: TransactionResponse =
          await agent.connect(admin).mintAndRepayTrustedBorrow(user.address, inputTokenAmount, isBorrowDefaulted);

        await expect(tx).to.emit(agent, EVENT_NAME_REPAY_TRUSTED_BORROW).withArgs(user.address, actualTokenAmount);
        await expect(tx).to.emit(cToken, EVENT_NAME_MOCK_REPAY_BORROW_BEHALF).withArgs(user.address, actualTokenAmount);
        await expect(tx).to.emit(uToken, EVENT_NAME_MOCK_MINT).withArgs(agent.address, actualTokenAmount);

        if (isBorrowDefaulted) {
          await expect(tx).to.emit(agent, EVENT_NAME_REPAY_DEFAULTED_BORROW).withArgs(user.address, actualTokenAmount);
          await expect(tx).to.emit(cToken, EVENT_NAME_MOCK_REDEEM_UNDERLYING).withArgs(actualTokenAmount);
          await expect(tx).to.emit(uToken, EVENT_NAME_MOCK_BURN).withArgs(actualTokenAmount);
        } else {
          await expect(tx).not.to.emit(agent, EVENT_NAME_REPAY_DEFAULTED_BORROW);
          await expect(tx).not.to.emit(cToken, EVENT_NAME_MOCK_REDEEM_UNDERLYING);
          await expect(tx).not.to.emit(uToken, EVENT_NAME_MOCK_BURN);
        }

        if (isInputTokenAmountMaximum) {
          await expect(tx).to.emit(cToken, EVENT_NAME_MOCK_BORROW_BALANCE_CURRENT).withArgs(user.address);
        } else {
          await expect(tx).not.to.emit(cToken, EVENT_NAME_MOCK_BORROW_BALANCE_CURRENT);
        }
      }

      describe("Defaulted and the token amount is", () => {
        it("Nonzero and less than 'type(uint256).max'", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrow({
            isBorrowDefaulted: true,
            inputTokenAmount: BigNumber.from(TOKEN_AMOUNT_STUB)
          });
        });

        it("Equal to 'type(uint256).max'", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrow({
            isBorrowDefaulted: true,
            inputTokenAmount: ethers.constants.MaxUint256
          });
        });

        it("Zero", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrow({
            isBorrowDefaulted: true,
            inputTokenAmount: ethers.constants.Zero
          });
        });
      });

      describe("Not defaulted and the token amount is", () => {
        it("Nonzero and less than 'type(uint256).max'", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrow({
            isBorrowDefaulted: false,
            inputTokenAmount: BigNumber.from(TOKEN_AMOUNT_STUB)
          });
        });

        it("Equal to 'type(uint256).max'", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrow({
            isBorrowDefaulted: false,
            inputTokenAmount: ethers.constants.MaxUint256
          });
        });

        it("Zero", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrow({
            isBorrowDefaulted: false,
            inputTokenAmount: ethers.constants.Zero
          });
        });
      });
    });

    describe("Is reverted if", () => {
      it("It is called not by the admin", async () => {
        const { agent } = await setUpFixture(deployAndConfigureAllContracts);
        await expect(
          agent.mintAndRepayTrustedBorrow(user.address, TOKEN_AMOUNT_STUB, BORROW_IS_DEFAULTED)
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_ADMIN_IS_UNAUTHORIZED);
      });

      it("The contract is paused", async () => {
        const { agent } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(agent.setPauser(deployer.address));
        await proveTx(agent.pause());
        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrow(user.address, TOKEN_AMOUNT_STUB, BORROW_IS_DEFAULTED)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_PAUSED);
      });

      it("The 'mint()' function of the underlying token fails", async () => {
        const { agent, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(uToken.disableMint());
        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrow(user.address, TOKEN_AMOUNT_STUB, BORROW_IS_NOT_DEFAULTED)
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_MINT_FAILURE);
      });

      it("The 'repayBorrowBehalf()' function of cToken fails", async () => {
        const { agent, cToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(cToken.setRepayBorrowBehalfResult(MARKET_REPAY_BORROW_BEHALF_BAD_RESULT));
        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrow(user.address, TOKEN_AMOUNT_STUB, BORROW_IS_NOT_DEFAULTED)
        ).to.be.revertedWithCustomError(
          agent, REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE
        ).withArgs(MARKET_REPAY_BORROW_BEHALF_BAD_RESULT);
      });

      it("The 'redeemUnderlying()' function of cToken fails", async () => {
        const { agent, cToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(cToken.setRedeemUnderlyingResult(MARKET_REDEEM_UNDERLYING_BAD_RESULT));
        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrow(user.address, TOKEN_AMOUNT_STUB, BORROW_IS_DEFAULTED)
        ).to.be.revertedWithCustomError(
          agent, REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE
        ).withArgs(MARKET_REDEEM_UNDERLYING_BAD_RESULT);
      });
    });
  });

  describe("Function 'mintAndRepayTrustedBorrows()'", () => {
    describe("Executes as expected if the input arrays are not empty and the last borrow is", () => {
      async function checkExecutionOfMintAndRepayTrustedBorrows(
        params: {
          isLastBorrowDefaulted: boolean,
          lastInputTokenAmount: BigNumber
        }
      ) {
        const { agent, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        const { isLastBorrowDefaulted, lastInputTokenAmount } = params;
        const isLastInputTokenAmountMaximum = lastInputTokenAmount === ethers.constants.MaxUint256;
        let lastActualTokenAmount = isLastInputTokenAmountMaximum ? TOKEN_AMOUNT_STUB - 1 : lastInputTokenAmount;

        if (isLastInputTokenAmountMaximum) {
          await proveTx(cToken.setBorrowBalanceCurrentResult(lastActualTokenAmount));
        }

        const tx: TransactionResponse =
          await agent.connect(admin).mintAndRepayTrustedBorrows(
            [deployer.address, user.address],
            [TOKEN_AMOUNT_STUB, lastInputTokenAmount],
            [BORROW_IS_NOT_DEFAULTED, isLastBorrowDefaulted]
          );

        await expect(tx).to.emit(agent, EVENT_NAME_REPAY_TRUSTED_BORROW).withArgs(deployer.address, TOKEN_AMOUNT_STUB);
        await expect(tx).to.emit(agent, EVENT_NAME_REPAY_TRUSTED_BORROW).withArgs(user.address, lastActualTokenAmount);
        await expect(tx).to.emit(cToken, EVENT_NAME_MOCK_REPAY_BORROW_BEHALF)
          .withArgs(deployer.address, TOKEN_AMOUNT_STUB);
        await expect(tx).to.emit(cToken, EVENT_NAME_MOCK_REPAY_BORROW_BEHALF)
          .withArgs(user.address, lastActualTokenAmount);
        await expect(tx).to.emit(uToken, EVENT_NAME_MOCK_MINT).withArgs(agent.address, TOKEN_AMOUNT_STUB);
        await expect(tx).to.emit(uToken, EVENT_NAME_MOCK_MINT).withArgs(agent.address, lastActualTokenAmount);

        if (isLastBorrowDefaulted) {
          await expect(tx).to.emit(agent, EVENT_NAME_REPAY_DEFAULTED_BORROW)
            .withArgs(user.address, lastActualTokenAmount);
          await expect(tx).to.emit(cToken, EVENT_NAME_MOCK_REDEEM_UNDERLYING).withArgs(lastActualTokenAmount);
          await expect(tx).to.emit(uToken, EVENT_NAME_MOCK_BURN).withArgs(lastActualTokenAmount);
        } else {
          await expect(tx).not.to.emit(agent, EVENT_NAME_REPAY_DEFAULTED_BORROW);
          await expect(tx).not.to.emit(cToken, EVENT_NAME_MOCK_REDEEM_UNDERLYING);
          await expect(tx).not.to.emit(uToken, EVENT_NAME_MOCK_BURN);
        }

        if (isLastInputTokenAmountMaximum) {
          await expect(tx).to.emit(cToken, EVENT_NAME_MOCK_BORROW_BALANCE_CURRENT).withArgs(user.address);
        } else {
          await expect(tx).not.to.emit(cToken, EVENT_NAME_MOCK_BORROW_BALANCE_CURRENT);
        }
      }

      describe("Defaulted and the token amount of the last borrow is", () => {
        it("Nonzero and less than 'type(uint256).max'", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrows({
            isLastBorrowDefaulted: true,
            lastInputTokenAmount: BigNumber.from(TOKEN_AMOUNT_STUB + 1)
          });
        });

        it("Equal to 'type(uint256).max'", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrows({
            isLastBorrowDefaulted: true,
            lastInputTokenAmount: ethers.constants.MaxUint256
          });
        });

        it("Zero", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrows({
            isLastBorrowDefaulted: true,
            lastInputTokenAmount: ethers.constants.Zero
          });
        });
      });

      describe("Not defaulted and the token amount of the last borrow is", () => {
        it("Nonzero and less than 'type(uint256).max'", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrows({
            isLastBorrowDefaulted: false,
            lastInputTokenAmount: BigNumber.from(TOKEN_AMOUNT_STUB + 1)
          });
        });

        it("Equal to 'type(uint256).max'", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrows({
            isLastBorrowDefaulted: false,
            lastInputTokenAmount: ethers.constants.MaxUint256
          });
        });

        it("Zero", async () => {
          await checkExecutionOfMintAndRepayTrustedBorrows({
            isLastBorrowDefaulted: false,
            lastInputTokenAmount: ethers.constants.Zero
          });
        });
      });
    });

    describe("Executes as expected if the input arrays are empty", () => {
      it("Without emitting any events", async () => {
        const { agent, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);

        const tx: TransactionResponse = await agent.connect(admin).mintAndRepayTrustedBorrows([], [], []);
        await expect(tx).not.to.emit(agent, EVENT_NAME_REPAY_TRUSTED_BORROW);
        await expect(tx).not.to.emit(agent, EVENT_NAME_REPAY_DEFAULTED_BORROW);
        await expect(tx).not.to.emit(cToken, EVENT_NAME_MOCK_REPAY_BORROW_BEHALF);
        await expect(tx).not.to.emit(cToken, EVENT_NAME_MOCK_REDEEM_UNDERLYING);
        await expect(tx).not.to.emit(cToken, EVENT_NAME_MOCK_BORROW_BALANCE_CURRENT);
        await expect(tx).not.to.emit(uToken, EVENT_NAME_MOCK_MINT);
        await expect(tx).not.to.emit(uToken, EVENT_NAME_MOCK_BURN);
      });
    });

    describe("Is reverted if", () => {
      it("It is called not by the admin", async () => {
        const { agent } = await setUpFixture(deployAndConfigureAllContracts);
        await expect(
          agent.mintAndRepayTrustedBorrows([], [], [])
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_ADMIN_IS_UNAUTHORIZED);
      });

      it("The contract is paused", async () => {
        const { agent } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(agent.setPauser(deployer.address));
        await proveTx(agent.pause());
        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrows([], [], [])
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_PAUSED);
      });

      it("The length of input arrays mismatches", async () => {
        const { agent } = await setUpFixture(deployAndConfigureAllContracts);

        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrows(
            [deployer.address],
            [TOKEN_AMOUNT_STUB, TOKEN_AMOUNT_STUB],
            [BORROW_IS_DEFAULTED, BORROW_IS_NOT_DEFAULTED]
          )
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_INPUT_ARRAYS_LENGTH_MISMATCH);

        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrows(
            [deployer.address, user.address],
            [TOKEN_AMOUNT_STUB],
            [BORROW_IS_DEFAULTED, BORROW_IS_NOT_DEFAULTED]
          )
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_INPUT_ARRAYS_LENGTH_MISMATCH);

        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrows(
            [deployer.address, user.address],
            [TOKEN_AMOUNT_STUB, TOKEN_AMOUNT_STUB],
            [BORROW_IS_DEFAULTED]
          )
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_INPUT_ARRAYS_LENGTH_MISMATCH);
      });

      it("The 'mint()' function of the underlying token fails", async () => {
        const { agent, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(uToken.disableMint());
        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrows(
            [deployer.address, user.address],
            [TOKEN_AMOUNT_STUB, TOKEN_AMOUNT_STUB],
            [BORROW_IS_DEFAULTED, BORROW_IS_NOT_DEFAULTED]
          )
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_MINT_FAILURE);
      });

      it("The 'repayBorrowBehalf()' function of cToken fails", async () => {
        const { agent, cToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(cToken.setRepayBorrowBehalfResult(MARKET_REPAY_BORROW_BEHALF_BAD_RESULT));
        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrows(
            [deployer.address, user.address],
            [TOKEN_AMOUNT_STUB, TOKEN_AMOUNT_STUB],
            [BORROW_IS_DEFAULTED, BORROW_IS_NOT_DEFAULTED]
          )
        ).to.be.revertedWithCustomError(
          agent, REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE
        ).withArgs(MARKET_REPAY_BORROW_BEHALF_BAD_RESULT);
      });

      it("The 'redeemUnderlying()' function of cToken fails", async () => {
        const { agent, cToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(cToken.setRedeemUnderlyingResult(MARKET_REDEEM_UNDERLYING_BAD_RESULT));
        await expect(
          agent.connect(admin).mintAndRepayTrustedBorrows(
            [deployer.address, user.address],
            [TOKEN_AMOUNT_STUB, TOKEN_AMOUNT_STUB],
            [BORROW_IS_NOT_DEFAULTED, BORROW_IS_DEFAULTED]
          )
        ).to.be.revertedWithCustomError(
          agent, REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE
        ).withArgs(MARKET_REDEEM_UNDERLYING_BAD_RESULT);
      });
    });
  });

  describe("Function 'mintOnDebtCollection()'", () => {

    describe("Executes as expected with the correspondent cToken function call if", () => {
      async function checkExecutionOfMintOnDebtCollection(params: { borrowerAddress: string, tokenAmount: number }) {
        const { agent, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        const { borrowerAddress, tokenAmount } = params;
        await proveTx(agent.setMintOnDebtCollectionCap(params.tokenAmount == 0 ? 1 : params.tokenAmount));

        const tx = await agent.connect(admin).mintOnDebtCollection(borrowerAddress, tokenAmount);
        await expect(tx).to.emit(agent, EVENT_NAME_MINT_ON_DEBT_COLLECTION).withArgs(borrowerAddress, tokenAmount);
        await expect(tx).to.emit(cToken, EVENT_NAME_MOCK_MINT_C_TOKEN).withArgs(tokenAmount);
        await expect(tx).to.emit(uToken, EVENT_NAME_MOCK_MINT).withArgs(agent.address, tokenAmount);
      }

      it("The underlying token amount is non-zero and the borrower address is non-zero", async () => {
        await checkExecutionOfMintOnDebtCollection({
          borrowerAddress: BORROWER_ADDRESS_STUB,
          tokenAmount: TOKEN_AMOUNT_STUB
        });
      });

      it("The underlying token amount is non-zero and the borrower address is zero", async () => {
        await checkExecutionOfMintOnDebtCollection({
          borrowerAddress: ethers.constants.AddressZero,
          tokenAmount: TOKEN_AMOUNT_STUB
        });
      });

      it("The underlying token amount is zero and the borrower address is non-zero", async () => {
        await checkExecutionOfMintOnDebtCollection({
          borrowerAddress: BORROWER_ADDRESS_STUB,
          tokenAmount: 0
        });
      });

      it("The underlying token amount is zero and the borrower address is zero", async () => {
        await checkExecutionOfMintOnDebtCollection({
          borrowerAddress: ethers.constants.AddressZero,
          tokenAmount: 0
        });
      });
    });

    describe("Is reverted if", () => {
      it("It is called not by the admin", async () => {
        const { agent } = await setUpFixture(deployAndConfigureAllContracts);
        await expect(
          agent.connect(stranger).mintOnDebtCollection(BORROWER_ADDRESS_STUB, TOKEN_AMOUNT_STUB)
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_ADMIN_IS_UNAUTHORIZED);
      });

      it("The contract is paused", async () => {
        const { agent } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(agent.setPauser(deployer.address));
        await proveTx(agent.pause());

        await expect(
          agent.connect(admin).mintOnDebtCollection(BORROWER_ADDRESS_STUB, TOKEN_AMOUNT_STUB)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_PAUSED);
      });

      it("The underlying token amount exceeds the limit", async () => {
        const { agent } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(agent.setMintOnDebtCollectionCap(TOKEN_AMOUNT_STUB));

        await expect(
          agent.connect(admin).mintOnDebtCollection(BORROWER_ADDRESS_STUB, TOKEN_AMOUNT_STUB + 1)
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_MINT_ON_DEBT_COLLECTION_CAP_EXCESS);
      });

      it("The 'mint()' function of the underlying token fails", async () => {
        const { agent, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(agent.setMintOnDebtCollectionCap(TOKEN_AMOUNT_STUB));
        await proveTx(uToken.disableMint());
        await expect(
          agent.connect(admin).mintOnDebtCollection(BORROWER_ADDRESS_STUB, TOKEN_AMOUNT_STUB)
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_MINT_FAILURE);
      });

      it("The correspondent cToken function fails", async () => {
        const { agent, cToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(agent.setMintOnDebtCollectionCap(TOKEN_AMOUNT_STUB));
        await proveTx(cToken.setMintResult(MARKET_MINT_FUNCTION_BAD_RESULT));

        await expect(
          agent.connect(admin).mintOnDebtCollection(BORROWER_ADDRESS_STUB, TOKEN_AMOUNT_STUB)
        ).to.be.revertedWithCustomError(
          agent, REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE
        ).withArgs(MARKET_MINT_FUNCTION_BAD_RESULT);
      });
    });
  });

  describe("Function 'transferOwnership()'", () => {
    describe("Executes as expected and emits the correct event", () => {
      it("If the new owner differs from the previously set one", async () => {
        const { agent, uToken } = await setUpFixture(deployAllContracts);
        const oldOwner: SignerWithAddress = deployer;
        const newOwner: SignerWithAddress = user;

        expect(await agent.owner()).to.eq(oldOwner.address);
        expect(await uToken.allowance(agent.address, newOwner.address)).to.eq(0);
        expect(await uToken.allowance(agent.address, oldOwner.address)).to.eq(ethers.constants.MaxUint256);

        await expect(
          agent.transferOwnership(newOwner.address)
        ).to.emit(
          agent, EVENT_NAME_OWNERSHIP_TRANSFERRED
        ).withArgs(
          oldOwner.address,
          newOwner.address
        );

        expect(await agent.owner()).to.eq(newOwner.address);
        expect(await uToken.allowance(agent.address, newOwner.address)).to.eq(ethers.constants.MaxUint256);
        expect(await uToken.allowance(agent.address, oldOwner.address)).to.eq(0);
      });
    });

    describe("Is reverted if", () => {
      it("It is called not by the owner", async () => {
        const { agent } = await setUpFixture(deployAllContracts);
        await expect(
          agent.connect(stranger).transferOwnership(user.address)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
      });

      it("The new owner address is zero", async () => {
        const { agent } = await setUpFixture(deployAllContracts);
        await expect(
          agent.transferOwnership(ethers.constants.AddressZero)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_NEW_OWNER_IS_ZERO);
      });

      it("The new owner address is the same as the previously set one", async () => {
        const { agent } = await setUpFixture(deployAllContracts);
        await expect(
          agent.transferOwnership(deployer.address)
        ).to.be.revertedWithCustomError(agent, REVERT_ERROR_IF_OWNER_IS_UNCHANGED);
      });
    });
  });
});
