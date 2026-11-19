import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const zai = await ZAI.create();
  const prompt = `Cinematic premium fintech hero background, dark deep navy blue #0d1f35 atmosphere, a sleek floating holographic accounting dashboard with glowing rising bar charts and elegant line graphs, subtle golden amber accent lights, soft teal data glow, depth of field with bokeh particles, luxurious modern corporate aesthetic, dramatic rim lighting, ultra high quality, photorealistic 3D render, wide banner composition, right side slightly darker and empty for text overlay, no text, no letters, no words, no watermark`;
  const res = await zai.images.generations.create({ prompt, size: '1344x768' });
  const b64 = res.data[0].base64;
  fs.writeFileSync('/tmp/og-bg-raw.png', Buffer.from(b64, 'base64'));
  console.log('OK saved', Buffer.from(b64, 'base64').length, 'bytes');
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
