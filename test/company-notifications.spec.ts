import { describe, expect, it } from 'vitest'
import { parseCompanyEvent, formatCompanyMessage } from '../src/company-notifications.js'

const base = {
  event_id: 'company:123e4567-e89b-42d3-a456-426614174000:application',
  kind: 'application' as const,
  application_type: 'new' as const,
  company_name: '大きなくま建設',
  account_name: '申請者',
  discord_ids: ['981000000000000001'],
  company_id: '123e4567-e89b-42d3-a456-426614174000',
  url: 'https://example.com/companies/123e4567-e89b-42d3-a456-426614174000',
}
const event=(kind:'application'|'approved'|'returned'|'rejected'|'withdrawn')=>({ ...base,kind,event_id:base.event_id.replace(':application',`:${kind}`) })

describe('enterprise notifications',()=>{
  it('uses shared-channel application wording',()=>{
    const next=event('application')
    expect(formatCompanyMessage(parseCompanyEvent(next))).toContain('申請者が企業｢大きなくま建設｣を申請しました！')
    expect(formatCompanyMessage(parseCompanyEvent({...next,application_type:'edit'}))).toContain('企業｢大きなくま建設｣の変更を申請しました！')
  })
  it('mentions only declared Discord IDs in reviews',()=>{
    const approved=event('approved')
    expect(formatCompanyMessage(parseCompanyEvent(approved))).toContain('<@981000000000000001>の企業')
    expect(formatCompanyMessage(parseCompanyEvent({...event('returned'),reason:'再確認'}))).toContain('差戻理由: 再確認')
    expect(formatCompanyMessage(parseCompanyEvent({...event('rejected'),reason:'要件不足',application_type:'edit'}))).toContain('変更の申請が却下されました')
  })
  it('distinguishes new and edit withdrawal',()=>{
    expect(formatCompanyMessage(parseCompanyEvent(event('withdrawn')))).toContain('の申請を取り下げました。')
    expect(formatCompanyMessage(parseCompanyEvent({...event('withdrawn'),application_type:'edit'}))).toContain('変更の申請を取り下げました。')
  })
  it('rejects malformed events',()=>{
    expect(()=>parseCompanyEvent({...event('approved'),discord_ids:['@everyone']})).toThrow()
    expect(()=>parseCompanyEvent({...event('approved'),discord_ids:[]})).toThrow()
    expect(()=>parseCompanyEvent({...event('returned'),reason:''})).toThrow()
    expect(()=>parseCompanyEvent({...event('application'),url:'javascript:alert(1)'})).toThrow()
  })
})
