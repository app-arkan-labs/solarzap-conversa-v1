/**
 * fix-encoding.cjs
 * 
 * Fixes UTF-8 mojibake (double-encoded characters) in source files.
 * The pattern is: UTF-8 bytes were interpreted as Latin-1, producing garbled text.
 * 
 * This script:
 * 1. Scans all .ts/.tsx files in src/ for known mojibake patterns
 * 2. Replaces each with the correct Portuguese character
 * 3. Reports all changes for audit trail
 * 
 * NOTE: This does NOT touch the repairMojibake/sanitizeForPDF functions 
 * in legacyRenderer.ts and templateEngine.ts — those are runtime mojibake 
 * repair utilities for external data, not source-code literals.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Complete mapping of mojibake sequences → correct Portuguese characters
const MOJIBAKE_MAP = [
  // Three-byte sequences (must come FIRST to avoid partial matches)
  ['Ã§Ãµes', 'ções'],
  ['Ã§Ã£o', 'ção'],
  ['Ã§Ã£', 'çã'],      // standalone çã
  
  // Two-byte sequences  
  ['Ã£o', 'ão'],
  ['Ã£', 'ã'],
  ['Ãµes', 'ões'],
  ['Ãµ', 'õ'],
  ['Ã©', 'é'],
  ['Ã¡', 'á'],
  ['Ã­', 'í'],
  ['Ãº', 'ú'],
  ['Ã³', 'ó'],
  ['Ã§', 'ç'],
  ['Ãª', 'ê'],
  ['Ã¢', 'â'],
  ['Ã´', 'ô'],
  ['Ã¼', 'ü'],
  ['Ã', 'À'],  // capital À - must be LAST among Ã patterns
  ['Â', ''],   // orphan  byte from double encoding (artifact)
  ['Ã‰', 'É'],
  ['Ã"', 'Ó'],
  ['Ãš', 'Ú'],
  ['Ã‡', 'Ç'],
  ['Ã‚', 'Â'],
  ['Ãƒ', 'Ã'],
];

// Files with runtime mojibake repair functions — skip their regex/detection code
const RUNTIME_REPAIR_EXCLUSIONS = new Set([
  // These contain repairMojibake() functions that detect mojibake at runtime
  // The regex patterns inside MUST NOT be touched
]);

// Lines/patterns to skip (runtime repair detection code)
function shouldSkipLine(line, filePath) {
  const trimmed = line.trim();
  // Skip regex patterns that detect mojibake at runtime
  if (trimmed.includes('/[ÃƒÆ') || trimmed.includes('/[ÃÂ]')) return true;
  if (trimmed.includes('.match(/[Ãƒ')) return true;
  if (trimmed.includes('.test(')) return true;
  if (trimmed.includes('if (!/[Ã') || trimmed.includes('if (!/[Â')) return true;
  return false;
}

function fixFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf-8');
  let content = original;
  const changes = [];

  // Process line by line to respect exclusions
  const lines = content.split('\n');
  const fixedLines = lines.map((line, idx) => {
    if (shouldSkipLine(line, filePath)) return line;
    
    let fixedLine = line;
    for (const [bad, good] of MOJIBAKE_MAP) {
      if (fixedLine.includes(bad)) {
        const count = (fixedLine.match(new RegExp(escapeRegex(bad), 'g')) || []).length;
        fixedLine = fixedLine.split(bad).join(good);
        if (count > 0) {
          changes.push({ line: idx + 1, from: bad, to: good, count });
        }
      }
    }
    return fixedLine;
  });

  const fixed = fixedLines.join('\n');

  if (fixed !== original) {
    fs.writeFileSync(filePath, fixed, 'utf-8');
    return { filePath, changes, modified: true };
  }
  return { filePath, changes: [], modified: false };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walkDir(dir, ext) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...walkDir(fullPath, ext));
    } else if (ext.some(e => entry.name.endsWith(e))) {
      results.push(fullPath);
    }
  }
  return results;
}

// Main
const srcDir = path.join(__dirname, '..', 'src');
const files = walkDir(srcDir, ['.ts', '.tsx', '.js', '.jsx']);
let totalModified = 0;
let totalChanges = 0;

console.log(`\n🔍 Scanning ${files.length} source files for mojibake...\n`);

for (const file of files) {
  const result = fixFile(file);
  if (result.modified) {
    totalModified++;
    const relPath = path.relative(path.join(__dirname, '..'), file);
    console.log(`✅ FIXED: ${relPath}`);
    for (const c of result.changes) {
      totalChanges += c.count;
      console.log(`   L${c.line}: "${c.from}" → "${c.to}" (×${c.count})`);
    }
  }
}

console.log(`\n📊 Summary: ${totalModified} files modified, ${totalChanges} replacements made.`);

// Verify no remaining mojibake
console.log('\n🔎 Verification scan...');
let remainingCount = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (shouldSkipLine(lines[i], file)) continue;
    // Check for remaining Ã patterns (but not in regex/detection code)
    if (/Ã[£¡©§ª³ºµ­´¢¼â€™â€œ]/.test(lines[i])) {
      remainingCount++;
      const relPath = path.relative(path.join(__dirname, '..'), file);
      console.log(`⚠️  Remaining mojibake: ${relPath}:${i + 1}: ${lines[i].trim().substring(0, 80)}`);
    }
  }
}

if (remainingCount === 0) {
  console.log('✅ No remaining mojibake found! All clean.');
} else {
  console.log(`⚠️  ${remainingCount} lines still have potential mojibake.`);
}
