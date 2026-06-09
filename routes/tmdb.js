const { Router } = require('express');

const router = Router();

router.get('/:path(*)', async (req, res) => {
  const tmdbPath = req.params.path;
  const apiKey = req.query.api_key || process.env.TMDB_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'No TMDB API key' });

  const url = new URL(`https://api.themoviedb.org/3/${tmdbPath}`);
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'api_key') url.searchParams.set(k, v);
  }
  url.searchParams.set('api_key', apiKey);

  try {
    const tmdbRes = await fetch(url.toString());
    const data = await tmdbRes.json();
    res.status(tmdbRes.status).json(data);
  } catch {
    res.status(502).json({ error: 'TMDB unreachable' });
  }
});

module.exports = router;
