import { Router } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { authMiddleware, verifyToken } from '../auth.js';

const router = Router();
const resourceTypes = {
  audios: {
    table: 'recordings',
    mime: {
      '.webm': 'audio/webm',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg'
    }
  },
  images: {
    table: 'images',
    mime: {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    }
  }
};

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return typeof req.query.token === 'string' ? req.query.token : null;
}

function fileAuth(req, res, next) {
  const payload = verifyToken(getToken(req));
  if (!payload) return res.status(401).json({ error: '未登录或登录已失效' });
  req.user = payload;
  next();
}

router.get('/:type/:filename', fileAuth, (req, res, next) => {
  const resource = resourceTypes[req.params.type];
  const filename = basename(req.params.filename);
  if (!resource || filename !== req.params.filename) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const record = db
    .prepare(
      `SELECT c.created_by, r.filename
       FROM ${resource.table} r
       JOIN courses c ON c.id = r.course_id
       WHERE r.filename = ?`
    )
    .get(filename);
  if (!record || record.created_by !== req.user.id) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const filePath = join(storageDir, req.params.type, filename);
  if (!existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  const contentType = resource.mime[ext];
  if (!contentType) return res.status(404).json({ error: '文件类型不受支持' });

  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  createReadStream(filePath).on('error', next).pipe(res);
});

export default router;
