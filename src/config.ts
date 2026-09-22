import type { RequestReceiverConfig } from './requests.js';

export interface NoticeNotificationConfig {
  readonly channelId: string;
  readonly sharedSecret: string;
  readonly port: number;
}

export interface AppConfig {
  readonly discordBotToken: string;
  readonly noticeNotifications?: NoticeNotificationConfig;
  readonly requests?: RequestReceiverConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const discordBotToken = env.DISCORD_BOT_TOKEN?.trim();
  if (!discordBotToken) throw new Error('DISCORD_BOT_TOKEN is required.');

  const channelId = env.NOTICE_CHANNEL_ID?.trim();
  const sharedSecret = env.NOTICE_NOTIFY_SECRET?.trim();
  let noticeNotifications: NoticeNotificationConfig | undefined;
  if (channelId || sharedSecret) {
    if (!channelId || !/^\d{15,22}$/.test(channelId)) {
      throw new Error('NOTICE_CHANNEL_ID must be a Discord channel ID when notices are enabled.');
    }
    if (!sharedSecret || Buffer.byteLength(sharedSecret) < 32) {
      throw new Error('NOTICE_NOTIFY_SECRET must be at least 32 bytes when notices are enabled.');
    }
    const port = Number(env.NOTICE_HTTP_PORT || '3101');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('NOTICE_HTTP_PORT must be a valid TCP port.');
    }
    noticeNotifications = { channelId, sharedSecret, port };
  }

  const requestChannel = env.REQUEST_CHANNEL_ID?.trim();
  const requestSecret = env.REQUEST_NOTIFY_SECRET?.trim();
  let requests: RequestReceiverConfig | undefined;
  if (requestChannel || requestSecret) {
    if (!requestChannel || !/^\d{15,22}$/.test(requestChannel)) {
      throw new Error('REQUEST_CHANNEL_ID must be a Discord channel ID when requests are enabled.');
    }
    if (!requestSecret || Buffer.byteLength(requestSecret) < 32) {
      throw new Error('REQUEST_NOTIFY_SECRET must be at least 32 bytes when requests are enabled.');
    }
    const port = Number(env.REQUEST_HTTP_PORT || '3102');
    if (!Number.isInteger(port) || port < 1 || port > 65535 || port === noticeNotifications?.port) {
      throw new Error('REQUEST_HTTP_PORT must be a valid TCP port distinct from NOTICE_HTTP_PORT.');
    }
    requests = { channelId: requestChannel, sharedSecret: requestSecret, port };
  }
  return { discordBotToken, ...(noticeNotifications ? { noticeNotifications } : {}), ...(requests ? { requests } : {}) };
}
