import { isIP } from 'node:net';

export interface VpsConfig {
  readonly guildId: string;
  readonly channelId: string;
  readonly roleIds: readonly string[];
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly keyPath: string;
  readonly knownHostsPath: string;
}

const KEY_PATH = '/run/secrets/vps_ssh_key';
const KNOWN_HOSTS_PATH = '/run/secrets/vps_ssh_known_hosts';
const SNOWFLAKE = /^\d{15,22}$/;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required when VPS_SSH_ENABLED=true.`);
  return value;
}

function discordId(value: string, name: string): string {
  if (!SNOWFLAKE.test(value)) throw new Error(`${name} must be a Discord ID.`);
  return value;
}

export function loadVpsConfig(env: NodeJS.ProcessEnv = process.env): VpsConfig | null {
  const enabled = env.VPS_SSH_ENABLED?.trim() ?? '';
  if (enabled === '' || enabled === 'false') return null;
  if (enabled !== 'true') throw new Error('VPS_SSH_ENABLED must be true or false.');

  const guildId = discordId(required(env, 'VPS_ADMIN_GUILD_ID'), 'VPS_ADMIN_GUILD_ID');
  const channelId = discordId(required(env, 'VPS_ADMIN_CHANNEL_ID'), 'VPS_ADMIN_CHANNEL_ID');
  const roleIds = required(env, 'VPS_ADMIN_ROLE_IDS').split(',').map((id) => id.trim());
  if (roleIds.some((id) => !SNOWFLAKE.test(id))) {
    throw new Error('VPS_ADMIN_ROLE_IDS must contain comma-separated Discord role IDs.');
  }

  const host = required(env, 'VPS_SSH_HOST');
  if (isIP(host) === 0 && !/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host)) {
    throw new Error('VPS_SSH_HOST must be an IP address or a hostname (no SSH options).');
  }

  const portText = env.VPS_SSH_PORT?.trim() || '22';
  if (!/^\d+$/.test(portText)) throw new Error('VPS_SSH_PORT must be an integer from 1 to 65535.');
  const port = Number(portText);
  if (port < 1 || port > 65535) throw new Error('VPS_SSH_PORT must be an integer from 1 to 65535.');

  const user = required(env, 'VPS_SSH_USER');
  if (!/^[a-z_][a-z0-9_-]*\$?$/.test(user) || user === 'root') {
    throw new Error('VPS_SSH_USER must be a non-root Linux account name.');
  }

  return { guildId, channelId, roleIds, host, port, user, keyPath: KEY_PATH, knownHostsPath: KNOWN_HOSTS_PATH };
}

export function isAuthorizedVpsOperator(
  config: Pick<VpsConfig, 'guildId' | 'channelId' | 'roleIds'>,
  request: { guildId: string | null; channelId: string | null; roleIds: readonly string[] | null },
): boolean {
  return request.guildId === config.guildId
    && request.channelId === config.channelId
    && request.roleIds !== null
    && config.roleIds.some((roleId) => request.roleIds?.includes(roleId));
}

export function validateVpsCommand(input: string): string {
  // Check the original text: trim() would silently erase leading/trailing newlines.
  if (/[\u0000\r\n]/.test(input)) {
    throw new Error('Command must be 1–400 characters and contain no newline or NUL.');
  }
  const command = input.trim();
  if (!command || command.length > 400) {
    throw new Error('Command must be 1–400 characters and contain no newline or NUL.');
  }
  return command;
}
