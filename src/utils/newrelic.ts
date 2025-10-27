import Logger from '../core/Logger';
import { environment, port, hostname, app, newrelic } from '../config';
import { telemetry } from '@newrelic/telemetry-sdk';
import { isEmpty, map, flatMap } from 'lodash';
import moment from 'moment';

export interface MetricCategory {
  [key: string]: number;
}

export interface CustomMetric {
  latency?: MetricCategory;
  error?: MetricCategory;
  success?: MetricCategory;
}

interface EnvConfig {
  NEW_RELIC_API_KEY: string;
  APP_NAME: string;
  APP_VERSION: string;
  NODE_ENV: string;
  REGION: string;
  HOSTNAME: string;
  PORT: string;
}

const getEnvConfig = (): EnvConfig => ({
  NEW_RELIC_API_KEY: newrelic.apiKey,
  APP_NAME: app.name,
  APP_VERSION: app.version,
  NODE_ENV: environment,
  REGION: app.region,
  HOSTNAME: hostname,
  PORT: port,
});

const config = getEnvConfig();

// Create a single metric client for the process
const metricClient = new telemetry.metrics.MetricClient({
  apiKey: newrelic.apiKey,
});

/**
 * Push custom app metrics to New Relic
 * e.g., latency, error, success counts
 */
const pushCustomMetric = (customMetrics: CustomMetric, meta: any): void => {
  try {
    if (isEmpty(customMetrics)) return;

    const metrics: any[] = flatMap(customMetrics, (subMetrics, category) =>
      map(subMetrics, (value, key) => ({
        name: `${config.APP_NAME}.${category}.${key}`,
        type: category === 'latency' ? 'summary' : 'count',
        value:
          category === 'latency'
            ? {
                count: 1,
                sum: value,
                min: value,
                max: value,
              }
            : value,
        'interval.ms': 0,
        timestamp: moment().valueOf(),
      }))
    );

    const batch = new telemetry.metrics.MetricBatch({
      'service.name': config.APP_NAME,
      'service.version': config.APP_VERSION,
      environment: config.NODE_ENV,
      'host.name': config.HOSTNAME,
      region: config.REGION,
      'client.id': meta?.detail?.clientId || meta?.detail,
      timestamp: moment().valueOf(),
    });

    metrics.forEach((metric) => batch.addMetric(metric));

    metricClient.send(batch, (err: any) => {
      if (err) Logger.error('[NEWRELIC] metric send error', err);
    });
  } catch (err) {
    Logger.error('[NEWRELIC] metric error', err);
  }
};

export default {
  pushCustomMetric,
};
