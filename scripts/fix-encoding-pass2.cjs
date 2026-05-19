/**
 * fix-encoding-pass2.cjs
 * 
 * Second pass to fix remaining encoding issues after initial mojibake repair.
 * The first pass left behind some `À` that should be `Ã` (uppercase tilde A)
 * or `à` (lowercase grave A), depending on context.
 * 
 * Common patterns:
 *  - NÀO → NÃO
 *  - CONFIGURAÇÀO → CONFIGURAÇÃO  
 *  - APRESENTAÇÀO → APRESENTAÇÃO
 *  - À  (followed by space) in lowercase context → à (preposition)
 *  - TÀ‰ → TÉ (from TÉCNICO)
 *  - NÀƒ → NÃ (from NÃO)
 */
const fs = require('fs');
const path = require('path');

// Patterns: [search, replace]
const PASS2_FIXES = [
  // Remaining double-byte mojibake artifacts
  ['À‰', 'É'],       // TÀ‰CNICO → TÉCNICO
  ['Àƒ', 'Ã'],       // NÀƒO → NÃO
  ['À"', 'Ó'],        // PERIÀ"DICOS → PERIÓDICOS
  
  // Context-based fixes: ÀO at end of word (in UPPERCASE) → ÃO 
  // These are always ÃO in Portuguese uppercase contexts
];

// More targeted regex replacements
const REGEX_FIXES = [
  // Fix UPPERCASE words ending in ÀO → ÃO (CONFIGURAÇÃO, etc.)
  [/([A-ZÇÉÊ])ÀO\b/g, '$1ÃO'],
  // Fix NÀO → NÃO
  [/\bNÀO\b/g, 'NÃO'],
  // Fix "À " (capital) followed by lowercase → "à " (preposition)
  [/\bÀ ([\sa-záéíóúãõâêôç])/g, 'à $1'],
  // Fix "À vista" → "à vista" (and similar)
  [/\bÀ vista/g, 'à vista'],
  // Fix remaining ÀRIO → ÁRIO
  [/ÀRIO/g, 'ÁRIO'],
];

function shouldSkipLine(line) {
  const trimmed = line.trim();
  if (trimmed.includes('/[Ãƒ') || trimmed.includes('/[ÃÂ]')) return true;
  if (trimmed.includes('.match(/[Ãƒ')) return true;
  if (trimmed.includes('if (!/[Ã') || trimmed.includes('if (!/[Â')) return true;
  return false;
}

function fixFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf-8');
  let content = original;
  const changes = [];

  const lines = content.split('\n');
  const fixedLines = lines.map((line, idx) => {
    if (shouldSkipLine(line)) return line;
    
    let fixedLine = line;
    
    // Apply literal replacements
    for (const [bad, good] of PASS2_FIXES) {
      if (fixedLine.includes(bad)) {
        const count = fixedLine.split(bad).length - 1;
        fixedLine = fixedLine.split(bad).join(good);
        changes.push({ line: idx + 1, from: bad, to: good, count });
      }
    }
    
    // Apply regex replacements
    for (const [pattern, replacement] of REGEX_FIXES) {
      const matches = fixedLine.match(pattern);
      if (matches && matches.length > 0) {
        const before = fixedLine;
        fixedLine = fixedLine.replace(pattern, replacement);
        if (fixedLine !== before) {
          changes.push({ line: idx + 1, from: pattern.toString(), to: replacement.toString(), count: matches.length });
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
const files = walkDir(srcDir, ['.ts', '.tsx']);
let totalModified = 0;
let totalChanges = 0;

console.log(`\n🔍 Pass 2: Fixing remaining À/mojibake artifacts in ${files.length} files...\n`);

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

console.log(`\n📊 Pass 2 Summary: ${totalModified} files modified, ${totalChanges} replacements made.`);

// Final verification
console.log('\n🔎 Final verification...');
let issues = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (shouldSkipLine(lines[i])) continue;
    const line = lines[i];
    // Check for remaining broken patterns
    if (/[ÀÂ][ƒ‰"™]/.test(line)) {
      issues++;
      const relPath = path.relative(path.join(__dirname, '..'), file);
      console.log(`⚠️  ${relPath}:${i + 1}: ${line.trim().substring(0, 100)}`);
    }
  }
}

if (issues === 0) {
  console.log('✅ All encoding issues resolved!');
} else {
  console.log(`⚠️  ${issues} lines may still have issues.`);
}
