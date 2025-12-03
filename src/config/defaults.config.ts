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
      '1.01', '1.03', '1.06', '1.10', '1.15', '1.19', '1.24', '1.30',
      '1.35', '1.42', '1.48', '1.56', '1.65', '1.75', '1.85', '1.98',
      '2.12', '2.28', '2.47', '2.70', '2.96', '3.28', '3.70', '4.11',
      '4.64', '5.39', '6.50', '8.36', '12.08', '23.24',
    ],
    MEDIUM: [
      '1.08', '1.21', '1.37', '1.56', '1.78', '2.05', '2.37', '2.77',
      '3.24', '3.85', '4.62', '5.61', '6.91', '8.64', '10.99', '14.29',
      '18.96', '26.07', '37.24', '53.82', '82.36', '137.59', '265.35', '638.82',
      '2457.00',
    ],
    HARD: [
      '1.18', '1.46', '1.83', '2.31', '2.95', '3.82', '5.02', '6.66',
      '9.04', '12.52', '17.74', '25.80', '38.71', '60.21', '97.34', '166.87',
      '305.94', '595.86', '1283.03', '3267.64', '10898.54', '62162.09',
    ],
    DAREDEVIL: [
      '1.44', '2.21', '3.45', '5.53', '9.09', '15.30', '26.78', '48.70',
      '92.54', '185.08', '391.25', '894.28', '2235.72', '6096.15', '18960.33', '72432.75',
      '379632.82', '3608855.25',
    ],
  },

  hazardConfig: {
    // totalColumns per difficulty - MUST match coefficients array length for each difficulty
    // EASY: 30, MEDIUM: 25, HARD: 22, DAREDEVIL: 18
    totalColumns: {
      EASY: 30,    // Must equal coefficients.EASY.length
      MEDIUM: 25,  // Must equal coefficients.MEDIUM.length
      HARD: 22,    // Must equal coefficients.HARD.length
      DAREDEVIL: 18, // Must equal coefficients.DAREDEVIL.length
    },
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
    SESSION_TTL: 3600, // 1 hour in seconds
    SESSION_TTL_CONFIG_KEY: 'game.session.ttl',
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

