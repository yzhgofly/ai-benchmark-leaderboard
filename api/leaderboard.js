/**
 * API fallback：返回本地静态 benchmarks.json
 * 浏览器抓取失败时的保底数据源
 */
const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const dataPath = path.join(__dirname, '..', 'data', 'benchmarks.json');

  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    res.status(200).json(data);
  } catch (exc) {
    res.status(500).json({ error: 'Fallback data unavailable: ' + exc.message });
  }
};
