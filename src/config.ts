export interface NoticeNotificationConfig {
  readonly channelId: string;
  readonly sharedSecret: string;
  readonly port: number;
}

export interface AppConfig {
  readonly discordBotToken: string;
  readonly noticeNotifications?: NoticeNotificationConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const discordBotToken = env.DISCORD_BOT_TOKEN?.trim();
  if (!discordBotToken) throw new Error('DISCORD_BOT_TOKEN is required.');

  const channelId = env.NOTICE_CHANNEL_ID?.trim();
  const sharedSecret = env.NOTICE_NOTIFY_SECRET?.trim();
  const configured = Boolean(channelId || sharedSecret);
  if (!configured) return { discordBotToken };
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
  return { discordBotToken, noticeNotifications: { channelId, sharedSecret, port } };
}
