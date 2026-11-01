/**
 * 创建 GitHub Release（避免 PowerShell 传中文 body 时乱码）。
 * 用法：GITHUB_TOKEN=xxx node scripts/create-release.mjs <owner>/<repo>
 */
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repoArg = process.argv[2];
if (!token || !repoArg) {
  console.error('用法: GITHUB_TOKEN=xxx node scripts/create-release.mjs <owner>/<repo>');
  process.exit(1);
}

const body = `## CNKIAgent 0.3.0

### 新增
- **真实知网检索**：通过 dsh-browser-cdp 驱动本机 Edge 打开 kns.cnki.net 检索，返回题录（题名 / 期刊 / 日期 / 文献类型 / 摘要页链接）
- 浏览器通道失败时自动回退 ctx.web，并用 browserError 说明原因
- cnki_search 新增 noBrowser 参数，可强制只用回退通道
- 右侧栏「CNKI 文献库」面板：检索历史与文献清单

### 修复
- value is not lossless JSON：工具输出统一规整为无损 JSON
- bcdp_* 工具改为惰性查找，避免插件加载顺序导致浏览器通道永远为空
- package.json 编码（BOM / 乱码）

### 安装
\`\`\`
plugin_manager install_bundle target = "dsh-cnki-agent@0.3.0"
\`\`\`

详见 CHANGELOG.md。`;

const response = await fetch(`https://api.github.com/repos/${repoArg}/releases`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-cnki-agent',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    tag_name: 'v0.3.0',
    target_commitish: 'main',
    name: 'v0.3.0',
    body,
    draft: false,
    prerelease: false,
  }),
});

const text = await response.text();
if (!response.ok) {
  console.error(`创建失败 ${response.status}: ${text.slice(0, 300)}`);
  process.exit(1);
}
const release = JSON.parse(text);
console.log('tag =', release.tag_name);
console.log('url =', release.html_url);
