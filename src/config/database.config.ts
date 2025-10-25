import { registerAs } from '@nestjs/config';

// Hardcoded DB fallbacks (adjust password!). Prefer env for secrets.
const FALLBACK_DB = {
  host: 'localhost',
  port: 3306,
  username: 'root', // change if you created a dedicated MySQL user
  password: '', // SET REAL PASSWORD or use env DB_PASSWORD
  database: 'chickenroad',
  synchronize: true, // disable in production & use migrations
};

export default registerAs('database', () => ({
  host: process.env.DB_HOST || FALLBACK_DB.host,
  port: parseInt(process.env.DB_PORT || String(FALLBACK_DB.port), 10),
  username: process.env.DB_USERNAME || FALLBACK_DB.username,
  password: process.env.DB_PASSWORD || FALLBACK_DB.password,
  database: process.env.DB_DATABASE || FALLBACK_DB.database,
  synchronize:
    process.env.DB_SYNCHRONIZE === undefined
      ? FALLBACK_DB.synchronize
      : process.env.DB_SYNCHRONIZE === 'true',
}));
