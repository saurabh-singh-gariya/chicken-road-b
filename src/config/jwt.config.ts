import { registerAs } from '@nestjs/config';

/**
 * Default fallback values for JWT configuration.
 *
 * @remarks
 * WARNING: The default secret is for development only.
 * MUST set JWT_SECRET environment variable in production with a strong, random value.
 */
const DEFAULTS = {
  /** JWT signing secret (MUST be changed for production) */
  SECRET: 'CHANGE_ME_DEV_SECRET',
  /** Token expiration time */
  EXPIRES_IN: '1h',
} as const;

/**
 * JWT configuration interface
 */
export interface JwtConfig {
  /** Secret key for signing JWT tokens */
  secret: string;
  /** Token expiration duration (e.g., '1h', '7d', '30m') */
  expiresIn: string;
}

/**
 * JWT configuration factory.
 * Reads configuration from environment variables with fallback to defaults.
 *
 * @remarks
 * Environment variables:
 * - JWT_SECRET: Secret key for signing tokens **CRITICAL: Set a strong secret in production**
 * - JWT_EXPIRES: Token expiration time (default: '1h')
 *
 * Supported expiration formats: '1h', '7d', '30m', '1y', etc.
 *
 * @returns JWT configuration object
 */
export default registerAs(
  'jwt',
  (): JwtConfig => ({
    secret: process.env.JWT_SECRET || DEFAULTS.SECRET,
    expiresIn: process.env.JWT_EXPIRES || DEFAULTS.EXPIRES_IN,
  }),
);
