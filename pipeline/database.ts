import { Pool, type PoolClient } from "pg";
import type { QueryFn } from "../crawler/fetch/queue-store";

export interface PipelineDatabase extends QueryFn {
  transaction<T>(run: (db: QueryFn) => Promise<T>): Promise<T>;
}

/** Each transaction uses one checked-out client, never pool.query. */
export function connectDatabase(connectionString: string) {
  if (!connectionString) throw new Error("DATABASE_URL is required for live pipeline commands.");
  const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 15000 });
  const query = async (text: string, values?: unknown[]) => {
    const result = await pool.query(text, values);
    return { rows: result.rows as Record<string, unknown>[] };
  };
  const db: PipelineDatabase = {
    query,
    async transaction<T>(run: (db: QueryFn) => Promise<T>): Promise<T> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await run({
          query: async (text, values) => {
            const response = await client.query(text, values);
            return { rows: response.rows as Record<string, unknown>[] };
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
  return { db, close: () => pool.end() };
}
