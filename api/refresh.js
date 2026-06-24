/**
 * Refresh API fallback：返回静态数据的摘要信息
 */
const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const dataPath = path.join(__dirname, '..', 'data', 'benchmarks.json');

  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    res.status(200).json({
      ok: true,
      generatedAt: data.generatedAt || null,
      sources: data.sources || [],
      benchmarkCount: (data.benchmarks || []).length,
      note: 'static fallback - browser fetching unavailable',
    });
  } catch (exc) {
    res.status(500).json({ ok: false, error: exc.message });
  }
};
