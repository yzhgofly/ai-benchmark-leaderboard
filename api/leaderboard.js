const { buildPayload } = require('../lib/fetcher');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const payload = await buildPayload();
    res.status(200).json(payload);
  } catch (exc) {
    res.status(500).json({ error: exc.message });
  }
};
