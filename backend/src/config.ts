// Mapper for environment variables
export const environment = process.env.NODE_ENV || 'development';
export const port = process.env.PORT || '3000';
export const hostname = process.env.HOSTNAME || 'localhost';

export const app = {
  name: process.env.APP_NAME || 'app',
  version: process.env.APP_VERSION || '0.0.1',
  region: process.env.REGION || 'unknown',
};

export const db = {
  uri: process.env.DATABASE_URL || '',
};

export const redis = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || '6379',
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || '0',
};

export const newrelic = {
  enabled: process.env.NEW_RELIC_ENABLED == 'true' ? true : false,
  appName: process.env.NEW_RELIC_APP_NAME || app.name,
  logLevel: process.env.NEW_RELIC_LOG_LEVEL || 'info',
  apiKey: process.env.NEW_RELIC_API_KEY || '',
};

export const corsOrigin = process.env.CORS_ORIGIN || '*';

export const tokenInfo = {
  accessTokenValidityDays: parseInt(process.env.ACCESS_TOKEN_VALIDITY_SEC || '0'),
  refreshTokenValidityDays: parseInt(process.env.REFRESH_TOKEN_VALIDITY_SEC || '0'),
  issuer: process.env.TOKEN_ISSUER || '',
  audience: process.env.TOKEN_AUDIENCE || '',
};

export const logDirectory = process.env.LOG_DIR || 'logs';
