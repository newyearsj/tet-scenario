import "server-only";
import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;
const globalDatabase = globalThis as typeof globalThis & { __testAgentSql?: SqlClient };

export function getDatabase(): SqlClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!globalDatabase.__testAgentSql) {
    globalDatabase.__testAgentSql = postgres(connectionString, {
      ssl: "require",
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15,
      max_lifetime: 60 * 10,
      onnotice: () => undefined,
    });
  }
  return globalDatabase.__testAgentSql;
}
