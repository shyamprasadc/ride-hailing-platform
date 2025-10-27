'use strict';

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'ride-hailing-backend'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || 'info',
    enabled: process.env.NEW_RELIC_ENABLED === 'true',
  },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*',
    ],
  },
  distributed_tracing: {
    enabled: true,
  },
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 'apdex_f',
    record_sql: 'obfuscated',
  },
  error_collector: {
    enabled: true,
    ignore_status_codes: [401, 404],
  },
  browser_monitoring: {
    enable: false,
  },
  slow_sql: {
    enabled: true,
  },
  labels: {
    environment: process.env.NODE_ENV || 'development',
  },
};