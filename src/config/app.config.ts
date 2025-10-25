import { registerAs } from '@nestjs/config';

// Single config export with hardcoded fallbacks (used when env vars missing)
const FALLBACK_APP_PORT = 3000;
const FALLBACK_ENV = 'production';
const FALLBACK_ENABLE_AUTH = true; // set false to disable auth by default

export default registerAs('app', () => ({
  port: parseInt(process.env.APP_PORT || String(FALLBACK_APP_PORT), 10),
  env: process.env.APP_ENV || FALLBACK_ENV,
  enableAuth:
    process.env.ENABLE_AUTH === undefined
      ? FALLBACK_ENABLE_AUTH
      : process.env.ENABLE_AUTH !== 'false',
}));
