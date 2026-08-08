const { buildPayload } = require('../lib/fetcher');

// 进程内 TTL 缓存：避免每次请求都去抓 3 个外部站点（总耗时可达数十秒）。
// Vercel Serverless 同实例复用时生效；配合 CDN s-maxage 形成两层缓存。
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
let cached = null; // { payload, at }
let inflight = null; // 进行中的抓取 Promise（并发去重）

function isFresh() {
  return cached && Date.now() - cached.at < CACHE_TTL_MS;
}

// stale-while-revalidate：有缓存时立即返回（哪怕过期），后台异步刷新；
// 无缓存时等待 inflight 完成后返回。force=true 时跳过缓存强制刷新。
async function getPayload(force) {
  if (!force && isFresh()) return cached.payload;

  if (!inflight) {
    inflight = buildPayload()
      .then((payload) => {
        cached = { payload, at: Date.now() };
        inflight = null;
        return payload;
      })
      .catch((err) => {
        inflight = null;
        // 抓取失败：若有过期缓存则兜底返回，否则向上抛错
        if (cached) return cached.payload;
        throw err;
      });
  }

  // 非强制刷新且已有（可能过期的）缓存：先返回旧数据，后台刷新
  if (!force && cached) return cached.payload;
  return inflight;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 浏览器每次校验（max-age=0），CDN 边缘缓存 5 分钟，
  // 5~15 分钟内可返回旧数据并在后台异步刷新（stale-while-revalidate）。
  res.setHeader(
    'Cache-Control',
    'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
  );

  const force =
    req.query && (req.query.force === '1' || req.query.force === 'true');

  try {
    const payload = await getPayload(force);
    res.status(200).json(payload);
  } catch (exc) {
    res.status(500).json({ error: exc.message });
  }
};
