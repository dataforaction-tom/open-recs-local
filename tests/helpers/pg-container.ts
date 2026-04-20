import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export type StartedPg = {
  container: StartedPostgreSqlContainer;
  url: string;
};

/**
 * Start a pgvector/pgvector:pg16 container and return the started container + connection URL.
 * Caller is responsible for `container.stop()` in afterAll.
 */
export async function startPostgres(): Promise<StartedPg> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  return { container, url: container.getConnectionUri() };
}
