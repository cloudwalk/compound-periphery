import { ethers, network, upgrades } from "hardhat";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { proveTx } from "../test-utils/eth";

interface HelperContracts {
  comptroller: Contract;
  cToken: Contract;
  uToken: Contract;
}

interface AllContracts {
  relayer: Contract;
  comptroller: Contract;
  cToken: Contract;
  uToken: Contract;
}

interface Repayment {
  market: string;
  borrower: string;
  repayAmount: number;
}

async function setUpFixture<T>(func: () => Promise<T>): Promise<T> {
  if (network.name === "hardhat") {
    return loadFixture(func);
  } else {
    return func();
  }
}

describe("Contract 'CompoundRelayer'", function () {
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const TOKEN_AMOUNT_STUB = 124;
  const MARKET_MINT_FUNCTION_BAD_RESULT = 12301;

  const EVENT_NAME_CONFIGURE_ADMIN = "ConfigureAdmin";
  const EVENT_NAME_REPAY_BORROW_BEHALF = "RepayBorrowBehalf";
  const EVENT_NAME_MOCK_REPAY_BORROW_BEHALF = "CTokenMockRepayBorrowBehalf";
  const EVENT_NAME_MOCK_TRANSFER_FROM = "ERC20MockTransferFrom";
  const EVENT_NAME_CONFIGURE_COMPOUND_PAYER = "ConfigureCompoundPayer";
  const EVENT_NAME_MOCK_BORROW_BALANCE_CURRENT = "CTokenMockBorrowBalanceCurrent";
  const EVENT_NAME_APPROVAL = "Approval";

  const REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER = "Ownable: caller is not the owner";
  const REVERT_MESSAGE_IF_CONTRACT_IS_ALREADY_INITIALIZED = "Initializable: contract is already initialized";
  const REVERT_MESSAGE_IF_CONTRACT_IS_PAUSED = "Pausable: paused";

  const REVERT_ERROR_IF_ADMIN_IS_ALREADY_CONFIGURED = "AdminAlreadyConfigured";
  const REVERT_ERROR_IF_COMPOUND_PAYER_INVALID_ADDRESS = "CompoundPayerInvalidAddress";
  const REVERT_ERROR_IF_COMPOUND_PAYER_ALREADY_CONFIGURED = "CompoundPayerAlreadyConfigured";
  const REVERT_ERROR_IF_ADMIN_IS_UNAUTHORIZED = "UnauthorizedAdmin";
  const REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE = "CompoundMarketFailure";
  const REVERT_ERROR_IF_TRANSFER_FROM_FAILURE = "TransferFromFailure";

  let relayerFactory: ContractFactory;
  let comptrollerFactory: ContractFactory;
  let cTokenFactory: ContractFactory;
  let uTokenFactory: ContractFactory;

  let deployer: SignerWithAddress;
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let stranger: SignerWithAddress;
  let compoundPayer: SignerWithAddress;

  before(async () => {
    [deployer, admin, user, stranger, compoundPayer] = await ethers.getSigners();
    relayerFactory = await ethers.getContractFactory("CompoundRelayer");
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
      uToken
    };
  }

  async function deployAllContracts(): Promise<AllContracts> {
    const { comptroller, cToken, uToken } = await deployHelperContracts();
    const relayer = await upgrades.deployProxy(relayerFactory);
    await relayer.deployed();

    return {
      relayer,
      comptroller,
      cToken,
      uToken
    };
  }

  async function deployAndConfigureAllContracts(): Promise<AllContracts> {
    const contracts = await deployAllContracts();
    await proveTx(contracts.relayer.configureAdmin(admin.address, true));
    await proveTx(contracts.relayer.configureCompoundPayer(compoundPayer.address));
    return contracts;
  }

  describe("Function 'initialize()'", () => {
    it("Configures the contract as expected", async () => {
      const { relayer } = await setUpFixture(deployAllContracts);

      expect(await relayer.owner()).to.eq(deployer.address);
      expect(await relayer.isAdmin(deployer.address)).to.eq(false);
    });

    describe("Is reverted if", () => {
      it("It is called a second time", async () => {
        const { relayer } = await setUpFixture(deployAllContracts);
        await expect(
          relayer.initialize()
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_ALREADY_INITIALIZED);
      });

      it("It is called even for the first time for the contract implementation", async () => {
        const relayer = await relayerFactory.deploy();
        await relayer.deployed();

        await expect(
          relayer.initialize()
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_ALREADY_INITIALIZED);
      });
    });
  });

  describe("Function 'configureAdmin()'", () => {
    async function checkExecutionOfConfigureAdmin(params: { relayer: Contract; newAdminStatus: boolean }) {
      const { relayer, newAdminStatus } = params;
      await expect(relayer.configureAdmin(admin.address, newAdminStatus))
        .to.emit(relayer, EVENT_NAME_CONFIGURE_ADMIN)
        .withArgs(admin.address, newAdminStatus);
      expect(await relayer.isAdmin(admin.address)).to.eq(newAdminStatus);
    }

    it("Executes as expected and emits the correct event", async () => {
      const { relayer } = await setUpFixture(deployAllContracts);
      await checkExecutionOfConfigureAdmin({ relayer, newAdminStatus: true });
      await checkExecutionOfConfigureAdmin({ relayer, newAdminStatus: false });
    });

    describe("Is reverted if", () => {
      it("The caller is not owner", async () => {
        const { relayer } = await setUpFixture(deployAllContracts);
        await expect(
          relayer.connect(stranger).configureAdmin(admin.address, true)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
      });

      it("The new admin status equals the previously set one", async () => {
        const { relayer } = await setUpFixture(deployAllContracts);
        let adminStatus = false;
        expect(await relayer.isAdmin(admin.address)).to.eq(adminStatus);

        await expect(
          relayer.configureAdmin(admin.address, adminStatus)
        ).to.be.revertedWithCustomError(relayer, REVERT_ERROR_IF_ADMIN_IS_ALREADY_CONFIGURED);

        adminStatus = true;
        await proveTx(relayer.configureAdmin(admin.address, adminStatus));

        await expect(
          relayer.configureAdmin(admin.address, adminStatus)
        ).to.be.revertedWithCustomError(relayer, REVERT_ERROR_IF_ADMIN_IS_ALREADY_CONFIGURED);
      });
    });
  });

  describe("Function 'enterMarket()'", () => {
    it("Executes as expected and emits the correct event", async () => {
      const { relayer, comptroller, cToken, uToken } = await setUpFixture(deployAllContracts);
      await expect(await relayer.enterMarket(cToken.address))
        .to.emit(uToken, EVENT_NAME_APPROVAL)
        .withArgs(relayer.address, cToken.address, ethers.constants.MaxUint256);
    });

    it("Is reverted if is called not by the owner", async () => {
      const { relayer, cToken } = await setUpFixture(deployAllContracts);
      await expect(
        relayer.connect(stranger).enterMarket(cToken.address)
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
    });
  });

  describe("Function 'configureCompoundPayer()'", () => {
    it("Executes as expected and emits the correct event", async () => {
      const { relayer } = await setUpFixture(deployAllContracts);
      await expect(relayer.configureCompoundPayer(compoundPayer.address))
        .to.emit(relayer, EVENT_NAME_CONFIGURE_COMPOUND_PAYER)
        .withArgs(ZERO_ADDRESS, compoundPayer.address);

      expect(await relayer.compoundPayer()).to.eq(compoundPayer.address);
    });

    describe("Is reverted if", () => {
      it("The caller is not owner", async () => {
        const { relayer } = await setUpFixture(deployAllContracts);
        await expect(
          relayer.connect(stranger).configureCompoundPayer(compoundPayer.address)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
      });

      it("The compound payer address is zero", async () => {
        const { relayer } = await setUpFixture(deployAllContracts);
        await expect(
          relayer.configureCompoundPayer(ZERO_ADDRESS)
        ).to.be.revertedWithCustomError(relayer, REVERT_ERROR_IF_COMPOUND_PAYER_INVALID_ADDRESS);
      });

      it("The compound payer address is already configured", async () => {
        const { relayer } = await setUpFixture(deployAllContracts);
        await relayer.configureCompoundPayer(compoundPayer.address);

        await expect(
          relayer.configureCompoundPayer(compoundPayer.address)
        ).to.be.revertedWithCustomError(relayer, REVERT_ERROR_IF_COMPOUND_PAYER_ALREADY_CONFIGURED);
      });
    });
  });

  describe("Function 'rescueERC20()'", () => {
    it("Executes as expected and emits the correct event", async () => {
      const { relayer, comptroller, cToken, uToken } = await setUpFixture(deployAllContracts);
      await proveTx(uToken.mint(relayer.address, TOKEN_AMOUNT_STUB));

      await expect(
        relayer.rescueERC20(uToken.address, admin.address, TOKEN_AMOUNT_STUB)
      ).to.changeTokenBalances(
        uToken,
        [relayer, admin],
        [-TOKEN_AMOUNT_STUB, +TOKEN_AMOUNT_STUB]
      );
    });

    it("Is reverted if is called not by the owner", async () => {
      const { relayer, uToken } = await setUpFixture(deployAllContracts);
      await expect(
        relayer.connect(stranger).rescueERC20(uToken.address, admin.address, 0)
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
    });
  });

  describe("Function 'repayBorrowBehalf()'", () => {
    async function checkExecutionOfRepayBorrowBehalf(params: {
      borrower: string;
      repayAmount: BigNumber;
    }) {
      const { relayer, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);
      const { borrower, repayAmount } = params;

      let market: string = cToken.address;
      await proveTx(cToken.setBorrowBalanceCurrentResult(repayAmount));
      const isInputTokenAmountMaximum = repayAmount === ethers.constants.MaxUint256;
      const tx: TransactionResponse = await relayer.connect(admin).repayBorrowBehalf(
        market,
        borrower,
        repayAmount
      );

      if (isInputTokenAmountMaximum) {
        await proveTx(cToken.setBorrowBalanceCurrentResult(repayAmount));
      }

      await expect(tx)
        .to.emit(relayer, EVENT_NAME_REPAY_BORROW_BEHALF)
        .withArgs(borrower, repayAmount);

      await expect(tx)
        .to.emit(uToken, EVENT_NAME_MOCK_TRANSFER_FROM)
        .withArgs(compoundPayer.address, relayer.address, repayAmount);

      await expect(tx)
        .to.emit(cToken, EVENT_NAME_MOCK_REPAY_BORROW_BEHALF)
        .withArgs(borrower, repayAmount);

      if (isInputTokenAmountMaximum) {
        await expect(tx).to.emit(cToken, EVENT_NAME_MOCK_BORROW_BALANCE_CURRENT).withArgs(user.address);
      } else {
        await expect(tx).not.to.emit(cToken, EVENT_NAME_MOCK_BORROW_BALANCE_CURRENT);
      }
    }

    describe("Executes as expected if the repayment amount is", () => {
      it("Nonzero and less than 'type(uint256).max'", async () => {
        await checkExecutionOfRepayBorrowBehalf({
          borrower: user.address,
          repayAmount: BigNumber.from(TOKEN_AMOUNT_STUB)
        });
      });

      it("Equal to 'type(uint256).max'", async () => {
        await checkExecutionOfRepayBorrowBehalf({
          borrower: user.address,
          repayAmount: ethers.constants.MaxUint256
        });
      });

      it("Zero", async () => {
        await checkExecutionOfRepayBorrowBehalf({
          borrower: user.address,
          repayAmount: ethers.constants.Zero
        });
      });
    });

    describe("Is reverted if", () => {
      it("The caller does not have the admin role", async () => {
        const { relayer, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);

        await expect(
          relayer.repayBorrowBehalf(
            cToken.address,
            user.address,
            BigNumber.from(TOKEN_AMOUNT_STUB)
          )
        ).to.be.revertedWithCustomError(relayer, REVERT_ERROR_IF_ADMIN_IS_UNAUTHORIZED);
      });

      it("The contract is paused", async () => {
        const { relayer, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(relayer.setPauser(deployer.address));
        await proveTx(relayer.pause());
        await expect(
          relayer.connect(admin).repayBorrowBehalf(
            cToken.address,
            user.address,
            BigNumber.from(TOKEN_AMOUNT_STUB)
          )
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_PAUSED);
      });

      it("The token transfer fails", async () => {
        const { relayer, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        await proveTx(uToken.disableTransferFrom());

        await expect(
          relayer.connect(admin).repayBorrowBehalf(
            cToken.address,
            user.address,
            BigNumber.from(TOKEN_AMOUNT_STUB)
          )
        ).to.be.revertedWithCustomError(relayer, REVERT_ERROR_IF_TRANSFER_FROM_FAILURE);
      });

      it("The repay function of the market fails", async () => {
        const { relayer, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        cToken.setRepayBorrowBehalfResult(MARKET_MINT_FUNCTION_BAD_RESULT);
        await expect(
          relayer.connect(admin).repayBorrowBehalf(
            cToken.address,
            user.address,
            BigNumber.from(TOKEN_AMOUNT_STUB)
          )
        ).to.be.revertedWithCustomError(relayer, REVERT_ERROR_IF_COMPOUND_MARKET_FAILURE)
          .withArgs(MARKET_MINT_FUNCTION_BAD_RESULT);
      });
    });
  });

  describe("Function 'repayBorrowBehalfBatch()'", () => {
    async function checkExecutionOfRepayBorrowBehalfBatch(repayments: Repayment[], contracts: AllContracts) {
      const { relayer, cToken, uToken } = contracts;

      const paramsAsArrayOfTuples = repayments.map(
        repayment => [repayment.market, repayment.borrower, repayment.repayAmount]
      );
      const tx: TransactionResponse = await relayer.connect(admin).repayBorrowBehalfBatch(paramsAsArrayOfTuples);

      for (const repayment of repayments) {
        await expect(tx)
          .to.emit(relayer, EVENT_NAME_REPAY_BORROW_BEHALF)
          .withArgs(repayment.borrower, repayment.repayAmount);

        await expect(tx)
          .to.emit(uToken, EVENT_NAME_MOCK_TRANSFER_FROM)
          .withArgs(compoundPayer.address, relayer.address, repayment.repayAmount);

        await expect(tx)
          .to.emit(cToken, EVENT_NAME_MOCK_REPAY_BORROW_BEHALF)
          .withArgs(repayment.borrower, repayment.repayAmount);
      }
    }

    function getParamsAsTuple(cToken: Contract) {
      let repayments = [{
        market: cToken.address,
        borrower: user.address,
        repayAmount: TOKEN_AMOUNT_STUB
      }];
      return repayments.map(
        repayment =>
          [repayment.market, repayment.borrower, repayment.repayAmount]
      );
    }

    describe("Executes as expected if", () => {
      it("The borrow was repaid on behalf as expected", async () => {
        const contracts: AllContracts = await setUpFixture(deployAndConfigureAllContracts);
        await checkExecutionOfRepayBorrowBehalfBatch(
          [
            {
              market: contracts.cToken.address,
              borrower: user.address,
              repayAmount: Math.floor(TOKEN_AMOUNT_STUB / 2)
            },
            {
              market: contracts.cToken.address,
              borrower: user.address,
              repayAmount: Math.floor(TOKEN_AMOUNT_STUB / 3)
            }],
          contracts
        );
      });
    });

    describe("Is reverted if", () => {
      it("The caller does not have the admin role", async () => {
        const { relayer, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        const paramsAsArrayOfTuples = getParamsAsTuple(cToken);
        await expect(
          relayer.repayBorrowBehalfBatch(paramsAsArrayOfTuples)
        ).to.be.revertedWithCustomError(relayer, REVERT_ERROR_IF_ADMIN_IS_UNAUTHORIZED);
      });

      it("The contract is paused", async () => {
        const { relayer, cToken, uToken } = await setUpFixture(deployAndConfigureAllContracts);
        const paramsAsArrayOfTuples = getParamsAsTuple(cToken);
        await proveTx(relayer.setPauser(deployer.address));
        await proveTx(relayer.pause());
        await expect(
          relayer.connect(admin).repayBorrowBehalfBatch(paramsAsArrayOfTuples)
        ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_PAUSED);
      });
    });
  });
});
