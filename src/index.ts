import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { loadVpsConfig } from './vps-config.js';
import { handleVpsInteraction, registerVpsCommand } from './vps-discord.js';
import { abortSshCommands, assertSshFiles } from './vps-ssh.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

let shuttingDown = false;

function shutdown(reason: string, exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Shutting down (${reason}).`);
  abortSshCommands();
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

client.once(Events.ClientReady, (readyClient) => {
  logger.info(`Discord client ready as ${readyClient.user.tag} (${readyClient.user.id}).`);
});

client.on(Events.Error, (error) => {
  logger.error('Discord client error.', error);
});

async function main(): Promise<void> {
  const config = loadConfig();
  const vpsConfig = loadVpsConfig();
  if (vpsConfig) {
    assertSshFiles(vpsConfig);
    client.once(Events.ClientReady, () => {
      void registerVpsCommand(client, vpsConfig).catch(() => {
        logger.error('VPS SSH command registration failed. Check guild access and command name conflicts.');
      });
    });
    client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      void handleVpsInteraction(interaction, vpsConfig).catch(() => {
        logger.error('VPS SSH interaction failed unexpectedly.');
      });
    });
    logger.info('VPS SSH integration enabled (guild-only, dedicated non-root account).');
  }
  await client.login(config.discordBotToken);
}

main().catch((error: unknown) => {
  logger.error('Discord bot failed to start.', error);
  shutdown('startup failure', 1);
});
