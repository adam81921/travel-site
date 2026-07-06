// 刪除 Cloudinary 照片/影片（需 PIN，設定在 Netlify 環境變數 GALLERY_PIN）
// Cloudinary destroy 需要 API secret 簽名，所以只能走 serverless function
const crypto = require('crypto');

const resp = (statusCode, body) => ({
  statusCode,
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'POST only' });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const galleryPin = process.env.GALLERY_PIN;
  if (!cloudName || !apiKey || !apiSecret) return resp(500, { error: 'Cloudinary env vars not set' });
  if (!galleryPin) return resp(500, { error: 'GALLERY_PIN not set' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return resp(400, { error: 'bad json' }); }

  const { public_id, resource_type = 'image', pin } = body;
  if (!pin || pin !== galleryPin) return resp(401, { error: 'wrong pin' });
  if (!public_id || !['image', 'video'].includes(resource_type)) return resp(400, { error: 'bad params' });

  // 簽名參數需按字母排序：invalidate, public_id, timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha1')
    .update(`invalidate=true&public_id=${public_id}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  const form = new URLSearchParams({
    public_id,
    invalidate: 'true',
    timestamp: String(timestamp),
    api_key: apiKey,
    signature
  });

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resource_type}/destroy`, {
    method: 'POST',
    body: form
  });
  const data = await res.json(); // { result: 'ok' | 'not found' } 或 { error: {...} }
  return resp(200, data);
};
