const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const requiredKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const envValues = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    envValues[key] = value;
  }

  return envValues;
}

const fileEnv = parseEnvFile(envPath);
const missingKeys = requiredKeys.filter((key) => {
  const processValue = process.env[key]?.trim();
  const fileValue = fileEnv[key]?.trim();
  return !processValue && !fileValue;
});

if (missingKeys.length > 0) {
  console.error('Missing required release env values for Electron build:');
  for (const key of missingKeys) {
    console.error(`- ${key}`);
  }
  console.error('Provide them in shell env vars or in .env before running electron release.');
  process.exit(1);
}

console.log('Electron env preflight passed');
