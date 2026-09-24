// Small helpers over the Durable Object SQLite API.

/**
 * Apply schema steps in order, once each. The applied count lives in a `meta`
 * table so it survives restarts. Steps are append-only: add a new one, never
 * edit or remove a released one, and never drop tables holding player data.
 */
export function migrate(sql: SqlStorage, steps: readonly string[]): void {
  sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)')
  const row = sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'schema'").toArray()[0]
  const applied = row ? Number(row.v) : 0
  for (let i = applied; i < steps.length; i++) sql.exec(steps[i]!)
  if (steps.length > applied) sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', ?)", String(steps.length))
}
