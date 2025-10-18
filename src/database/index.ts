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
    const minBalance = 10n * 10n ** 8n;
    // Query the pool's balances table, excluding pool and balances < 10 VE
    const res = await this.client.query(
      'SELECT address, available_balance FROM balances WHERE address != $1 AND available_balance >= $2',
      ['pool', minBalance.toString()]
    );
    return res.rows.map((row: PoolBalanceRow) => ({
      address: row.address,
      balance: BigInt(row.available_balance)
    }));
  }

  async resetBalanceByAddress(wallet: string, amount: bigint) {
    // Update the pool's balances table by subtracting the sent amount
    await this.client.query(
      'UPDATE balances SET available_balance = GREATEST(0, available_balance - $1) WHERE address = $2',
      [amount.toString(), wallet]
    );
  }

  async recordPayment(address: string, amount: bigint, txId: string) {
    // Insert a new payment record into the payments table
    const timestamp = Math.floor(Date.now() / 1000);
    await this.client.query(
      `
      INSERT INTO payments (address, amount, tx_id, timestamp, notified)
      VALUES ($1, $2, $3, $4, $5);
      `,
      [address, amount.toString(), txId, timestamp, false]
    );
  }

  async close() {
    await this.client.end();
  }
}