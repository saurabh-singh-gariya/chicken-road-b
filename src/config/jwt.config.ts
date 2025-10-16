import { registerAs } from '@nestjs/config';

// JWT configuration values. In production, override via environment variables:
// JWT_SECRET, JWT_EXPIRES (e.g. '3600s', '1h').
export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'CHANGE_ME_DEV_SECRET',
  expiresIn: process.env.JWT_EXPIRES || '1h',
}));
