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
    const { inputs, parameters = {} } = req.body || {};
    const prompt = typeof inputs === 'string' ? inputs : (inputs || '');
    const max_tokens = parameters.max_new_tokens ?? 512;
    const temperature = parameters.temperature ?? 0.7;

    const response = await fetch(ROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens,
        temperature,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      res.status(response.status || 500).json({
        error: text.includes('Not Found')
          ? 'Model or endpoint not found. Check model id and HF token.'
          : (text || `HTTP ${response.status}`).substring(0, 300),
      });
      return;
    }

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      res.status(500).json({ error: `Invalid JSON from API: ${raw.substring(0, 200)}` });
      return;
    }

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    const content = data.choices?.[0]?.message?.content ?? '';
    res.status(200).json([{ generated_text: content }]);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
