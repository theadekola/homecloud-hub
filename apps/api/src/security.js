import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!ACCESS_SECRET || ACCESS_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
if (!REFRESH_SECRET || REFRESH_SECRET.length < 32) throw new Error('JWT_REFRESH_SECRET must be at least 32 characters');

export const roles = {
  viewer: 10,
  auditor: 20,
  operator: 30,
  admin: 40,
  owner: 50,
};

export async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    const claims = jwt.verify(header.slice(7), ACCESS_SECRET, { algorithms: ['HS256'] });
    const result=await pool.query('SELECT id,email,name,role,status FROM users WHERE id=$1',[claims.sub]);
    if(!result.rowCount||result.rows[0].status!=='active')return res.status(401).json({error:'Account is inactive or missing'});
    req.user={sub:result.rows[0].id,email:result.rows[0].email,name:result.rows[0].name,role:result.rows[0].role};
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

export function requireRole(minRole) {
  return (req,res,next)=>{
    if ((roles[req.user?.role] || 0) < (roles[minRole] || 999)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

export async function issueTokens(user) {
  const payload = { sub: user.id, email: user.email, role: user.role, name: user.name };
  const accessToken = jwt.sign(payload, ACCESS_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m', algorithm: 'HS256' });
  const refreshToken = jwt.sign({ sub: user.id, typ:'refresh', jti:crypto.randomUUID() }, REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', algorithm: 'HS256' });
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const decoded = jwt.decode(refreshToken);
  await pool.query('INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,to_timestamp($3))', [user.id, tokenHash, decoded.exp]);
  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(token) {
  const decoded = jwt.verify(token, REFRESH_SECRET, { algorithms:['HS256'] });
  if (decoded.typ !== 'refresh') throw new Error('Invalid refresh token');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = await pool.query(`SELECT rt.*,u.email,u.name,u.role,u.status FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()`, [tokenHash]);
  if (!row.rowCount || row.rows[0].status !== 'active') throw new Error('Refresh token rejected');
  const revoked = await pool.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING id', [tokenHash]);
  if (!revoked.rowCount) throw new Error('Refresh token already used');
  return issueTokens({ ...row.rows[0], id:row.rows[0].user_id });
}

export async function verifyPassword(email,password) {
  const r = await pool.query('SELECT * FROM users WHERE email=$1 AND status=$2', [email.toLowerCase(),'active']);
  if (!r.rowCount) return null;
  return await bcrypt.compare(password,r.rows[0].password_hash) ? r.rows[0] : null;
}

export function approvalPhrase(provider, resourceType, resourceId, action) {
  return `CONFIRM ${provider.toUpperCase()} ${resourceType.toUpperCase()} ${resourceId} ${action.toUpperCase()}`;
}
export function hashPhrase(phrase) {
  return crypto.createHash('sha256').update(phrase).digest('hex');
}
