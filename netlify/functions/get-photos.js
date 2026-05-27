exports.handler = async (event) => {
  const tag = event.queryStringParameters.tag;
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

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`;
  const creds = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      expression: `tags:${tag}`,
      max_results: 100
    })
  });

  const data = await res.json();
  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data)
  };
};
