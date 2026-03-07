#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const pageSpecsDir = path.join(repoRoot, 'page_specs');
const outPath = path.join(pageSpecsDir, 'index.json');

const pages = fs.readdirSync(pageSpecsDir)
  .filter((name) => name.endsWith('.json') && name !== 'index.json')
  .sort()
  .map((name) => {
    const filePath = path.join(pageSpecsDir, name);
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      page_id: json.page_id || name.replace(/\.json$/, ''),
      path: `page_specs/${name}`,
    };
  });

fs.writeFileSync(outPath, JSON.stringify({ pages }, null, 2));
console.log(`[OK] wrote ${outPath}`);
