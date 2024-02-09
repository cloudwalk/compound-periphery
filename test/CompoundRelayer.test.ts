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

  const EVENT_NAME_ENTER_MARKETS = "EnterMarkets";
  const EVENT_NAME_CONFIGURE_ADMIN = "ConfigureAdmin";
  const EVENT_NAME_REPAY_BORROW_BEHALF = "RepayBorrowBehalf";
  const EVENT_NAME_MOCK_REPAY_BORROW_BEHALF = "CTokenMockRepayBorrowBehalf";
  const EVENT_NAME_MOCK_TRANSFER_FROM = "ERC20MockTransferFrom";
  const EVENT_NAME_CONFIGURE_COMPOUND_PAYER = "ConfigureCompoundPayer";

  const REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER = "Ownable: caller is not the owner";
  const REVERT_MESSAGE_IF_CONTRACT_IS_ALREADY_INITIALIZED = "Initializable: contract is already initialized";
  const REVERT_ERROR_IF_ADMIN_IS_ALREADY_CONFIGURED = "AdminAlreadyConfigured";

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

    it("Is reverted if it is called a second time", async () => {
      const { relayer } = await setUpFixture(deployAllContracts);
      await expect(
        relayer.initialize()
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_ALREADY_INITIALIZED);
    });

    it("Is reverted for the contract implementation if it is called even for the first time", async () => {
      const relayer = await relayerFactory.deploy();
      await relayer.deployed();

      await expect(
        relayer.initialize()
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CONTRACT_IS_ALREADY_INITIALIZED);
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

    it("Is reverted if is called not by the owner", async () => {
      const { relayer } = await setUpFixture(deployAllContracts);
      await expect(
        relayer.connect(stranger).configureAdmin(admin.address, true)
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
    });

    it("Is reverted if the new admin status equals the previously set one", async () => {
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
  //
  describe("Function 'enterMarket()'", () => {
    it("Executes as expected and emits the correct event", async () => {
      const { relayer, comptroller, cToken } = await setUpFixture(deployAllContracts);
      await expect(relayer.enterMarket(cToken.address))
        .to.emit(comptroller, EVENT_NAME_ENTER_MARKETS)
        .withArgs(cToken.address, 1);
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

    it("Is reverted if is called not by the owner", async () => {
      const { relayer } = await setUpFixture(deployAllContracts);
      await expect(
        relayer.connect(stranger).configureCompoundPayer(compoundPayer.address)
      ).to.be.revertedWith(REVERT_MESSAGE_IF_CALLER_IS_NOT_OWNER);
    });
  });

  describe("Function 'rescueERC20()'", () => {
    it("Executes as expected and emits the correct event", async () => {
      const { relayer, comptroller, cToken, uToken } = await setUpFixture(deployAllContracts);
      const tokenAmount = 1000;
      await proveTx(uToken.mint(relayer.address, tokenAmount));

      await expect(
        relayer.rescueERC20(uToken.address, admin.address, tokenAmount)
      ).to.changeTokenBalances(
        uToken,
        [relayer, admin],
        [-tokenAmount, +tokenAmount]
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
      const tx: TransactionResponse = await relayer.connect(admin).repayBorrowBehalf(
        market,
        borrower,
        repayAmount
      );

      await expect(tx)
        .to.emit(relayer, EVENT_NAME_REPAY_BORROW_BEHALF)
        .withArgs(borrower, repayAmount);

      await expect(tx)
        .to.emit(uToken, EVENT_NAME_MOCK_TRANSFER_FROM)
        .withArgs(compoundPayer.address, relayer.address, repayAmount);

      await expect(tx)
        .to.emit(cToken, EVENT_NAME_MOCK_REPAY_BORROW_BEHALF)
        .withArgs(borrower, repayAmount);
    }

    it("Repays borrow on behalf as expected", async () => {
      await checkExecutionOfRepayBorrowBehalf({
        borrower: user.address,
        repayAmount: BigNumber.from(1000)
      });
    });
  });

  describe("Function 'repayBorrowBehalfBatch()'", () => {
    async function checkExecutionOfRepayBorrowBehalfBatch(repayments: Repayment[], contracts: AllContracts) {
      const { relayer, cToken, uToken } = contracts;
      let borrower = repayments[0].borrower;
      let repayAmount = repayments[0].repayAmount;

      await proveTx(cToken.setBorrowBalanceCurrentResult(repayAmount));
      const paramsAsArrayOfTuples = repayments.map(
        repayment =>
          [repayment.market, repayment.borrower, repayment.repayAmount]
        );
      const tx: TransactionResponse = await relayer.connect(admin).repayBorrowBehalfBatch(paramsAsArrayOfTuples);

      await expect(tx)
        .to.emit(relayer, EVENT_NAME_REPAY_BORROW_BEHALF)
        .withArgs(borrower, repayAmount);

      await expect(tx)
        .to.emit(uToken, EVENT_NAME_MOCK_TRANSFER_FROM)
        .withArgs(compoundPayer.address, relayer.address, repayAmount);

      await expect(tx)
        .to.emit(cToken, EVENT_NAME_MOCK_REPAY_BORROW_BEHALF)
        .withArgs(borrower, repayAmount);
    }

    it("Repays borrow on behalf as expected", async () => {
      const contracts: AllContracts = await setUpFixture(deployAndConfigureAllContracts);
      await checkExecutionOfRepayBorrowBehalfBatch(
        [{
          market: contracts.cToken.address,
          borrower: user.address,
          repayAmount: 1000
        }],
        contracts
      );
    });
  });
});
