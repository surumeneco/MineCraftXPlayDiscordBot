type LogLevel = 'INFO' | 'ERROR';

function write(level: LogLevel, message: string, error?: unknown): void {
  const suffix = error === undefined ? '' : ` ${formatError(error)}`;
  const line = `${new Date().toISOString()} [${level}] ${message}${suffix}`;

  if (level === 'ERROR') {
    console.error(line);
    return;
  }

  console.log(line);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

export const logger = {
  info(message: string): void {
    write('INFO', message);
  },
  error(message: string, error?: unknown): void {
    write('ERROR', message, error);
  },
};
