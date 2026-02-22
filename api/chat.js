/**
 * Vercel serverless function: proxies chat requests to Hugging Face.
 *
 * Root cause fix: HF deprecated api-inference.huggingface.co. The supported
 * API is the Inference Providers router at router.huggingface.co, which uses
 * the OpenAI chat-completions format (/v1/chat/completions), not the old
 * "inputs" inference API. We convert between the two so the frontend is unchanged.
 *
 * @see https://huggingface.co/docs/api-inference/index
 * @see https://router.huggingface.co (OpenAI-compatible)
 */

const ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
const MODEL = 'HuggingFaceH4/zephyr-7b-beta';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.HF_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server configuration error: HF_TOKEN is missing' });
  }

  try {
    const { inputs, parameters = {} } = req.body || {};
    
    // The frontend sends 'inputs' which is the prompt.
    // The Router API expects 'messages'.
    // We also support 'parameters' for backward compatibility.
    
    const prompt = typeof inputs === 'string' ? inputs : '';
    if (!prompt) {
      return res.status(400).json({ error: 'Missing input prompt' });
    }

    const payload = {
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: parameters.max_new_tokens || parameters.max_tokens || 1024,
      temperature: parameters.temperature ?? 0.7,
      top_p: parameters.top_p ?? 0.95,
      stream: false // Streaming would require a different architecture for serverless
    };

    const response = await fetch(ROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type') || '';
    
    if (!response.ok) {
      const errorData = contentType.includes('application/json') 
        ? await response.json() 
        : await response.text();
      
      const errorMessage = typeof errorData === 'object' 
        ? (errorData.error?.message || errorData.error || JSON.stringify(errorData))
        : errorData;

      return res.status(response.status).json({ 
        error: errorMessage || `API Error: ${response.status} ${response.statusText}`
      });
    }

    if (!contentType.includes('application/json')) {
      const text = await response.text();
      return res.status(500).json({ error: `Unexpected response format from API: ${text.substring(0, 100)}` });
    }

    const data = await response.json();
    
    // Extracted content from OpenAI-compatible response
    const generatedText = data.choices?.[0]?.message?.content || '';
    
    if (!generatedText && !data.error) {
       return res.status(500).json({ error: 'API returned an empty response' });
    }

    // Return in the format the legacy frontend expects
    return res.status(200).json([{ generated_text: generatedText }]);

  } catch (err) {
    console.error('Proxy Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error while processing request' });
  }
}
