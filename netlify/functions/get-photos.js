// 列出某旅程 tag 的所有照片/影片，並回傳拍攝時間（EXIF）供前端按日分組
// 拍攝時間存在 Cloudinary context.taken_at：
//   - Search API 不會回傳 backfill 的 image_metadata，但 context 一定會回傳
//   - 缺 context 的照片在這裡 lazy backfill（讀 EXIF → 寫回 context），每次最多 30 張
//   - 影片沒有 EXIF，前端 fallback 用上傳時間
const CLD = 'https://api.cloudinary.com/v1_1';

exports.handler = async (event) => {
  const tag = (event.queryStringParameters || {}).tag || '';
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Cloudinary env vars not set' })
    };
  }

  const auth = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  const res = await fetch(`${CLD}/${cloudName}/resources/search`, {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expression: `tags:${tag}`,
      sort_by: [{ created_at: 'asc' }],
      max_results: 500,
      with_field: ['context']
    })
  });

  const data = await res.json();
  const resources = data.resources || [];

  // lazy backfill：還沒有 context.taken_at 的照片，讀 EXIF 寫回 context
  // 沒有 EXIF 的寫 'none' 佔位，避免每次載入重查
  const pending = resources
    .filter((r) => r.resource_type === 'image' && !(r.context && r.context.taken_at))
    .slice(0, 30);

  await Promise.all(pending.map(async (r) => {
    try {
      const pid = encodeURIComponent(r.public_id);
      const det = await fetch(`${CLD}/${cloudName}/resources/image/upload/${pid}?image_metadata=true`, {
        headers: { 'Authorization': auth }
      });
      const d = await det.json();
      const meta = d.image_metadata || {};
      const raw = meta.DateTimeOriginal || meta.CreateDate || '';
      const m = String(raw).match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}:\d{2}:\d{2})/);
      const taken = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}` : 'none';
      await fetch(`${CLD}/${cloudName}/resources/image/upload/${pid}`, {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ context: `taken_at=${taken}` })
      });
      r.context = Object.assign({}, r.context, { taken_at: taken });
    } catch (e) { /* 失敗就留給下次載入重試 */ }
  }));

  const out = resources.map((r) => {
    const t = r.context && r.context.taken_at;
    return {
      public_id: r.public_id,
      resource_type: r.resource_type,
      created_at: r.created_at,
      taken_at: t && t !== 'none' ? t : null
    };
  });

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ resources: out })
  };
};
