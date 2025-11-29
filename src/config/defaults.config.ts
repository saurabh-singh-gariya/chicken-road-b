/**
 * Centralized default configuration values used throughout the application.
 * All default values should be defined here for better maintainability and consistency.
 */
export const DEFAULTS = {
  // Application Configuration
  APP: {
    PORT: 3000,
    ENV: 'production',
    ENABLE_AUTH: true,
  },

  // Database Configuration Keys (matches DB structure)
  betConfig: {
    minBetAmount: '0.01',
    maxBetAmount: '150.00',
    maxWinAmount: '10000.00',
    defaultBetAmount: '0.600000000000000000',
    betPresets: ['0.5', '1', '2', '7'],
    decimalPlaces: '2',
    currency: 'INR',
  },

  coefficients: {
    EASY: [
      '1.03', '1.07', '1.12', '1.17', '1.23', '1.29', '1.36', '1.44',
      '1.53', '1.63', '1.75', '1.88', '2.04', '2.22', '2.45', '2.72',
      '3.06', '3.50', '4.08', '4.90', '6.13', '6.61', '9.81', '19.44',
    ],
    MEDIUM: [
      '1.12', '1.28', '1.47', '1.70', '1.98', '2.33', '2.76', '3.32',
      '4.03', '4.96', '6.20', '6.91', '8.90', '11.74', '15.99', '22.61',
      '33.58', '53.20', '92.17', '182.51', '451.71', '1788.80',
    ],
    HARD: [
      '1.23', '1.55', '1.98', '2.56', '3.36', '4.49', '5.49', '7.53',
      '10.56', '15.21', '22.59', '34.79', '55.97', '94.99', '172.42',
      '341.40', '760.46', '2007.63', '6956.47', '41321.43',
    ],
    DAREDEVIL: [
      '1.63', '2.80', '4.95', '9.08', '15.21', '30.12', '62.96', '140.24',
      '337.19', '890.19', '2643.89', '9161.08', '39301.05', '233448.29', '2542251.93',
    ],
  },

  hazardConfig: {
    totalColumns: 15,
    hazardRefreshMs: 5000,
    hazards: {
      EASY: 3,
      MEDIUM: 4,
      HARD: 5,
      DAREDEVIL: 7,
    },
  },

  // Game Configuration (runtime constants not stored in DB)
  GAME: {
    LEADER_LEASE_TTL: 5, // seconds
    DECIMAL_PLACES: 3, // Internal precision (betConfig.decimalPlaces is for display)
    INITIAL_STEP: -1,
    PLATFORM_NAME: 'In-out',
    GAME_TYPE: 'CRASH',
    GAME_CODE: 'chicken-road-2',
    GAME_NAME: 'chicken-road-2',
    GAME_MODE: 'chicken-road-two',
    SETTLEMENT_AMOUNT_ZERO: 0.0,
    BET_HISTORY_LIMIT: 30,
    BET_HISTORY_DAYS: 7,
    DEFAULT_COEFF: '1',
    DEFAULT_MULTIPLIER: 1,
    HAZARD_REFRESH_MIN_MS: 2000,
    HAZARD_REFRESH_MAX_MS: 30000,
    HAZARD_TTL_MULTIPLIER: 1.5,
    HAZARD_HISTORY_LIMIT: 20,
  },

  // Currency and Balance
  CURRENCY: {
    DEFAULT: 'INR',
    DEFAULT_BALANCE: '1000000',
  },

  // Bet Configuration
  BET: {
    DEFAULT_LIMIT: 50,
    DEFAULT_STATUS: 'placed',
    DEFAULT_PLATFORM: 'SPADE',
    DEFAULT_GAME_TYPE: 'LIVE',
    DEFAULT_GAME_CODE: 'chicken-road-2',
    DEFAULT_GAME_NAME: 'ChickenRoad',
    DEFAULT_IS_PREMIUM: false,
    DEFAULT_BET_RANGES: {
      INR: ['0.01', '150.00'],
    },
  },

  // User Configuration
  USER: {
    DEFAULT_LANGUAGE: 'en',
    DEFAULT_ADAPTIVE: 'true',
    DEFAULT_AVATAR: null,
  },

  // Last Win Configuration
  LAST_WIN: {
    DEFAULT_USERNAME: 'Salmon Delighted Loon',
    DEFAULT_WIN_AMOUNT: '306.00',
    DEFAULT_CURRENCY: 'USD',
    FALLBACK_USERNAME: 'UNKNOWN',
    FALLBACK_WIN_AMOUNT: '0',
    FALLBACK_CURRENCY: 'INR',
  },

  // Fairness/Seeds Configuration
  FAIRNESS: {
    LEGACY_CLIENT_SEED: 'e0b4c48b46701588',
    CLIENT_SEED_LENGTH: 16,
  },

  // Game Payloads Configuration
  GAME_PAYLOADS: {
    GAME_TYPE: 'CRASH',
    GAME_CODE: 'chicken-road-two',
    GAME_NAME: 'chicken-road-2',
    PLATFORM: 'In-out',
    SETTLE_TYPE: 'platformTxId',
  },

  // Frontend/Host Configuration
  FRONTEND: {
    DEFAULT_HOST: 'gscr.chicken-road-twoinout.live',
  },

  // Redis Configuration
  REDIS: {
    DEFAULT_TTL: 3600,
    CONFIG_KEY: 'redis.TTL',
    SESSION_TTL_MS: 3600000, // 1 hour in milliseconds
    SESSION_TTL_CONFIG_KEY: 'game.session.ttl.ms',
  },

  // JWT Configuration
  JWT: {
    DEFAULT_SECRET: 'CHANGE_ME_DEV_SECRET',
    DEFAULT_EXPIRES_IN: '1h',
  },

  // Database Configuration
  DATABASE: {
    DEFAULT_HOST: 'localhost',
    DEFAULT_PORT: 3306,
    DEFAULT_USERNAME: 'root',
    DEFAULT_PASSWORD: '',
    DEFAULT_DATABASE: 'chickenroad',
    DEFAULT_SYNCHRONIZE: true,
  },

  // Logger Configuration
  LOGGER: {
    DEFAULT_LEVEL: 'info',
    DEFAULT_LOG_DIR: 'logs',
    DEFAULT_ENABLE_FILE_LOGGING: true,
  },

  // Response Configuration
  RESPONSE: {
    DEFAULT_SUCCESS_DESC: 'OK',
  },

  // Error Messages
  ERROR_MESSAGES: {
    ACTIVE_SESSION_EXISTS: 'active_session_exists',
    VALIDATION_FAILED: 'validation_failed',
    INVALID_BET_AMOUNT: 'invalid_bet_amount',
    AGENT_REJECTED: 'agent_rejected',
    INVALID_DIFFICULTY_CONFIG: 'invalid_difficulty_config',
    NO_ACTIVE_SESSION: 'no_active_session',
    INVALID_STEP_SEQUENCE: 'invalid_step_sequence',
    SETTLEMENT_FAILED: 'settlement_failed Please contact support',
  },
} as const;

