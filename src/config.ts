export interface AppConfig {
  readonly discordBotToken: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const discordBotToken = env.DISCORD_BOT_TOKEN?.trim();

  if (!discordBotToken) {
    throw new Error('DISCORD_BOT_TOKEN is required.');
  }

  return { discordBotToken };
}
