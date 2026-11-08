/**
 * 批量补建历史 Release + tag。
 *
 * 背景：publish-github.mjs 每次用空 base_tree 整体替换，产生的是**孤儿提交**，
 * 默认分支上只留最新一个 commit。旧版本的 commit 对象仍然存在（未被 GC），
 * 所以可以按 SHA 补打 tag，把每个版本钉在它真实的代码快照上。
 *
 * 用法：GITHUB_TOKEN=xxx node scripts/backfill-releases.mjs <owner>/<repo> [--dry]
 */
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repoArg = process.argv[2];
const dry = process.argv.includes('--dry');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : null;
if (!token || !repoArg) {
  console.error('用法: GITHUB_TOKEN=xxx node scripts/backfill-releases.mjs <owner>/<repo> [--dry] [--only=0.8.0]');
  process.exit(1);
}

// 每个版本对应的「该版本最后一个 commit」——已用 contents API 逐个核对 package.json version
const TARGETS = [
  { version: '0.4.0', sha: '7086d4b' },
  { version: '0.5.0', sha: 'ed91deb' },
  { version: '0.6.0', sha: 'a753b1f' },
  { version: '0.7.0', sha: '42a602b' },
].filter((t) => !only || t.version === only);

if (TARGETS.length === 0) {
  console.error(`没有匹配的版本：${only}`);
  process.exit(1);
}

const H = {
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'dsh-cnki-agent',
  'content-type': 'application/json',
};

async function api(path, init) {
  const res = await fetch(`https://api.github.com/repos/${repoArg}${path}`, { headers: H, ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method || 'GET'} ${path} -> ${res.status} ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : {};
}

/** 取该版本发布时点的 CHANGELOG 小节，避免手抄失真。 */
async function changelogSection(sha, version) {
  const file = await api(`/contents/CHANGELOG.md?ref=${sha}`);
  const text = Buffer.from(file.content, 'base64').toString('utf8');
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`).test(l));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## \[/.test(l));
  return rest.slice(0, end < 0 ? rest.length : end).join('\n').trim();
}

async function main() {
  const full = [];
  for (const t of TARGETS) {
    const commit = await api(`/commits/${encodeURIComponent(t.sha)}`);
    full.push({ ...t, sha: commit.sha });
    const pkg = await api(`/contents/package.json?ref=${commit.sha}`);
    const version = JSON.parse(Buffer.from(pkg.content, 'base64').toString('utf8')).version;
    if (version !== t.version) {
      throw new Error(`版本对不上：${t.sha} 的 package.json 是 ${version}，期望 ${t.version}`);
    }
  }

  for (const t of full) {
    const tag = `v${t.version}`;
    console.log(`\n=== ${tag} @ ${t.sha.slice(0, 7)} ===`);
    if (dry) {
      console.log('  [dry] 将创建 tag 与 release');
      continue;
    }
    try {
      await api('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: t.sha }) });
      console.log('  tag 已创建');
    } catch (err) {
      const msg = String(err.message);
      if (msg.includes('422') || msg.includes('Reference already exists')) console.log('  tag 已存在，跳过');
      else throw err;
    }

    const section = await changelogSection(t.sha, t.version);
    const body = [
      `## CNKIAgent ${t.version}`,
      '',
      section || '（该版本 CHANGELOG 小节未找到，见仓库 CHANGELOG.md）',
      '',
      '### 安装 / 升级',
      '```',
      `plugin_manager install_bundle target = "dsh-cnki-agent@${t.version}"`,
      '```',
      '',
      `完整变更：https://github.com/${repoArg}/blob/${t.sha}/CHANGELOG.md`,
    ].join('\n');

    try {
      const rel = await api('/releases', {
        method: 'POST',
        body: JSON.stringify({ tag_name: tag, target_commitish: t.sha, name: tag, body, draft: false, prerelease: false }),
      });
      console.log('  release:', rel.html_url);
    } catch (err) {
      const msg = String(err.message);
      if (msg.includes('already_exists')) console.log('  release 已存在，跳过');
      else throw err;
    }
  }
}

await main();