const { buildPayload } = require('../lib/fetcher');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const payload = await buildPayload();
    res.status(200).json({
      ok: true,
      generatedAt: payload.generatedAt,
      sources: payload.sources,
      benchmarkCount: (payload.benchmarks || []).length,
    });
  } catch (exc) {
    res.status(500).json({ ok: false, error: exc.message });
  }
};
