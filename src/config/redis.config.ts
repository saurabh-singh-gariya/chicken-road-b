import { registerAs } from '@nestjs/config';

/**
 * Default fallback values for Redis configuration.
 */
const DEFAULTS = {
  /** Redis server host address */
  HOST: 'localhost',
  /** Redis default port */
  PORT: 6379,
  /** Redis authentication password (empty if auth is disabled) */
  PASSWORD: '',
} as const;

/**
 * Redis configuration interface
 */
export interface RedisConfig {
  /** Redis server host */
  host: string;
  /** Redis server port */
  port: number;
  /** Redis authentication password (if requirepass is enabled) */
  password: string;
}

/**
 * Redis configuration factory.
 * Reads configuration from environment variables with fallback to defaults.
 *
 * @remarks
 * Environment variables:
 * - REDIS_HOST: Redis server host (default: 'localhost')
 * - REDIS_PORT: Redis server port (default: 6379)
 * - REDIS_PASSWORD: Redis password (default: '') - set if requirepass is enabled in redis.conf
 *
 * @returns Redis configuration object
 */
export default registerAs(
  'redis',
  (): RedisConfig => ({
    host: process.env.REDIS_HOST || DEFAULTS.HOST,
    port: parseInt(process.env.REDIS_PORT || String(DEFAULTS.PORT), 10),
    password: process.env.REDIS_PASSWORD || DEFAULTS.PASSWORD,
  }),
);
