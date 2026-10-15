import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '../../frontend/dist');
const dest = path.resolve(__dirname, '../public');

if (!fs.existsSync(src)) {
  console.error('frontend/dist not found. Run `npm run build` inside ../frontend first.');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Copied frontend build to backend/public');