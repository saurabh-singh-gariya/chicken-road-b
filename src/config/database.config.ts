import { registerAs } from '@nestjs/config';

/**
 * Default fallback values for database configuration.
 *
 * @remarks
 * WARNING: These are development defaults. Always use environment variables
 * for production deployments, especially for sensitive values like passwords.
 */
const DEFAULTS = {
  /** Database host address */
  HOST: 'localhost',
  /** MySQL default port */
  PORT: 3306,
  /** Database username (change for production) */
  USERNAME: 'root',
  /** Database password (MUST be set via environment variable in production) */
  PASSWORD: '',
  /** Database name */
  DATABASE: 'chickenroad',
  /** Auto-synchronize schema (DISABLE in production - use migrations instead) */
  SYNCHRONIZE: true,
} as const;

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  /** Database server host */
  host: string;
  /** Database server port */
  port: number;
  /** Database authentication username */
  username: string;
  /** Database authentication password */
  password: string;
  /** Database name to connect to */
  database: string;
  /** Whether to auto-synchronize entity schemas (dangerous in production) */
  synchronize: boolean;
}

/**
 * Database configuration factory.
 * Reads configuration from environment variables with fallback to defaults.
 *
 * @remarks
 * Environment variables:
 * - DB_HOST: Database host (default: 'localhost')
 * - DB_PORT: Database port (default: 3306)
 * - DB_USERNAME: Database username (default: 'root')
 * - DB_PASSWORD: Database password (default: '') **IMPORTANT: Set this in production**
 * - DB_DATABASE: Database name (default: 'chickenroad')
 * - DB_SYNCHRONIZE: Auto-sync schema, 'true'/'false' (default: true) **DISABLE in production**
 *
 * @returns Database configuration object
 */
export default registerAs(
  'database',
  (): DatabaseConfig => ({
    host: process.env.DB_HOST || DEFAULTS.HOST,
    port: parseInt(process.env.DB_PORT || String(DEFAULTS.PORT), 10),
    username: process.env.DB_USERNAME || DEFAULTS.USERNAME,
    password: process.env.DB_PASSWORD || DEFAULTS.PASSWORD,
    database: process.env.DB_DATABASE || DEFAULTS.DATABASE,
    synchronize:
      process.env.DB_SYNCHRONIZE === undefined
        ? DEFAULTS.SYNCHRONIZE
        : process.env.DB_SYNCHRONIZE === 'true',
  }),
);
