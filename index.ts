/**
 * This script initializes the Vecnopool Payment App, sets up the necessary environment variables,
 * and schedules a balance transfer task based on configuration. It also provides progress logging 
 * every 10 minutes.
 */

import { RpcClient, Encoding, Resolver } from "./wasm/vecno";
import config from "./config/config.json";
import dotenv from 'dotenv';
import Monitoring from './src/monitoring';
import trxManager from './src/trxs';
import cron from 'node-cron';

// Debug mode setting
export let DEBUG = 0;
if (process.env.DEBUG === "1") {
  DEBUG = 1;
}

const monitoring = new Monitoring();
monitoring.log(`Main: Starting Vecnopool Payment App`);
if (DEBUG) monitoring.debug(`Main: DEBUG mode enabled, DEBUG=${DEBUG}`);

dotenv.config();
if (DEBUG) monitoring.debug(`Main: Loaded environment variables, DEBUG=${process.env.DEBUG}, TREASURY_PRIVATE_KEY=${process.env.TREASURY_PRIVATE_KEY ? 'set' : 'unset'}, DATABASE_URL=${process.env.DATABASE_URL ? 'set' : 'unset'}`);

// Environment variable checks
const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
if (!treasuryPrivateKey) {
  monitoring.error('Main: Environment variable TREASURY_PRIVATE_KEY is not set.');
  throw new Error('Environment variable TREASURY_PRIVATE_KEY is not set.');
}
if (DEBUG) monitoring.debug(`Main: Successfully obtained treasury private key`);

if (!config.network) {
  monitoring.error('Main: No network has been set in config.json');
  throw new Error('No network has been set in config.json');
}
if (DEBUG) monitoring.debug(`Main: Network Id set to ${config.network}`);
if (DEBUG) monitoring.debug(`Main: Configured nodes: ${config.node.join(', ')}`);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  monitoring.error('Main: Environment variable DATABASE_URL is not set.');
  throw new Error('Environment variable DATABASE_URL is not set.');
}
if (DEBUG) monitoring.debug(`Main: Database URL obtained successfully`);

if (DEBUG) monitoring.debug(`Main: Loading configuration parameters`);
const paymentInterval = config.paymentInterval || 2;
if (paymentInterval < 1 || paymentInterval > 24) {
  monitoring.error('Main: paymentInterval must be between 1 and 24 hours.');
  throw new Error('paymentInterval must be between 1 and 24 hours.');
}
if (DEBUG) monitoring.debug(`Main: Payment interval configured to ${paymentInterval} hours`);

if (DEBUG) monitoring.debug(`Main: Initializing RPC client`);
const rpc = new RpcClient({
  resolver: new Resolver({
    urls: config.node
  }),
  encoding: Encoding.Borsh,
  networkId: config.network,
});
if (DEBUG) monitoring.debug(`Main: RPC client initialized with network ${config.network} and nodes ${config.node.join(', ')}`);

let transactionManager: trxManager | null = null;
let rpcConnected = false;

const setupTransactionManager = () => {
  if (DEBUG) monitoring.debug(`Main: Initializing transaction manager`);
  transactionManager = new trxManager(config.network, treasuryPrivateKey, databaseUrl, rpc);
  if (DEBUG) monitoring.debug(`Main: Transaction manager initialized successfully`);
};

const startRpcConnection = async () => {
  if (DEBUG) monitoring.debug(`Main: Attempting to establish RPC connection to ${config.node.join(', ')}`);
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('RPC connection timed out after 10 seconds')), 10000);
    });
    await Promise.race([rpc.connect(), timeoutPromise]);
    if (DEBUG) monitoring.debug(`Main: RPC connection attempt successful`);
    
    const serverInfo = await rpc.getServerInfo();
    if (DEBUG) monitoring.debug(`Main: Retrieved server info - isSynced: ${serverInfo.isSynced}, hasUtxoIndex: ${serverInfo.hasUtxoIndex}`);
    if (!serverInfo.isSynced || !serverInfo.hasUtxoIndex) {
      monitoring.error('Main: Provided node is either not synchronized or lacks the UTXO index.');
      throw new Error('Provided node is either not synchronized or lacks the UTXO index.');
    }
    rpcConnected = true;
    if (DEBUG) monitoring.debug(`Main: RPC connection fully established`);
  } catch (rpcError) {
    if (DEBUG) monitoring.debug(`Main: RPC connection failed: ${rpcError}`);
    monitoring.error(`Main: RPC connection error: ${rpcError}`);
    throw new Error(`RPC connection error: ${rpcError}`);
  }
};

if (!rpcConnected) {
  if (DEBUG) monitoring.debug(`Main: Starting initial RPC connection setup`);
  try {
    await startRpcConnection();
    if (DEBUG) monitoring.debug('Main: RPC connection started successfully');
    if (DEBUG) monitoring.debug(`Main: RPC connection established, proceeding with transaction manager setup`);
    setupTransactionManager();
  } catch (error) {
    monitoring.error(`Main: Failed to start RPC connection: ${error}`);
    throw error;
  }
}

cron.schedule(`*/10 * * * *`, async () => {
  const now = new Date();
  const minutes = now.getMinutes();
  const hours = now.getHours();
  if (DEBUG) monitoring.debug(`Main: Cron tick - Current time: ${now.toISOString()}, hours: ${hours}, minutes: ${minutes}`);

  const isPaymentTime = minutes === 0 && (hours % paymentInterval === 0);
  if (DEBUG) monitoring.debug(`Main: Checking if payment time - isPaymentTime: ${isPaymentTime}`);

  if (isPaymentTime && rpcConnected) {
    monitoring.log('Main: Running scheduled balance transfer');
    if (DEBUG) monitoring.debug(`Main: Starting balance transfer process`);
    try {
      await transactionManager!.transferBalances();
      if (DEBUG) monitoring.debug(`Main: Balance transfer completed successfully`);
    } catch (transactionError) {
      monitoring.error(`Main: Transaction manager error: ${transactionError}`);
      if (DEBUG) monitoring.debug(`Main: Detailed transaction error: ${transactionError}`);
    }
  } else if (isPaymentTime && !rpcConnected) {
    monitoring.error('Main: RPC connection is not established before balance transfer');
    if (DEBUG) monitoring.debug(`Main: Skipped balance transfer due to missing RPC connection`);
  }
});

// Progress indicator logging every 10 minutes
setInterval(() => {
  const now = new Date();
  const minutes = now.getMinutes();
  const hours = now.getHours();

  const nextTransferHours = paymentInterval - (hours % paymentInterval);
  const remainingMinutes = nextTransferHours * 60 - minutes;
  const remainingTime = remainingMinutes === nextTransferHours * 60 ? 0 : remainingMinutes;

  if (DEBUG) monitoring.debug(`Main: Progress update - ${remainingTime} minutes until the next balance transfer`);
}, 10 * 60 * 1000); // 10 minutes in milliseconds

monitoring.log(`Main: Scheduled balance transfer every ${paymentInterval} hours`);
if (DEBUG) monitoring.debug(`Main: Application fully initialized and running`);