import 'dotenv/config';
import crypto from 'node:crypto';

const SECRET = process.env.AUTH_SECRET;
const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 604800);

if (!SECRET || SECRET.length < 32) {
  throw new Error('AUTH_SECRET 必须设置且长度至少为 32 个字符');
}
if (!Number.isInteger(TOKEN_TTL_SECONDS) || TOKEN_TTL_SECONDS <= 0) {
  throw new Error('AUTH_TOKEN_TTL_SECONDS 必须为正整数');
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

export function signToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig, ...rest] = token.split('.');
  if (!body || !sig || rest.length) return null;

  const expected = crypto.createHmac('sha256', SECRET).update(body).digest();
  let signature;
  try {
    signature = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: '未登录或登录已失效' });
  }
  req.user = payload;
  next();
}
