import { loadConfig, type WorkerConfig } from './config';
import { INCIDENT_ENRICHMENT_QUEUE } from './contract';
import { startEnrichmentWorker, WORKER_CONCURRENCY } from './enrichment-worker';
import { consoleLogger as logger, errorMessage } from './logger';

function main(): void {
  const worker = startEnrichmentWorker(loadConfigOrExit(), { logger });
  logger.info(`Consuming ${INCIDENT_ENRICHMENT_QUEUE} with concurrency ${WORKER_CONCURRENCY}`);

  const shutDown = (signal: NodeJS.Signals) => {
    logger.info(`${signal} received, shutting down`);
    // Exit explicitly: during a Redis outage BullMQ's long-poll watchdog outlives the close and
    // would hold the process open for several more seconds.
    worker.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error(`Shutdown failed: ${errorMessage(error)}`);
        process.exit(1);
      },
    );
  };
  process.once('SIGTERM', shutDown);
  process.once('SIGINT', shutDown);
}

function loadConfigOrExit(): WorkerConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    logger.error(errorMessage(error));
    process.exit(1);
  }
}

main();
