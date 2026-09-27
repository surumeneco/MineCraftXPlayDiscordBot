export interface CompanyEvent {
  event_id: string
  kind: 'application' | 'approved' | 'returned' | 'rejected' | 'withdrawn'
  application_type: 'new' | 'edit'
  company_name: string
  account_name: string
  discord_ids: string[]
  company_id: string
  reason?: string
  url: string
}

export function parseCompanyEvent(payload: unknown): CompanyEvent {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid event')
  const event = payload as Record<string, unknown>
  if (!['application','approved','returned','rejected','withdrawn'].includes(String(event.kind))) throw new Error('Invalid kind')
  if (typeof event.event_id !== 'string' || !/^company:[0-9a-f-]{36}:(application|approved|returned|rejected|withdrawn)$/.test(event.event_id)
    || !event.event_id.endsWith(':'+String(event.kind))) throw new Error('Invalid event ID')
  if (!['new','edit'].includes(String(event.application_type))) throw new Error('Invalid application type')
  if (typeof event.company_name !== 'string' || !event.company_name.trim() || event.company_name.length > 100) throw new Error('Invalid company name')
  if (typeof event.account_name !== 'string' || !event.account_name.trim() || event.account_name.length > 200) throw new Error('Invalid account name')
  if (typeof event.company_id !== 'string' || !/^[0-9a-f-]{36}$/.test(event.company_id)) throw new Error('Invalid company ID')
  if (!Array.isArray(event.discord_ids) || !event.discord_ids.every(id => typeof id === 'string' && /^\d{15,22}$/.test(id))) {
    throw new Error('Invalid Discord IDs')
  }
  if (event.kind !== 'application' && event.discord_ids.length === 0) throw new Error('Mentionable Discord ID is required')
  if ((event.kind === 'returned' || event.kind === 'rejected') &&
    (typeof event.reason !== 'string' || !event.reason.trim() || event.reason.length > 20000)) throw new Error('Reason is required')
  if (typeof event.url !== 'string') throw new Error('Invalid URL')
  let url: URL
  try { url = new URL(event.url) } catch { throw new Error('Invalid URL') }
  if (url.username || url.password || (url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error('Invalid URL')
  return event as unknown as CompanyEvent
}

export function formatCompanyMessage(event: CompanyEvent): string {
  const actor = event.discord_ids.map(id => `<@${id}>`).join(' ')
  const subject = event.application_type === 'edit' ? `企業｢${event.company_name}｣の変更` : `企業｢${event.company_name}｣`
  let result: string
  if (event.kind === 'application') {
    result = `${event.account_name}が${subject}を申請しました！\n${event.url}`
  } else if (event.kind === 'approved') {
    result = `${actor}の企業｢${event.company_name}｣が承認されました！\n${event.url}`
  } else if (event.kind === 'returned' || event.kind === 'rejected') {
    result = `${actor}の${subject}の申請が${event.kind==='returned'?'差し戻されました':'却下されました'}。\n${event.kind==='returned'?'差戻理由':'却下理由'}: ${event.reason}`
  } else {
    result = `${actor}が${subject}の申請を取り下げました。`
  }
  return result.length > 2000 ? result.slice(0,1999)+'…' : result
}
