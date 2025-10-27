import Logger from './Logger';
import newrelicMetric from '../utils/newrelic';
import { performance, PerformanceObserver } from 'perf_hooks';

// Create a single observer instance
const perfObserver = new PerformanceObserver((items) => {
  items.getEntries().forEach((entry) => {
    try {
      newrelicMetric.pushCustomMetric(
        { latency: { [entry.name]: entry.duration } },
        entry.toJSON()
      );
    } catch (err) {
      Logger.error('[PERF_METRIC] error pushing custom metric', err);
    }
  });
});

try {
  perfObserver.observe({ entryTypes: ['measure'], buffered: true });
  Logger.info('[PERF_METRIC] Performance observer initialized');
} catch (err) {
  Logger.error('[PERF_METRIC] error initializing observer', err);
}

/**
 * Marks the start of a performance measurement.
 */
export const startPerf = (type: string, uniqueBatchId: string, clientId?: string): void => {
  try {
    const startId = `${type}_start_${uniqueBatchId}`;
    performance.mark(startId, { detail: clientId });
  } catch (err) {
    Logger.error('[PERF_METRIC] error at startPerf', err);
  }
};

/**
 * Marks the end of a performance measurement and records duration.
 */
export const endPerf = (type: string, uniqueBatchId: string, clientId?: string): void => {
  try {
    const startId = `${type}_start_${uniqueBatchId}`;
    const endId = `${type}_end_${uniqueBatchId}`;

    performance.mark(endId, { detail: clientId });
    performance.measure(type, { start: startId, end: endId, detail: clientId });
  } catch (err) {
    Logger.error('[PERF_METRIC] error at endPerf', err);
  }
};
