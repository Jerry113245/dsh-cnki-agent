#!/usr/bin/env node
/**
 * 校验宿主/客户端代码没有引入 DSH 包外的运行期依赖。
 *
 * 规则：包内只允许 import node:* 内置模块，以及在客户端 factory 内用
 * require('react') 取 React。其余 import 一律报错。
 */
import { readFile } from 'node:fs/promises';

const FILES = ['lib/index.js', 'lib/client.js'];
const ALLOWED_BARE = new Set(['react']);

const IMPORT_RE = /(?:^|\s)(?:import|export)\s[^'"]*from\s*['"]([^'"]+)['"]/g;
const REQUIRE_RE = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

let failed = false;

for (const file of FILES) {
  let source;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    console.error(`✗ 无法读取 ${file}: ${error.message}`);
    failed = true;
    continue;
  }

  const specifiers = new Set();
  for (const re of [IMPORT_RE, REQUIRE_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) specifiers.add(match[1]);
  }

  for (const specifier of specifiers) {
    const isBuiltin = specifier.startsWith('node:');
    const isRelative = specifier.startsWith('.') || specifier.startsWith('/');
    const isAllowedBare = ALLOWED_BARE.has(specifier);
    if (!isBuiltin && !isRelative && !isAllowedBare) {
      console.error(`✗ ${file}: 不允许的外部依赖 "${specifier}"（只允许 node:* 内置模块）`);
      failed = true;
    }
  }

  console.log(`✓ ${file}: ${specifiers.size} 个 import 已检查`);
}

if (failed) {
  console.error('\n依赖自检未通过。');
  process.exit(1);
}
console.log('\n依赖自检通过。');
