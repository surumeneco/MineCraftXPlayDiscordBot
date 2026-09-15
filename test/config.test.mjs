import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../dist/config.js';

test('loadConfig requires DISCORD_BOT_TOKEN', () => {
  assert.throws(() => loadConfig({}), /DISCORD_BOT_TOKEN is required/);
});

test('loadConfig trims DISCORD_BOT_TOKEN', () => {
  assert.deepEqual(loadConfig({ DISCORD_BOT_TOKEN: '  token-value  ' }), {
    discordBotToken: 'token-value',
  });
});
