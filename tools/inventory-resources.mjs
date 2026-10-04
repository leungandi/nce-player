/**
 * 盘点 iChochy/NCE 的外挂资源规模。
 * 读取每个课本的 book.json，再对每课的 mp3/lrc 发 HEAD 请求统计体积。
 * 需要出网：通过 HTTPS_PROXY + NODE_USE_ENV_PROXY=1 走本地代理。
 */

const BOOKS = [
  ['NCE1', 'https://nce.mleo.site/NCE1'],
  ['NCE2', 'https://nce.mleo.site/NCE2'],
  ['NCE3', 'https://nce.mleo.site/NCE3'],
  ['NCE4', 'https://nce.mleo.site/NCE4'],
  ['NCE1(85)', 'https://85.mleo.site/NCE1'],
  ['NCE2(85)', 'https://85.mleo.site/NCE2'],
  ['NCE3(85)', 'https://85.mleo.site/NCE3'],
  ['NCE4(85)', 'https://85.mleo.site/NCE4'],
];

const CONCURRENCY = 5;
const ATTEMPTS = 4;

/** 逐段编码路径，保留协议与主机部分。 */
function encodeUrl(url) {
  return url
    .split('/')
    .map((segment, index) => (index < 3 ? segment : encodeURIComponent(segment)))
    .join('/');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 带退避重试的请求，区分限流/超时和真正的 404。 */
async function request(url, options = {}) {
  let lastError = 'unknown';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(encodeUrl(url), options);
      if (response.ok) return response;
      lastError = `HTTP ${response.status}`;
      if (response.status === 404 || response.status === 403) return null;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(300 * 2 ** (attempt - 1));
  }
  return { error: lastError };
}

async function fetchJson(url) {
  const response = await request(url);
  if (!response) throw new Error('HTTP 404');
  if (response.error) throw new Error(response.error);
  return response.json();
}

async function headSize(url) {
  const response = await request(url, { method: 'HEAD' });
  if (!response) return { status: 404 };
  if (response.error) return { status: response.error };
  const length = Number(response.headers.get('content-length'));
  return { status: 200, length: Number.isFinite(length) ? length : NaN };
}

/** 受控并发地跑一批任务。 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const summary = [];

for (const [key, base] of BOOKS) {
  let book;
  try {
    book = await fetchJson(`${base}/book.json`);
  } catch (error) {
    summary.push({ key, base, error: error.message });
    continue;
  }

  const units = (book.units || []).filter((unit) => unit?.filename);
  const probe = await mapLimit(units, CONCURRENCY, async (unit) => {
    const stem = `${base}/${unit.filename}`;
    const [audio, lrc] = await Promise.all([
      headSize(`${stem}.mp3`),
      headSize(`${stem}.lrc`),
    ]);
    return { audio, lrc };
  });

  const audioBytes = probe.reduce((sum, item) => sum + (item.audio.length || 0), 0);
  const lrcBytes = probe.reduce((sum, item) => sum + (item.lrc.length || 0), 0);
  const issues = (kind) => {
    const tally = new Map();
    for (const item of probe) {
      const { status } = item[kind];
      if (status === 200) continue;
      tally.set(status, (tally.get(status) || 0) + 1);
    }
    return tally;
  };
  const missingAudio = probe.filter((item) => item.audio.status !== 200).length;
  const missingLrc = probe.filter((item) => item.lrc.status !== 200).length;

  summary.push({
    key,
    base,
    name: book.name,
    level: book.level,
    cover: book.cover,
    units: units.length,
    audioBytes,
    lrcBytes,
    missingAudio,
    missingLrc,
    audioIssues: [...issues('audio').entries()].map(([k, v]) => `${k}×${v}`).join(','),
    lrcIssues: [...issues('lrc').entries()].map(([k, v]) => `${k}×${v}`).join(','),
    avgAudioBytes: audioBytes / Math.max(1, units.length - missingAudio),
  });
}

console.log('课本          单元数  音频合计    字幕合计   均课音频  非200(mp3/lrc)  原因');
for (const row of summary) {
  if (row.error) {
    console.log(`${row.key.padEnd(13)} 不可用: ${row.error}  (${row.base})`);
    continue;
  }
  console.log(
    [
      row.key.padEnd(13),
      String(row.units).padStart(4),
      mb(row.audioBytes).padStart(9),
      mb(row.lrcBytes).padStart(9),
      mb(row.avgAudioBytes).padStart(9),
      `${row.missingAudio}/${row.missingLrc}`.padStart(13),
    ].join('  ') +
      `  ${row.audioIssues || '-'} | ${row.lrcIssues || '-'}`
  );
}

const ok = summary.filter((row) => !row.error);
console.log(
  `\n合计：${ok.reduce((n, r) => n + r.units, 0)} 课，` +
    `音频 ${mb(ok.reduce((n, r) => n + r.audioBytes, 0))}，` +
    `字幕 ${mb(ok.reduce((n, r) => n + r.lrcBytes, 0))}`
);
