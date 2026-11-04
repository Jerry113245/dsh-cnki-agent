/**
 * 修正仓库 description（避免 PowerShell 把中文/冒号传成乱码）。
 * 用法：GITHUB_TOKEN=xxx node scripts/set-repo-meta.mjs <owner>/<repo>
 */
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repoArg = process.argv[2];
if (!token || !repoArg) {
  console.error('用法: GITHUB_TOKEN=xxx node scripts/set-repo-meta.mjs <owner>/<repo>');
  process.exit(1);
}

const description =
  'CNKIAgent：DeepSeek Harness 知网论文研究助手插件。通过 dsh-browser-cdp 驱动本机 Edge 真实检索知网，按核心期刊编辑视角精读，分步写作（大纲→引言→正文→校订），并带右侧栏文献库面板。';

const response = await fetch(`https://api.github.com/repos/${repoArg}`, {
  method: 'PATCH',
  headers: {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-cnki-agent',
    'content-type': 'application/json',
  },
  body: JSON.stringify({ description, homepage: `https://github.com/${repoArg}` }),
});

const text = await response.text();
if (!response.ok) {
  console.error(`更新失败 ${response.status}: ${text.slice(0, 300)}`);
  process.exit(1);
}
const repo = JSON.parse(text);
console.log('description =', repo.description);
