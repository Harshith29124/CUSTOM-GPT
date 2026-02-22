# Nova AI

Production-ready Claude-style AI chat app powered by Hugging Face Zephyr 7B.

## Local Development

For local testing only, temporarily edit `index.html`:

- Set `API_URL` to the full HF inference URL:  
  `https://router.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta`
- Set `HF_TOKEN` to your Hugging Face token

**Never commit these changes.**

## Vercel Deployment

1. Push repo to GitHub
2. Import to [vercel.com](https://vercel.com)
3. **Project Settings → Environment Variables** → Add:
   - **Key:** `HF_TOKEN`
   - **Value:** your Hugging Face read token
4. Deploy

## Security

The `HF_TOKEN` never appears in frontend code. It lives only in Vercel environment variables. The `/api/chat` serverless function proxies requests securely.

## Stack

- Vanilla HTML/CSS/JS (no framework, no build step)
- Hugging Face Inference API (Zephyr 7B)
- Vercel serverless functions
- marked.js for markdown
- highlight.js for syntax highlighting
