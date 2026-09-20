import { createHash } from 'node:crypto';
import {
  type ChatInputCommandInteraction,
  type Client,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { logger } from './logger.js';
import { isAuthorizedVpsOperator, validateVpsCommand, type VpsConfig } from './vps-config.js';
import { executeSshCommand, type SshResult } from './vps-ssh.js';

const COMMAND_NAME = 'xplay-vps';
const COMMAND_DESCRIPTION = 'XPlay VPS SSH management (operators only)';

export async function registerVpsCommand(client: Client, config: VpsConfig): Promise<void> {
  if (!client.application) throw new Error('Discord application is not ready.');
  const global = await client.application.commands.fetch();
  if (global.some((command) => command.name === COMMAND_NAME)) {
    throw new Error('VPS command name collides with an existing global command.');
  }
  const guild = await client.guilds.fetch(config.guildId);
  const existing = (await guild.commands.fetch()).find((command) => command.name === COMMAND_NAME);
  if (existing) {
    if (existing.description !== COMMAND_DESCRIPTION) {
      throw new Error('VPS command name collides with an existing guild command.');
    }
    logger.info('VPS SSH slash command is already registered in the operator guild.');
    return;
  }

  const command = new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription(COMMAND_DESCRIPTION)
    .setDefaultMemberPermissions(0n);
  command.addSubcommand((subcommand) => subcommand
    .setName('exec')
    .setDescription('Execute one command using the dedicated non-root VPS account')
    .addStringOption((option) => option
      .setName('command')
      .setDescription('One non-interactive shell command (max 400 characters)')
      .setRequired(true)
      .setMaxLength(400)));
  await guild.commands.create(command.toJSON());
  logger.info('VPS SSH slash command registered in the operator guild.');
}

export function formatSshResult(result: SshResult): string {
  const summary = result.outcome === 'exit'
    ? `終了コード: ${result.exitCode ?? '不明'}`
    : result.outcome === 'timeout' ? 'タイムアウト（20秒）'
      : result.outcome === 'output-limit' ? '出力上限（8 KiB）超過により中断'
        : 'SSH接続・起動エラー';
  const output = (result.output || '(出力なし)').replaceAll('```', '``\u200b`').slice(0, 1_500);
  return `${summary} / 所要時間: ${result.durationMs}ms\n\`\`\`text\n${output}\n\`\`\``;
}

export async function handleVpsInteraction(
  interaction: ChatInputCommandInteraction,
  config: VpsConfig,
): Promise<void> {
  if (interaction.commandName !== COMMAND_NAME) return;

  if (!interaction.inCachedGuild() || !isAuthorizedVpsOperator(config, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    roleIds: [...interaction.member.roles.cache.keys()],
  })) {
    await interaction.reply({ content: 'このコマンドを実行する権限がありません。', flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.options.getSubcommand(false) !== 'exec') {
    await interaction.reply({ content: '未対応の操作です。', flags: MessageFlags.Ephemeral });
    return;
  }

  let command: string;
  try {
    command = validateVpsCommand(interaction.options.getString('command', true));
  } catch {
    await interaction.reply({ content: 'コマンドは改行なしの1～400文字で指定してください。', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const requestId = interaction.id;
  const digest = createHash('sha256').update(command).digest('hex').slice(0, 16);
  // Never log command contents or SSH output: either can contain credentials.
  logger.info(`VPS SSH requested: request=${requestId} user=${interaction.user.id} commandSha256Prefix=${digest}`);
  try {
    const result = await executeSshCommand(config, command);
    logger.info(`VPS SSH finished: request=${requestId} outcome=${result.outcome} code=${result.exitCode ?? 'null'} durationMs=${result.durationMs}`);
    await interaction.editReply({ content: formatSshResult(result), allowedMentions: { parse: [] } });
  } catch {
    logger.error(`VPS SSH unexpected failure: request=${requestId}`);
    await interaction.editReply({ content: 'SSH処理でエラーが発生しました。Botログを確認してください。', allowedMentions: { parse: [] } });
  }
}
