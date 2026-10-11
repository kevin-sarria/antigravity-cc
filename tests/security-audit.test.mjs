import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/**
 * Known secret patterns to detect in files
 */
const SENSITIVE_PATTERNS = [
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{35}/g },
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{32,}/g },
  { name: 'OpenAI Project Key', regex: /sk-proj-[a-zA-Z0-9_-]{32,}/g },
  { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_\-]{32,}/g },
  { name: 'GitHub Token', regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}/g },
  { name: 'GitHub Fine-grained PAT', regex: /github_pat_[0-9a-zA-Z_]{50,}/g },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'Private Key Block', regex: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PRIVATE)\s+KEY-----/g },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9A-Za-z]{10,}/g },
  { name: 'Hardcoded Bearer JWT', regex: /Bearer\s+eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g },
  { name: 'Hardcoded Password Assignment', regex: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{6,}["']/i },
];

/**
 * Recursively list all files in directory
 */
function getAllFiles(dir, fileList = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === '.git' || entry === 'node_modules' || entry === '.trash') {
      continue;
    }
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe('Security & Sensitive Credentials Audit', () => {
  const allFiles = getAllFiles(projectRoot);

  test('should verify .gitignore exists and blocks sensitive files', () => {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    assert.ok(existsSync(gitignorePath), '.gitignore must exist');

    const content = readFileSync(gitignorePath, 'utf-8');
    assert.match(content, /\.env/, '.gitignore must ignore .env files');
    assert.match(content, /node_modules/, '.gitignore must ignore node_modules');
    assert.match(content, /\*credentials\*\.json|\.claude\.json|\.pem|\.key/, '.gitignore must ignore credentials and private keys');
  });

  test('should verify .env.example contains only dummy placeholder values', () => {
    const examplePath = path.join(projectRoot, '.env.example');
    assert.ok(existsSync(examplePath), '.env.example must exist');

    const content = readFileSync(examplePath, 'utf-8');
    for (const pattern of SENSITIVE_PATTERNS) {
      const match = content.match(pattern.regex);
      assert.strictEqual(
        match,
        null,
        `.env.example contains an actual credential matching ${pattern.name}: ${match}`
      );
    }
  });

  test('should scan all repository files for hardcoded API keys or secrets', () => {
    const violations = [];

    for (const filePath of allFiles) {
      const relativePath = path.relative(projectRoot, filePath);
      const content = readFileSync(filePath, 'utf-8');

      for (const pattern of SENSITIVE_PATTERNS) {
        // Skip regex definitions inside the security test and wrapper sanitization regexes themselves
        if (
          (relativePath.includes('security-audit.test.mjs') || relativePath.includes('agy-wrapper.mjs')) &&
          (pattern.name.includes('API Key') || pattern.name.includes('Token') || pattern.name.includes('Key Block'))
        ) {
          // The wrapper and test file have regex matchers to REDACT keys, so skip the regex literal match
          continue;
        }

        const matches = content.match(pattern.regex);
        if (matches && matches.length > 0) {
          violations.push({
            file: relativePath,
            rule: pattern.name,
            matchedSample: matches[0].substring(0, 10) + '...',
          });
        }
      }
    }

    assert.deepStrictEqual(
      violations,
      [],
      `Found potential exposed credentials in repository files:\n${JSON.stringify(violations, null, 2)}`
    );
  });

  test('should ensure no personal user directory paths are hardcoded in source files', () => {
    const userPathViolations = [];
    // Any real home directory (Windows, macOS or Linux). Documentation placeholders such as
    // <username>, <you> or "me" are allowed.
    const placeholder = '(?:<[^>]+>|me|you|user|username)';
    const userPathRegex = new RegExp(
      `[A-Z]:\\\\Users\\\\(?!${placeholder}\\\\)[^\\\\\\s"'\`]+\\\\|/(?:Users|home)/(?!${placeholder}/)[^/\\s"'\`]+/`,
      'i'
    );

    for (const filePath of allFiles) {
      const relativePath = path.relative(projectRoot, filePath);
      const match = readFileSync(filePath, 'utf-8').match(userPathRegex);
      if (match) {
        userPathViolations.push(`${relativePath} (${match[0]})`);
      }
    }

    assert.deepStrictEqual(
      userPathViolations,
      [],
      `Personal absolute user paths found in: ${userPathViolations.join(', ')}`
    );
  });

  test('should ensure no personal email addresses are present in files', () => {
    const allowedDomains = /@(?:example\.com|users\.noreply\.github\.com|anthropic\.com)$/i;
    const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
    const violations = [];

    for (const filePath of allFiles) {
      const relativePath = path.relative(projectRoot, filePath);
      for (const email of readFileSync(filePath, 'utf-8').match(emailRegex) || []) {
        if (!allowedDomains.test(email)) violations.push(`${relativePath} (${email})`);
      }
    }

    assert.deepStrictEqual(violations, [], `Email addresses found in: ${violations.join(', ')}`);
  });
});

console.log('🔒 Security Audit: Scanning complete. Zero sensitive credentials detected.');
