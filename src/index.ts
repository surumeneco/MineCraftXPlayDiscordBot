import type { Server } from 'node:http';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { startNoticeReceiver } from './notice-notifications.js';
import { startRequestReceiver } from './requests.js';
import { startTerritoryReceiver } from './territory-notifications.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

let shuttingDown = false;
let noticeServer: Server | undefined;
let requestServer: Server | undefined;
let territoryServer: Server | undefined;

function shutdown(reason: string, exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Shutting down (${reason}).`);
  noticeServer?.close();
  requestServer?.close();
  territoryServer?.close();
  client.destroy();
  process.exitCode = exitCode;
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception.', error);
  shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection.', reason);
  shutdown('unhandledRejection', 1);
});

client.on(Events.Error, (error) => {
  logger.error('Discord client error.', error);
});

async function main(): Promise<void> {
  const config = loadConfig();
  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Discord client ready as ${readyClient.user.tag} (${readyClient.user.id}).`);
    if (config.noticeNotifications) {
      void startNoticeReceiver(readyClient, config.noticeNotifications).then((server) => {
        noticeServer = server;
        logger.info(`Notice notification receiver listening on port ${config.noticeNotifications?.port}.`);
      }).catch((error: unknown) => {
        logger.error('Failed to start notice notification receiver.', error);
        shutdown('notification receiver failure', 1);
      });
    }
    if (config.requests) {
      void startRequestReceiver(readyClient, config.requests).then((server) => {
        requestServer = server;
        logger.info(`Request receiver listening on port ${config.requests?.port}.`);
      }).catch((error: unknown) => {
        logger.error('Failed to start request receiver.', error);
        shutdown('request receiver failure', 1);
      });
    }
    if (config.territoryNotifications) {
      void startTerritoryReceiver(readyClient, config.territoryNotifications).then((server) => {
        territoryServer = server;
        logger.info(`Territory notification receiver listening on port ${config.territoryNotifications?.port}.`);
      }).catch((error: unknown) => {
        logger.error('Failed to start territory notification receiver.', error);
        shutdown('territory receiver failure', 1);
      });
    }
  });
  await client.login(config.discordBotToken);
}

main().catch((error: unknown) => {
  logger.error('Discord bot failed to start.', error);
  shutdown('startup failure', 1);
});
