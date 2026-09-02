import { createHmac } from 'node:crypto';

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeQuery(value=''){
  return String(value)
    .replace(CONTROL_RE, '')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(PHONE_RE, '[redacted-phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function deriveAnalyticsKey(rawId, secret){
  if(!rawId || !secret) throw new Error('analytics id and secret are required');
  return createHmac('sha256', secret).update(String(rawId)).digest('base64url');
}
