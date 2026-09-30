import { ObjectId, type Db } from 'mongodb'
import { createTransport, type Transporter } from 'nodemailer'
import { env } from '../env.js'
import { SEVERITY_RANK } from './hazards.js'
import type { AlertDocument, ContactDocument, LocationDocument, NotificationDocument } from './models.js'

/**
 * Tells the responsible people about an alert. Channels, all optional:
 *  - email through any SMTP server (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM),
 *  - ntfy.sh push notification (free, no account or key: the contact installs
 *    the ntfy phone app and subscribes to a topic name),
 * and always an in-app record, so a message is never silently dropped and the
 * demo works with nothing configured.
 */
let transporter: Transporter | null | undefined
function mailer() {
  if (transporter === undefined) {
    transporter = env.smtp.host
      ? createTransport({ host: env.smtp.host, port: env.smtp.port, secure: env.smtp.port === 465, auth: { user: env.smtp.user, pass: env.smtp.pass } })
      : null
  }
  return transporter
}

export const channelsConfigured = () => ({ email: !!env.smtp.host, ntfy: true })

export interface NotifyInput {
  alert: AlertDocument
  loc: LocationDocument | null
  headline: string
  body: string
  link: string
}

export async function notifyContacts(db: Db, input: NotifyInput): Promise<NotificationDocument[]> {
  const { alert, loc } = input
  const all = await db.collection<ContactDocument>('contacts').find({}).toArray()
  const targets = all.filter(
    (c) =>
      SEVERITY_RANK[alert.severity] >= SEVERITY_RANK[c.minSeverity] &&
      (c.locationIds.length === 0 || c.locationIds.some((id) => id.equals(alert.locationId))),
  )
  const out: NotificationDocument[] = []
  const subject = `[VisEvi ${alert.severity.toUpperCase()}] ${input.headline}`
  const text = `${input.body}\n\nOpen the alert: ${input.link}\nSite: ${loc?.name ?? 'unknown'}`

  const record = async (c: ContactDocument, channel: NotificationDocument['channel'], status: NotificationDocument['status'], detail: string) => {
    const doc: NotificationDocument = { _id: new ObjectId(), alertId: alert._id, contactId: c._id, contactName: c.name, channel, status, subject, body: text, detail, createdAt: new Date() }
    await db.collection<NotificationDocument>('notifications').insertOne(doc)
    out.push(doc)
  }

  for (const c of targets) {
    let delivered = false
    if (c.email) {
      const m = mailer()
      if (!m) {
        await record(c, 'email', 'logged', 'Email is not configured on the server (set SMTP_HOST, SMTP_USER, SMTP_PASS), so it was recorded but not sent.')
      } else {
        try {
          await m.sendMail({ from: env.smtp.from, to: c.email, subject, text })
          await record(c, 'email', 'sent', `Sent to ${c.email}.`)
          delivered = true
        } catch (err) {
          await record(c, 'email', 'failed', err instanceof Error ? err.message : 'send failed')
        }
      }
    }
    if (c.ntfyTopic) {
      try {
        const res = await fetch(`https://ntfy.sh/${encodeURIComponent(c.ntfyTopic)}`, {
          method: 'POST',
          headers: { Title: subject.slice(0, 250), Priority: alert.severity === 'emergency' ? 'urgent' : alert.severity === 'warning' ? 'high' : 'default', Click: input.link },
          body: text,
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) throw new Error(`ntfy responded ${res.status}`)
        await record(c, 'ntfy', 'sent', `Pushed to ntfy topic "${c.ntfyTopic}".`)
        delivered = true
      } catch (err) {
        await record(c, 'ntfy', 'failed', err instanceof Error ? err.message : 'push failed')
      }
    }
    if (!c.email && !c.ntfyTopic) await record(c, 'log', 'logged', 'This contact has no email or ntfy topic, so the message is recorded here only.')
    else if (!delivered && !out.some((o) => o.contactId.equals(c._id) && o.status !== 'logged' && o.status !== 'failed')) {
      /* attempted channels are already recorded above */
    }
  }
  return out
}
