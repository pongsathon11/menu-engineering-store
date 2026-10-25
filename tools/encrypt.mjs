/* Encrypt the product files for the store (run on your computer, never commit the key).
   usage: PRODUCT_KEY=<base64 key> node tools/encrypt.mjs <Basic.html> <Pro.html>
   writes products/basic.enc, products/pro.enc, products/manifest.json */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createCipheriv, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const key = Buffer.from(process.env.PRODUCT_KEY || '', 'base64');
if (key.length !== 32) { console.error('PRODUCT_KEY must be a base64 32-byte key'); process.exit(1); }
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'products');
mkdirSync(out, { recursive: true });
const SLOT = '@@LICENSEE@@' + '_'.repeat(88);
const manifest = {};
for (const [name, path] of [['basic', process.argv[2]], ['pro', process.argv[3]]]) {
  const plain = readFileSync(path);
  const offset = plain.indexOf(Buffer.from(SLOT));
  if (offset < 0 || plain.indexOf(Buffer.from(SLOT), offset + 1) >= 0) { console.error('licensee slot not found exactly once in ' + path); process.exit(1); }
  manifest[name] = { offset, len: SLOT.length };
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([iv, c.update(plain), c.final(), c.getAuthTag()]);
  writeFileSync(join(out, name + '.enc'), enc);
  console.log(name, plain.length, 'bytes → slot @', offset);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
