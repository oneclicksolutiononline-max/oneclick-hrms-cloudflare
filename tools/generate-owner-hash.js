#!/usr/bin/env node
/**
 * ONECLICK HRMS - PBKDF2 Password Hash Generator for Cloudflare Worker Secrets
 * Generates an OWASP-compliant salted PBKDF2 hash using native Web Crypto.
 *
 * Usage:
 *   node tools/generate-owner-hash.js "<your-password>"
 *   Or run without arguments for interactive prompt:
 *   node tools/generate-owner-hash.js
 */

const readline = require('readline');

const ITERATIONS = 100000;
const SALT_BYTES = 16;
const KEY_BYTES = 32; // 256 bits

function bufToHex(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generatePbkdf2Hash(password) {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  const saltBytes = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(saltBytes);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    KEY_BYTES * 8
  );

  const saltHex = bufToHex(saltBytes);
  const hashHex = bufToHex(derivedBits);
  return `pbkdf2$sha256$${ITERATIONS}$${saltHex}$${hashHex}`;
}

async function main() {
  let password = process.argv[2];

  if (!password) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    password = await new Promise((resolve) => {
      rl.question('Enter Master Owner Password: ', (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  }

  if (!password || password.length < 8) {
    console.error('Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  const hash = await generatePbkdf2Hash(password);

  console.log('\n============================================================');
  console.log('  ONECLICK HRMS - PBKDF2 OWNER CREDENTIALS GENERATED');
  console.log('============================================================\n');
  console.log('Generated PBKDF2 Hash:');
  console.log(hash);
  console.log('\n------------------------------------------------------------');
  console.log('Cloudflare Worker Secret Configuration Commands:');
  console.log('------------------------------------------------------------');
  console.log('1. Set Owner Email:');
  console.log('   npx wrangler secret put OWNER_ADMIN_EMAIL');
  console.log('\n2. Set Owner PBKDF2 Hash:');
  console.log('   npx wrangler secret put OWNER_ADMIN_PBKDF2_HASH');
  console.log('   (Paste the PBKDF2 hash above when prompted)\n');
  console.log('============================================================\n');
}

main().catch(err => {
  console.error('Error generating hash:', err);
  process.exit(1);
});
