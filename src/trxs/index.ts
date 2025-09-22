import Database from '../database';
import { sompiToVecnoStringWithSuffix, type IPaymentOutput, createTransactions, PrivateKey, UtxoProcessor, UtxoContext, type RpcClient } from "../../wasm/vecno";
import Monitoring from '../monitoring';
import { DEBUG } from "../../index";

export default class trxManager {
  private networkId: string;
  private privateKey: PrivateKey;
  private address: string;
  private processor: UtxoProcessor;
  private context: UtxoContext;
  private db: Database;
  private monitoring: Monitoring;

  constructor(networkId: string, privKey: string, databaseUrl: string, rpc: RpcClient) {
    this.monitoring = new Monitoring();
    this.networkId = networkId;
    if (DEBUG) this.monitoring.debug(`TrxManager: Initializing with network ID: ${this.networkId}`);
    this.db = new Database(databaseUrl);
    if (DEBUG) this.monitoring.debug(`TrxManager: Database connection initialized`);
    this.privateKey = new PrivateKey(privKey);
    this.address = this.privateKey.toAddress(networkId).toString();
    if (DEBUG) this.monitoring.debug(`TrxManager: Derived pool address: ${this.address}`);
    this.processor = new UtxoProcessor({ rpc, networkId });
    if (DEBUG) this.monitoring.debug(`TrxManager: UtxoProcessor initialized for network: ${networkId}`);
    this.context = new UtxoContext({ processor: this.processor });
    if (DEBUG) this.monitoring.debug(`TrxManager: UtxoContext created`);
    this.registerProcessor();
    if (DEBUG) this.monitoring.debug(`TrxManager: Processor registered and started`);
  }

  async transferBalances() {
    if (DEBUG) this.monitoring.debug(`TrxManager: Starting balance transfer process`);
    const balances = await this.db.getAllBalancesExcludingPool();
    if (DEBUG) this.monitoring.debug(`TrxManager: Retrieved ${balances.length} miner balances`);
    
    let payments: IPaymentOutput[] = [];
    for (const { address, balance } of balances) {
      if (balance > 0) {
        this.monitoring.log(`TrxManager: Processing balance ${sompiToVecnoStringWithSuffix(balance, this.networkId!)} for address ${address}`);
        if (DEBUG) this.monitoring.debug(`TrxManager: Adding payment for ${address} with amount ${balance}`);
        payments.push({
          address: address,
          amount: balance
        });
      }
    }

    if (payments.length === 0) {
      this.monitoring.log('TrxManager: No payments found for current transfer cycle.');
      if (DEBUG) this.monitoring.debug(`TrxManager: No valid payments to process, exiting transferBalances`);
      return;
    }

    if (DEBUG) this.monitoring.debug(`TrxManager: Preparing to send ${payments.length} payments`);
    const transactionId = await this.send(payments);
    this.monitoring.log(`TrxManager: Sent payments. Transaction ID: ${transactionId}`);

    if (transactionId) {
      for (const { address, balance } of balances) {
        if (balance > 0) {
          if (DEBUG) this.monitoring.debug(`TrxManager: Resetting balance for address ${address}`);
          await this.db.resetBalanceByAddress(address);
          this.monitoring.log(`TrxManager: Reset balance for address ${address}`);
        }
      }
      if (DEBUG) this.monitoring.debug(`TrxManager: All balances reset for processed payments`);
    } else {
      if (DEBUG) this.monitoring.debug(`TrxManager: No transaction ID returned, skipping balance reset`);
    }
  }

  async send(outputs: IPaymentOutput[]) {
    if (DEBUG) this.monitoring.debug(`TrxManager: Initiating send for ${outputs.length} payment outputs`);
    console.log(outputs); // Consider replacing with monitoring.debug for consistency
    if (DEBUG) this.monitoring.debug(`TrxManager: Using UtxoContext: ${this.context.id}`); // Assuming UtxoContext has an id or similar identifier
    try {
      const { transactions, summary } = await createTransactions({
        entries: this.context,
        outputs,
        changeAddress: this.address,
        priorityFee: 0n
      });
      if (DEBUG) this.monitoring.debug(`TrxManager: Created ${transactions.length} transactions, finalTransactionId: ${summary.finalTransactionId}`);

      for (const transaction of transactions) {
        if (DEBUG) this.monitoring.debug(`TrxManager: Signing transaction ID: ${transaction.id}`);
        await transaction.sign([this.privateKey]);
        if (DEBUG) this.monitoring.debug(`TrxManager: Transaction ID: ${transaction.id} signed successfully`);
        if (DEBUG) this.monitoring.debug(`TrxManager: Submitting transaction ID: ${transaction.id}`);
        await transaction.submit(this.processor.rpc);
        if (DEBUG) this.monitoring.debug(`TrxManager: Transaction ID: ${transaction.id} submitted successfully`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay
        if (DEBUG) this.monitoring.debug(`TrxManager: Waited 5 seconds after submitting transaction ID: ${transaction.id}`);
      }

      if (DEBUG) this.monitoring.debug(`TrxManager: Send completed, returning finalTransactionId: ${summary.finalTransactionId}`);
      return summary.finalTransactionId;
    } catch (error) {
      if (DEBUG) this.monitoring.debug(`TrxManager: Error in send: ${error}`);
      throw error;
    }
  }

  private registerProcessor() {
    if (DEBUG) this.monitoring.debug(`TrxManager: Registering UTXO processor event listener`);
    this.processor.addEventListener("utxo-proc-start", async () => {
      if (DEBUG) this.monitoring.debug(`TrxManager: UTXO processor started, clearing context`);
      await this.context.clear();
      if (DEBUG) this.monitoring.debug(`TrxManager: Context cleared successfully`);
      if (DEBUG) this.monitoring.debug(`TrxManager: Tracking pool address: ${this.address}`);
      await this.context.trackAddresses([this.address]);
      if (DEBUG) this.monitoring.debug(`TrxManager: Pool address tracking initiated`);
    });
    if (DEBUG) this.monitoring.debug(`TrxManager: Starting UTXO processor`);
    this.processor.start();
    if (DEBUG) this.monitoring.debug(`TrxManager: UTXO processor started`);
  }

  // stopProcessor() {
  //   if (DEBUG) this.monitoring.debug(`TrxManager: Stopping UTXO processor`);
  //   this.processor.stop();
  //   if (DEBUG) this.monitoring.debug(`TrxManager: UTXO processor stopped`);
  // }
}