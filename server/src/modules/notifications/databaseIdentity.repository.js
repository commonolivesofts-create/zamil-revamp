/** The connected database's name (SYS_CONTEXT USERENV DB_NAME); identifies TEST vs production. */
export async function findDatabaseName(connection) {
  const result = await connection.execute(`SELECT SYS_CONTEXT('USERENV', 'DB_NAME') FROM dual`);
  return result.rows[0]?.[0] ?? null;
}
