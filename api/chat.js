export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = process.env.HF_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Server misconfigured: missing API token' });
    return;
  }

  try {
    // Use the inference API endpoint (router.huggingface.co redirects here or vice versa)
    // The error message suggests router, but the /models/ path format works with api-inference
    const response = await fetch(
      'https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      }
    );
    
    // Handle response properly - check content type before parsing
    const contentType = response.headers.get('content-type') || '';
    let data;
    
    if (contentType.includes('application/json')) {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        // If JSON parse fails, return the raw text as error
        res.status(response.status || 500).json({ 
          error: `Invalid JSON response: ${text.substring(0, 200)}` 
        });
        return;
      }
    } else {
      // Non-JSON response (like HTML error page)
      const text = await response.text();
      res.status(response.status || 500).json({ 
        error: text.includes('Not Found') 
          ? 'Model endpoint not found. Please check the model name and API endpoint.'
          : `API error: ${text.substring(0, 200)}`
      });
      return;
    }
    
    // Return the response
    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }
    
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
