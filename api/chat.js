/**
 * Vercel serverless function: proxies chat requests to Hugging Face.
 * This version supports streaming, multiple models, and full conversation history.
 */

// We use the modern router endpoint for serverless tier compatibility
const ROUTER_URL = 'https://router.huggingface.co/hf-inference/v1/chat/completions';

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
    const {
      messages,
      model = 'meta-llama/Llama-3.1-8B-Instruct',
      parameters = {},
      stream = false
    } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing or invalid messages array' });
    }

    let targetModel = model;
    if (targetModel.includes(':hf-inference')) {
      targetModel = targetModel.replace(':hf-inference', '');
    }

    const payload = {
      model: targetModel,
      messages: messages,
      max_tokens: parameters.max_new_tokens || parameters.max_tokens || 2048,
      temperature: parameters.temperature ?? 0.7,
      top_p: parameters.top_p ?? 0.95,
      stream: stream
    };

    const response = await fetch(ROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 503) {
        return res.status(503).json({ error: "Nova is currently initializing this cognitive model. Please retry in 30-60 seconds." });
      }
      const errorData = await response.text();
      return res.status(response.status).json({
        error: `API Error: ${response.status} - ${errorData.substring(0, 100)}`
      });
    }

    // CASE 1: Streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        res.write(chunk);
      }
      return res.end();
    }

    // CASE 2: Normal Response
    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content || '';

    // Maintain legacy format compatibility for now if needed, 
    // but better to move to standard OpenAI format.
    // Let's return both for safety.
    return res.status(200).json({
      choices: data.choices,
      generated_text: generatedText // legacy field
    });

  } catch (err) {
    console.error('Proxy Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error while processing request' });
  }
}
