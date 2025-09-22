import { Client } from 'pg';

type PoolBalanceRow = {
  address: string;
  available_balance: string;
};

type PaymentRow = {
  id: string;
  address: string;
  amount: string;
  tx_id: string;
  timestamp: string;
  notified: boolean;
};

export default class Database {
  client: Client;

  constructor(connectionString: string) {
    this.client = new Client({
      connectionString: connectionString,
    });
    this.client.connect();
  }

  async getAllBalancesExcludingPool() {
    // Query the pool's balances table instead of miners_balance
    const res = await this.client.query(
      'SELECT address, available_balance FROM balances WHERE address != $1',
      ['pool']
    );
    return res.rows.map((row: PoolBalanceRow) => ({
      minerId: row.address, // Map address to minerId
      address: row.address,
      balance: BigInt(row.available_balance)
    }));
  }

  async resetBalanceByAddress(wallet: string) {
    // Update the pool's balances table
    await this.client.query(
      'UPDATE balances SET available_balance = $1 WHERE address = $2',
      [0n, wallet]
    );
  }

  async recordPayment(address: string, amount: bigint, txId: string) {
    // Insert a new payment record into the payments table
    const timestamp = Math.floor(Date.now() / 1000); // Current timestamp in seconds
    await this.client.query(
      `
      INSERT INTO payments (address, amount, tx_id, timestamp, notified)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [address, amount.toString(), txId, timestamp, false]
    );
  }

  async getPendingPayments(address: string) {
    // Query unnotified payments for an address
    const res = await this.client.query(
      'SELECT id, address, amount, tx_id, timestamp, notified FROM payments WHERE address = $1 AND notified = $2',
      [address, false]
    );
    return res.rows.map((row: PaymentRow) => ({
      id: row.id,
      address: row.address,
      amount: BigInt(row.amount),
      txId: row.tx_id,
      timestamp: Number(row.timestamp),
      notified: row.notified
    }));
  }

  async markPaymentNotified(id: string) {
    // Update the notified status of a payment
    await this.client.query(
      'UPDATE payments SET notified = $1 WHERE id = $2',
      [true, id]
    );
  }

  async close() {
    await this.client.end();
  }
}