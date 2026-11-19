import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const zai = await ZAI.create();
  const b64 = fs.readFileSync('/tmp/og-composed.png').toString('base64');
  const res = await zai.chat.completions.createVision({
    messages: [
      { role: 'user', content: [
        { type: 'text', text: 'This is a social media preview image (og:image) for a Persian accounting software called "افق پلاس". Check carefully: 1) Is the Persian text rendered correctly and readable (not boxes/tofu)? List the exact Persian texts you see. 2) Does it look cinematic, premium and attractive? 3) Any visual issues (text cut off, overlapping, misalignment)? Answer in English, be specific.' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
      ]}
    ]
  });
  console.log(res.choices[0].message.content);
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
