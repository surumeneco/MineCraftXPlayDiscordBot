import { describe, expect, it } from 'vitest';
import { isAuthorizedVpsOperator, loadVpsConfig, validateVpsCommand } from '../src/vps-config.js';
import { formatSshResult } from '../src/vps-discord.js';
import { sshArguments } from '../src/vps-ssh.js';

const validEnv = {
  VPS_SSH_ENABLED: 'true',
  VPS_ADMIN_GUILD_ID: '123456789012345678',
  VPS_ADMIN_CHANNEL_ID: '223456789012345678',
  VPS_ADMIN_ROLE_IDS: '323456789012345678,423456789012345678',
  VPS_SSH_HOST: '192.0.2.10',
  VPS_SSH_PORT: '2222',
  VPS_SSH_USER: 'xplaybot',
};

function configured() {
  const result = loadVpsConfig(validEnv);
  if (!result) throw new Error('Expected VPS config.');
  return result;
}

describe('Phase 5 configuration', () => {
  it('does not enable SSH without explicit opt-in', () => {
    expect(loadVpsConfig({})).toBeNull();
    expect(loadVpsConfig({ VPS_SSH_ENABLED: 'false' })).toBeNull();
    expect(() => loadVpsConfig({ VPS_SSH_ENABLED: 'TRUE' })).toThrow();
  });

  it('requires all guild, channel, role and SSH settings', () => {
    expect(configured()).toMatchObject({
      guildId: validEnv.VPS_ADMIN_GUILD_ID,
      channelId: validEnv.VPS_ADMIN_CHANNEL_ID,
      roleIds: [validEnv.VPS_ADMIN_ROLE_IDS.split(',')[0], validEnv.VPS_ADMIN_ROLE_IDS.split(',')[1]],
      host: validEnv.VPS_SSH_HOST,
      port: 2222,
      user: 'xplaybot',
    });
    for (const name of ['VPS_ADMIN_GUILD_ID', 'VPS_ADMIN_CHANNEL_ID', 'VPS_ADMIN_ROLE_IDS', 'VPS_SSH_HOST', 'VPS_SSH_USER']) {
      expect(() => loadVpsConfig({ ...validEnv, [name]: '' })).toThrow();
    }
  });

  it('rejects dangerous destination and identity values', () => {
    expect(() => loadVpsConfig({ ...validEnv, VPS_SSH_USER: 'root' })).toThrow();
    expect(() => loadVpsConfig({ ...validEnv, VPS_SSH_HOST: '-oProxyCommand=evil' })).toThrow();
    expect(() => loadVpsConfig({ ...validEnv, VPS_SSH_PORT: '65536' })).toThrow();
    expect(() => loadVpsConfig({ ...validEnv, VPS_ADMIN_ROLE_IDS: 'bad' })).toThrow();
  });
});

describe('Phase 5 authorization', () => {
  it('requires the exact guild, channel AND an allowed role', () => {
    const config = configured();
    const request = { guildId: config.guildId, channelId: config.channelId, roleIds: [config.roleIds[0]!] };
    expect(isAuthorizedVpsOperator(config, request)).toBe(true);
    expect(isAuthorizedVpsOperator(config, { ...request, guildId: '999999999999999999' })).toBe(false);
    expect(isAuthorizedVpsOperator(config, { ...request, channelId: '999999999999999999' })).toBe(false);
    expect(isAuthorizedVpsOperator(config, { ...request, roleIds: ['999999999999999999'] })).toBe(false);
    expect(isAuthorizedVpsOperator(config, { ...request, roleIds: null })).toBe(false);
  });

  it('validates one bounded command string without changing the shell expression', () => {
    expect(validateVpsCommand('  pwd  ')).toBe('pwd');
    expect(validateVpsCommand('pwd && whoami')).toBe('pwd && whoami');
    for (const command of ['', '\nwhoami', 'pwd\rwhoami', 'echo\0foo', 'x'.repeat(401)]) {
      expect(() => validateVpsCommand(command)).toThrow();
    }
  });
});

describe('Phase 5 SSH transport', () => {
  it('pins the host key, disables password, agent forwarding and TTY', () => {
    const config = configured();
    const args = sshArguments(config, 'whoami');
    expect(args).toContain('StrictHostKeyChecking=yes');
    expect(args).toContain(`UserKnownHostsFile=${config.knownHostsPath}`);
    expect(args).toContain('BatchMode=yes');
    expect(args).toContain('PasswordAuthentication=no');
    expect(args).toContain('ForwardAgent=no');
    expect(args).toContain('ClearAllForwardings=yes');
    expect(args).toContain('-T');
    expect(args.slice(-4)).toEqual(['-l', 'xplaybot', '192.0.2.10', 'whoami']);
  });

  it('truncates Discord output and breaks embedded code fences', () => {
    const formatted = formatSshResult({ outcome: 'exit', exitCode: 0, output: '```' + 'x'.repeat(3000), durationMs: 1 });
    expect(formatted).toContain('終了コード: 0');
    expect(formatted).not.toContain('```x');
    expect(formatted.length).toBeLessThan(1700);
  });
});
