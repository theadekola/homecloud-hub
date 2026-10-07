import { pool } from './db.js';
import crypto from 'node:crypto';
export async function writeAudit(req, action, resource, details={}, status='success') {
  const requestId=req.headers['x-request-id'] || cryptoRandom();
  await pool.query(
    `INSERT INTO audit_logs(user_id,user_email,action,resource,details,status,ip,request_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [req.user?.sub || null, req.user?.email || 'system', action, resource, JSON.stringify(details), status, req.ip, requestId]
  );
}
function cryptoRandom(){return crypto.randomUUID()}
