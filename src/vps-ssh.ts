import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { statSync } from 'node:fs';
import type { VpsConfig } from './vps-config.js';

const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 8_192;
const active = new Set<ChildProcessWithoutNullStreams>();

export type SshOutcome = 'exit' | 'timeout' | 'output-limit' | 'connection-error';
export interface SshResult {
  readonly outcome: SshOutcome;
  readonly exitCode: number | null;
  readonly output: string;
  readonly durationMs: number;
}

export function assertSshFiles(config: VpsConfig): void {
  const key = statSync(config.keyPath);
  const knownHosts = statSync(config.knownHostsPath);
  if (!key.isFile() || key.size === 0 || (key.mode & 0o077) !== 0) {
    throw new Error('SSH private key must be a readable nonempty file with no group/other permissions.');
  }
  if (!knownHosts.isFile() || knownHosts.size === 0) {
    throw new Error('SSH known_hosts must be a readable nonempty file.');
  }
}

export function sshArguments(config: VpsConfig, command: string): string[] {
  return [
    '-F', '/dev/null', '-T',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${config.knownHostsPath}`,
    '-o', 'GlobalKnownHostsFile=/dev/null',
    '-o', 'UpdateHostKeys=no',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'PasswordAuthentication=no',
    '-o', 'KbdInteractiveAuthentication=no',
    '-o', 'GSSAPIAuthentication=no',
    '-o', 'ForwardAgent=no',
    '-o', 'ClearAllForwardings=yes',
    '-o', 'LogLevel=ERROR',
    '-o', 'ConnectTimeout=8',
    '-o', 'ConnectionAttempts=1',
    '-p', String(config.port),
    '-i', config.keyPath,
    '-l', config.user,
    config.host,
    command,
  ];
}

export function executeSshCommand(config: VpsConfig, command: string): Promise<SshResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    // An argument array avoids invoking a *local* shell. The remote login shell
    // intentionally interprets the operator-supplied command as a single command string.
    const child = spawn('ssh', sshArguments(config, command), {
      shell: false,
      env: { ...process.env, SSH_AUTH_SOCK: '', SSH_ASKPASS: '/bin/false' },
    });
    child.stdin.end();
    active.add(child);
    let output = Buffer.alloc(0);
    let outcome: SshOutcome = 'exit';
    let settled = false;
    let timer: NodeJS.Timeout;
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active.delete(child);
      resolve({ outcome, exitCode, output: output.toString('utf8'), durationMs: Date.now() - started });
    };
    const stop = (reason: SshOutcome): void => {
      if (settled) return;
      outcome = reason;
      child.kill('SIGKILL');
    };
    const capture = (data: Buffer): void => {
      if (settled || outcome !== 'exit') return;
      const available = MAX_OUTPUT_BYTES - output.length;
      if (data.length > available) {
        output = Buffer.concat([output, data.subarray(0, available)]);
        stop('output-limit');
      } else {
        output = Buffer.concat([output, data]);
      }
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', () => { outcome = 'connection-error'; finish(null); });
    child.on('close', (code) => finish(code));
    timer = setTimeout(() => stop('timeout'), TIMEOUT_MS);
    timer.unref();
  });
}

export function abortSshCommands(): void {
  for (const child of active) child.kill('SIGKILL');
}
