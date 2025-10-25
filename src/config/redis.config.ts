import { registerAs } from '@nestjs/config';

const FALLBACK_REDIS = {
  host: 'localhost',
  port: 6379,
  password: '', // set if you enabled requirepass in redis.conf
};

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || FALLBACK_REDIS.host,
  port: parseInt(process.env.REDIS_PORT || String(FALLBACK_REDIS.port), 10),
  password: process.env.REDIS_PASSWORD || FALLBACK_REDIS.password,
}));
