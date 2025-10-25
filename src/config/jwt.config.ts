import { registerAs } from '@nestjs/config';

const FALLBACK_JWT = {
  secret: 'CHANGE_ME_DEV_SECRET', // replace for production
  expiresIn: '1h',
};

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || FALLBACK_JWT.secret,
  expiresIn: process.env.JWT_EXPIRES || FALLBACK_JWT.expiresIn,
}));
