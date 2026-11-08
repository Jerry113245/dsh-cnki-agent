#!/usr/bin/env node
/**
 * 一次性发布脚本：把本地仓库文件推送到 GitHub。
 *
 * 用法（PowerShell）：
 *   $env:GITHUB_TOKEN = "ghp_xxx"
 *   $env:HTTPS_PROXY  = "http://127.0.0.1:12450"   # 需要时
 *   node scripts/publish-github.mjs <owner>/<repo> [--include-workflows]
 *
 * 说明：
 * - 使用 Git Data API（blob → tree → commit → ref），无需 git 凭据，也绕开
 *   「PAT 缺 workflow scope 不能推 .github/workflows」的限制：默认会跳过
 *   .github/workflows/ 下的文件，加 --include-workflows 才上传（需要 workflow 权限）。
 * - 只读取 git 已跟踪文件（git ls-files），不会把 .git、node_modules 传上去。
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error('缺少 GITHUB_TOKEN 环境变量');
  process.exit(1);
}

const repoArg = process.argv[2];
if (!repoArg || !repoArg.includes('/')) {
  console.error('用法: node scripts/publish-github.mjs <owner>/<repo> [--include-workflows]');
  process.exit(1);
}
const [owner, repo] = repoArg.split('/');
const includeWorkflows = process.argv.includes('--include-workflows');
const commitMessage = process.env.COMMIT_MESSAGE || 'feat: CNKIAgent 0.3.0';

const API = 'https://api.github.com';

async function gh(method, endpoint, body) {
  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'dsh-cnki-agent',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} -> ${response.status} ${json?.message ?? text.slice(0, 200)}`);
  }
  return json;
}

// git ls-files 只列已跟踪文件，新建但未提交的文件会漏掉；
// 用 ls-files 之外再补一次「工作区内实际存在」的扫描，避免默默少传。
const tracked = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files'], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const others = execFileSync(
  'git',
  ['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard'],
  { encoding: 'utf8' },
)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const files = [...new Set([...tracked, ...others])].filter(
  (file) => includeWorkflows || !file.startsWith('.github/workflows/'),
);

if (others.length > 0) {
  console.warn(`注意：以下 ${others.length} 个文件尚未提交到本地 git，本次一并上传：`);
  for (const file of others) console.warn(`  · ${file}`);
}

// 本脚本用 tree 整体替换（base_tree 为空），默认跳过工作流会把远端已有的
// .github/workflows/ 静默删掉。这里显式告警，避免"删掉 CI 却以为成功"。
if (!includeWorkflows) {
  console.warn('注意：未带 --include-workflows，远端 .github/workflows/ 下的工作流会被本次提交删除。');
}

console.log(`准备上传 ${files.length} 个文件${includeWorkflows ? '' : '（已跳过 .github/workflows/）'}`);

// 1) 逐个建 blob
const tree = [];
for (const file of files) {
  const buffer = await readFile(path.resolve(file));
  const blob = await gh('POST', `/repos/${owner}/${repo}/git/blobs`, {
    content: buffer.toString('base64'),
    encoding: 'base64',
  });
  tree.push({ path: file.split(path.sep).join('/'), mode: '100644', type: 'blob', sha: blob.sha });
  console.log(`  ✓ ${file}`);
}

// 2) 建 tree（空仓库不能带 base_tree）
const treeResult = await gh('POST', `/repos/${owner}/${repo}/git/trees`, { tree });

// 3) 建 commit：把当前 main 作为 parent，保持线性历史。
//    之前这里写死 parents: []，导致每次发布都是孤儿提交，默认分支上永远只剩
//    最新一个 commit，旧版本只能靠 SHA 补打 tag 才能找回来。
let parentSha = null;
try {
  const currentRef = await gh('GET', `/repos/${owner}/${repo}/git/ref/heads/main`);
  parentSha = currentRef?.object?.sha ?? null;
} catch {
  parentSha = null; // 空仓库或分支不存在
}

const commit = await gh('POST', `/repos/${owner}/${repo}/git/commits`, {
  message: commitMessage,
  tree: treeResult.sha,
  parents: parentSha ? [parentSha] : [],
});

// 4) 建/更新分支引用
try {
  await gh('POST', `/repos/${owner}/${repo}/git/refs`, { ref: 'refs/heads/main', sha: commit.sha });
} catch (error) {
  if (!String(error.message).includes('422')) throw error;
  await gh('PATCH', `/repos/${owner}/${repo}/git/refs/heads/main`, { sha: commit.sha, force: true });
}

console.log(`\n完成: https://github.com/${owner}/${repo}  commit=${commit.sha}`);
