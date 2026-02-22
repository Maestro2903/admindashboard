#!/usr/bin/env node
/**
 * Sync environment variables from .env.local to Vercel (production + preview).
 * Requires: vercel link (or VERCEL_PROJECT_ID + VERCEL_ORG_ID) and being logged in (vercel login).
 *
 * Usage: node scripts/sync-env-to-vercel.js
 *    or: npm run vercel:env-push
 *
 * Skips: empty keys, comment lines, and VERCEL_TOKEN (never upload the token).
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env.local');

const SKIP_KEYS = new Set(['VERCEL_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_ORG_ID']);

function parseEnv(content) {
  const vars = {};
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      i++;
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    }
    vars[key] = value;
    i++;
  }
  return vars;
}

function runVercelEnvAdd(key, value, environment) {
  return new Promise((resolve, reject) => {
    const args = ['env', 'add', key, environment, '--force'];
    const child = spawn('npx', ['vercel', ...args], {
      cwd: rootDir,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.stdin.write(value, (err) => {
      if (err) return reject(err);
      child.stdin.end();
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`vercel env add exited with ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error('Missing .env.local. Create it and run again.');
    process.exit(1);
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const vars = parseEnv(content);
  const keys = Object.keys(vars).filter(
    (k) => vars[k] !== undefined && vars[k] !== '' && !SKIP_KEYS.has(k)
  );

  if (keys.length === 0) {
    console.log('No variables to sync.');
    process.exit(0);
  }

  console.log(`Syncing ${keys.length} variables to Vercel (production + preview)...`);
  for (const key of keys) {
    const value = vars[key];
    try {
      await runVercelEnvAdd(key, value, 'production');
      await runVercelEnvAdd(key, value, 'preview');
      console.log(`  ✓ ${key}`);
    } catch (e) {
      console.error(`  ✗ ${key}: ${e.message}`);
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
