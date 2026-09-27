import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Client } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCompanyEvent, formatCompanyMessage } from '../src/company-notifications.js';
import { startTerritoryReceiver } from '../src/territory-notifications.js';

const event = {
  event_id: 'company:11111111-1111-4111-8111-111111111111:application',
  kind: 'application' as const,
  application_type: 'new' as const,
  company_name: '@everyoneの建築',
  account_name: '代表者',
  discord_ids: ['323456789012345678'],
  url: 'https://example.com/companies/11111111-1111-4111-8111-111111111111',
};
const secret = 's'.repeat(48);
let receiver: Server | undefined;
afterEach(async () => {
  if (receiver) await new Promise<void>(resolve => receiver!.close(() => resolve()));
  receiver = undefined;
});

describe('company notifications', () => {
  it('distinguishes new and changed applications and handles all review outcomes', () => {
    expect(formatCompanyMessage(event)).toContain('企業｢@everyoneの建築｣を申請しました！');
    expect(formatCompanyMessage({...event,application_type:'edit'})).toContain('企業｢@everyoneの建築｣の変更を申請しました！');
    expect(formatCompanyMessage({...event,kind:'approved'})).toContain('が承認されました！');
    expect(formatCompanyMessage({...event,kind:'returned',reason:'修正してください'})).toContain('差戻理由: 修正してください');
    expect(formatCompanyMessage({...event,kind:'rejected',reason:'対象外です'})).toContain('却下理由: 対象外です');
    expect(formatCompanyMessage({...event,kind:'withdrawn',application_type:'edit'})).toContain('変更申請を取り下げました。');
    expect(formatCompanyMessage({...event,kind:'withdrawn',application_type:'new'})).toContain('申請を取り下げました。');
  });
  it('validates URLs, IDs and mandatory reasons', () => {
    expect(parseCompanyEvent(event)).toMatchObject({kind:'application'});
    expect(() => parseCompanyEvent({...event,url:'javascript:alert(1)'})).toThrow();
    expect(() => parseCompanyEvent({...event,discord_ids:['@everyone']})).toThrow();
    expect(() => parseCompanyEvent({...event,kind:'returned'})).toThrow();
    expect(() => parseCompanyEvent({...event,event_id:'company:other:application'})).toThrow();
    expect(() => parseCompanyEvent({...event,kind:'approved'})).toThrow();
  });
  it('shares both channels, enforces explicit mentions and reuses nonce after retry', async () => {
    const post = vi.fn().mockResolvedValue({id:'ok'});
    const client = {isReady:()=>true,rest:{post}} as unknown as Client;
    receiver = await startTerritoryReceiver(client,{
      participantChannelId:'123456789012345678',adminChannelId:'223456789012345678',
      sharedSecret:secret,port:0,
    });
    const request = (body: unknown, path='/internal/companies') => fetch(
      'http://127.0.0.1:'+(receiver!.address() as AddressInfo).port+path,{
        method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},
        body:JSON.stringify(body),
      });
    expect((await request(event)).status).toBe(204);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls.map(args=>args[0])).toEqual([
      '/channels/123456789012345678/messages','/channels/223456789012345678/messages',
    ]);
    for (const [,options] of post.mock.calls) {
      expect(options.body.allowed_mentions).toEqual({parse:[],users:event.discord_ids});
      expect(options.body.content).toContain('@everyoneの建築');
      expect(options.body.content).not.toContain('<@323456789012345678>');
      expect(options.body.enforce_nonce).toBe(true);
    }
    const nonce = post.mock.calls[0]![1]!.body.nonce;
    expect((await request(event)).status).toBe(204);
    expect(post.mock.calls[2]![1]!.body.nonce).toBe(nonce);
    expect((await request(event,'/internal/notices')).status).toBe(404);
    expect((await request({...event,kind:'approved'})).status).toBe(400);
    expect((await request({...event,event_id:event.event_id.replace('application','approved'),kind:'approved'})).status).toBe(204);
    expect(post.mock.calls[4]![1]!.body.content).toContain('<@323456789012345678>');
  });
});
