// server.js
import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// View engine & static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
async function tmdbGet(endpoint, params = {}) {
  try {
    const res = await axios.get(`${TMDB_BASE_URL}${endpoint}`, {
      params: {
        api_key: TMDB_API_KEY,
        language: 'en-US',
        ...params
      }
    });
    return res.data;
  } catch (err) {
    console.error('TMDB error:', err?.response?.data || err.message);
    return null;
  }
}

function slugify(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildCanonical(path) {
  if (!path.startsWith('/')) path = '/' + path;
  return SITE_URL.replace(/\/+$/, '') + path;
}

// Simple in-memory cache for genre lists
const genreCache = {
  movie: null,
  tv: null
};

async function getGenres(mediaType) {
  if (genreCache[mediaType]) return genreCache[mediaType];
  const endpoint =
    mediaType === 'tv' ? '/genre/tv/list' : '/genre/movie/list';
  const data = await tmdbGet(endpoint);
  genreCache[mediaType] = data?.genres || [];
  return genreCache[mediaType];
}

function findGenreName(mediaType, genreId, genresList) {
  const list = genresList || [];
  const g = list.find(g => String(g.id) === String(genreId));
  return g ? g.name : 'Genre';
}

/* =========================
   HOME
   ========================= */
app.get('/', async (req, res) => {
  try {
    const [trendingMovies, trendingTv, popularMovies] = await Promise.all([
      tmdbGet('/trending/movie/week', { page: 1 }),
      tmdbGet('/trending/tv/week', { page: 1 }),
      tmdbGet('/movie/popular', { page: 1 })
    ]);

    const canonicalUrl = buildCanonical('/');
    const metaDescription =
      'Discover trending movies and TV shows from around the world. Auto-generated pages with trailers, ratings, genres and year-based navigation powered by TMDB.';

    const structuredData = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        url: canonicalUrl,
        name: 'StreamingZone',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      },
      null,
      2
    );

    res.render('index', {
      trendingMovies: trendingMovies?.results || [],
      trendingTv: trendingTv?.results || [],
      popularMovies: popularMovies?.results || [],
      imageBase: TMDB_IMAGE_BASE,
      pageTitle: 'StreamingZone – Trending Movies & TV Shows',
      searchMode: false,
      searchQuery: '',
      searchResults: [],
      canonicalUrl,
      metaDescription,
      structuredData,
      ogImage: `${SITE_URL}/og-default.jpg`
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error loading homepage');
  }
});

/* =========================
   DETAIL MOVIE
   ========================= */
app.get('/movie/:id/:slug?', async (req, res) => {
  const { id } = req.params;
  try {
    const movie = await tmdbGet(`/movie/${id}`, {
      append_to_response: 'videos,credits,similar'
    });

    if (!movie) return res.status(404).send('Movie not found');

    const trailer =
      movie.videos?.results?.find(
        v => v.type === 'Trailer' && v.site === 'YouTube'
      ) || movie.videos?.results?.[0];

    const title = movie.title || movie.name || 'Movie';
    const slug = slugify(title);

    if (!req.params.slug || req.params.slug !== slug) {
      return res.redirect(301, `/movie/${id}/${slug}`);
    }

    const canonicalUrl = buildCanonical(`/movie/${id}/${slug}`);
    const overview = movie.overview || '';
    const metaDescription =
      overview.slice(0, 155) || `${title} movie details, rating and trailer.`;

    const ogImage = movie.poster_path
      ? `${TMDB_IMAGE_BASE}${movie.poster_path}`
      : `${SITE_URL}/og-default.jpg`;

    const structuredData = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'Movie',
        name: title,
        image: ogImage,
        description: overview,
        url: canonicalUrl,
        aggregateRating: movie.vote_average
          ? {
              '@type': 'AggregateRating',
              ratingValue: movie.vote_average,
              ratingCount: movie.vote_count || 1
            }
          : undefined,
        datePublished: movie.release_date || undefined
      },
      null,
      2
    );

    res.render('detail', {
      type: 'movie',
      item: movie,
      trailer,
      imageBase: TMDB_IMAGE_BASE,
      pageTitle: `${title} – Movie Details & Trailer`,
      canonicalUrl,
      metaDescription,
      structuredData,
      ogImage
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error loading movie detail');
  }
});

/* =========================
   DETAIL TV
   ========================= */
app.get('/tv/:id/:slug?', async (req, res) => {
  const { id } = req.params;
  try {
    const tv = await tmdbGet(`/tv/${id}`, {
      append_to_response: 'videos,credits,similar'
    });

    if (!tv) return res.status(404).send('TV show not found');

    const trailer =
      tv.videos?.results?.find(
        v => v.type === 'Trailer' && v.site === 'YouTube'
      ) || tv.videos?.results?.[0];

    const title = tv.name || tv.original_name || 'TV Show';
    const slug = slugify(title);

    if (!req.params.slug || req.params.slug !== slug) {
      return res.redirect(301, `/tv/${id}/${slug}`);
    }

    const canonicalUrl = buildCanonical(`/tv/${id}/${slug}`);
    const overview = tv.overview || '';
    const metaDescription =
      overview.slice(0, 155) || `${title} TV show details, rating and trailer.`;

    const ogImage = tv.poster_path
      ? `${TMDB_IMAGE_BASE}${tv.poster_path}`
      : `${SITE_URL}/og-default.jpg`;

    const structuredData = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'TVSeries',
        name: title,
        image: ogImage,
        description: overview,
        url: canonicalUrl,
        numberOfSeasons: tv.number_of_seasons || undefined
      },
      null,
      2
    );

    res.render('detail', {
      type: 'tv',
      item: tv,
      trailer,
      imageBase: TMDB_IMAGE_BASE,
      pageTitle: `${title} – TV Show Details & Trailer`,
      canonicalUrl,
      metaDescription,
      structuredData,
      ogImage
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error loading TV detail');
  }
});

/* =========================
   SEARCH
   ========================= */
app.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.redirect('/');

  try {
    const data = await tmdbGet('/search/multi', { query, page: 1 });

    const canonicalUrl = buildCanonical(`/search?q=${encodeURIComponent(query)}`);
    const metaDescription = `Search results for "${query}" – movies and TV shows.`;
    const structuredData = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'SearchResultsPage',
        name: `Search: ${query}`,
        url: canonicalUrl
      },
      null,
      2
    );

    res.render('index', {
      searchMode: true,
      searchQuery: query,
      searchResults: data?.results || [],
      trendingMovies: [],
      trendingTv: [],
      popularMovies: [],
      imageBase: TMDB_IMAGE_BASE,
      pageTitle: `Search: ${query} – StreamingZone`,
      canonicalUrl,
      metaDescription,
      structuredData,
      ogImage: `${SITE_URL}/og-default.jpg`
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error searching');
  }
});

/* =========================
   LISTING PER GENRE
   ========================= */
app.get('/genre/:mediaType(movie|tv)/:genreId/:slug?', async (req, res) => {
  const { mediaType, genreId } = req.params;
  const pageParam = Number(req.query.page || 1);

  try {
    const genresList = await getGenres(mediaType);
    const genreName = findGenreName(mediaType, genreId, genresList);
    const genreSlug = slugify(genreName);

    if (!req.params.slug || req.params.slug !== genreSlug) {
      return res.redirect(
        301,
        `/genre/${mediaType}/${genreId}/${genreSlug}?page=${pageParam}`
      );
    }

    const endpoint =
      mediaType === 'tv' ? '/discover/tv' : '/discover/movie';

    const data = await tmdbGet(endpoint, {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page: pageParam
    });

    const items = data?.results || [];
    const canonicalUrl = buildCanonical(
      `/genre/${mediaType}/${genreId}/${genreSlug}`
    );
    const metaDescription = `Browse popular ${mediaType === 'tv' ? 'TV shows' : 'movies'} in the "${genreName}" genre.`;

    const structuredData = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${genreName} ${mediaType === 'tv' ? 'TV shows' : 'movies'}`,
        url: canonicalUrl,
        numberOfItems: items.length
      },
      null,
      2
    );

    res.render('listing', {
      mode: 'genre',
      mediaType,
      genreId,
      genreName,
      year: null,
      items,
      imageBase: TMDB_IMAGE_BASE,
      pageTitle: `${genreName} ${mediaType === 'tv' ? 'TV Shows' : 'Movies'} – StreamingZone`,
      canonicalUrl,
      metaDescription,
      structuredData,
      ogImage: `${SITE_URL}/og-default.jpg`,
      currentPage: data?.page || pageParam,
      totalPages: data?.total_pages || 1
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error loading genre page');
  }
});

/* =========================
   LISTING PER YEAR
   ========================= */
app.get('/year/:mediaType(movie|tv)/:year', async (req, res) => {
  const { mediaType, year } = req.params;
  const pageParam = Number(req.query.page || 1);

  try {
    const endpoint =
      mediaType === 'tv' ? '/discover/tv' : '/discover/movie';

    const data = await tmdbGet(endpoint, {
      sort_by: 'popularity.desc',
      page: pageParam,
      ...(mediaType === 'tv'
        ? { 'first_air_date_year': year }
        : { 'primary_release_year': year })
    });

    const items = data?.results || [];
    const canonicalUrl = buildCanonical(`/year/${mediaType}/${year}`);
    const metaDescription = `Discover popular ${mediaType === 'tv' ? 'TV shows' : 'movies'} released in ${year}.`;

    const structuredData = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${mediaType === 'tv' ? 'TV shows' : 'Movies'} in ${year}`,
        url: canonicalUrl,
        numberOfItems: items.length
      },
      null,
      2
    );

    res.render('listing', {
      mode: 'year',
      mediaType,
      year,
      genreId: null,
      genreName: null,
      items,
      imageBase: TMDB_IMAGE_BASE,
      pageTitle: `${mediaType === 'tv' ? 'TV Shows' : 'Movies'} in ${year} – StreamingZone`,
      canonicalUrl,
      metaDescription,
      structuredData,
      ogImage: `${SITE_URL}/og-default.jpg`,
      currentPage: data?.page || pageParam,
      totalPages: data?.total_pages || 1
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error loading year page');
  }
});

/* =========================
   API SECTION – lazy load
   ========================= */
app.get('/api/section', async (req, res) => {
  const section = req.query.section;
  const page = Number(req.query.page || 1);

  let endpoint = '';

  if (section === 'trending-movie') {
    endpoint = '/trending/movie/week';
  } else if (section === 'trending-tv') {
    endpoint = '/trending/tv/week';
  } else if (section === 'popular-movie') {
    endpoint = '/movie/popular';
  } else {
    return res.status(400).json({ error: 'Unknown section' });
  }

  try {
    const data = await tmdbGet(endpoint, { page });

    const items =
      data?.results?.map(item => ({
        id: item.id,
        title: item.title || item.name,
        media_type:
          item.media_type || (section === 'trending-tv' ? 'tv' : 'movie'),
        poster_path: item.poster_path,
        vote_average: item.vote_average,
        date: item.release_date || item.first_air_date || '',
        slug: slugify(item.title || item.name || '')
      })) || [];

    res.json({
      page: data?.page || page,
      total_pages: data?.total_pages || 1,
      results: items
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch section' });
  }
});

/* =========================
   STATIC TRUST PAGES
   ========================= */

// Helper buat render static page
function renderStatic(res, { path, title, description, type }) {
  const canonicalUrl = buildCanonical(path);
  const metaDescription = description;
  const ogImage = `${SITE_URL}/og-default.jpg`;

  const structuredData = JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonicalUrl
    },
    null,
    2
  );

  res.render(type, {
    pageTitle: title,
    canonicalUrl,
    metaDescription,
    ogImage,
    structuredData
  });
}

app.get('/about', (req, res) => {
  renderStatic(res, {
    path: '/about',
    title: 'About StreamingZone',
    description:
      'Learn more about StreamingZone – a movie and TV information site powered by TMDB, built for fast browsing and clean experience.',
    type: 'about'
  });
});

app.get('/privacy-policy', (req, res) => {
  renderStatic(res, {
    path: '/privacy-policy',
    title: 'Privacy Policy – StreamingZone',
    description:
      'Read how StreamingZone collects, uses and protects your personal information and cookies while you browse this website.',
    type: 'privacy'
  });
});

app.get('/terms', (req, res) => {
  renderStatic(res, {
    path: '/terms',
    title: 'Terms of Use – StreamingZone',
    description:
      'Review the terms and conditions that apply when using the StreamingZone website and its features.',
    type: 'terms'
  });
});

app.get('/dmca', (req, res) => {
  renderStatic(res, {
    path: '/dmca',
    title: 'DMCA / Copyright Policy – StreamingZone',
    description:
      'DMCA notice and copyright policy for StreamingZone, including how to submit takedown requests.',
    type: 'dmca'
  });
});

app.get('/contact', (req, res) => {
  renderStatic(res, {
    path: '/contact',
    title: 'Contact – StreamingZone',
    description:
      'Get in touch with the StreamingZone team for feedback, advertising inquiries, or DMCA notices.',
    type: 'contact'
  });
});

/* =========================
   robots.txt
   ========================= */
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    `User-agent: *
Allow: /
Sitemap: ${SITE_URL.replace(/\/+$/, '')}/sitemap.xml
`
  );
});

/* =========================
   sitemap.xml
   ========================= */
app.get('/sitemap.xml', async (req, res) => {
  try {
    const [trendingMovies, trendingTv, popularMovies] = await Promise.all([
      tmdbGet('/trending/movie/week', { page: 1 }),
      tmdbGet('/trending/tv/week', { page: 1 }),
      tmdbGet('/movie/popular', { page: 1 })
    ]);

    const urls = [];

    // Home
    urls.push({
      loc: buildCanonical('/'),
      changefreq: 'hourly',
      priority: '1.0'
    });

    // Static trust pages
    ['/about', '/privacy-policy', '/terms', '/dmca', '/contact'].forEach(p =>
      urls.push({
        loc: buildCanonical(p),
        changefreq: 'monthly',
        priority: '0.5'
      })
    );

    // Popular genres
    const popularMovieGenres = [
      { id: 28, name: 'Action' },
      { id: 35, name: 'Comedy' },
      { id: 18, name: 'Drama' },
      { id: 27, name: 'Horror' },
      { id: 878, name: 'Science Fiction' }
    ];
    popularMovieGenres.forEach(g => {
      urls.push({
        loc: buildCanonical(
          `/genre/movie/${g.id}/${slugify(g.name)}`
        ),
        changefreq: 'daily',
        priority: '0.7'
      });
    });

    // Years
    const years = [2025, 2024, 2023, 2022];
    years.forEach(y => {
      urls.push({
        loc: buildCanonical(`/year/movie/${y}`),
        changefreq: 'weekly',
        priority: '0.6'
      });
      urls.push({
        loc: buildCanonical(`/year/tv/${y}`),
        changefreq: 'weekly',
        priority: '0.6'
      });
    });

    // Detail pages sample
    const addItems = (items = [], type) => {
      items.slice(0, 100).forEach(item => {
        const title = item.title || item.name;
        const slug = slugify(title);
        const path =
          type === 'movie'
            ? `/movie/${item.id}/${slug}`
            : `/tv/${item.id}/${slug}`;
        urls.push({
          loc: buildCanonical(path),
          changefreq: 'daily',
          priority: '0.8',
          lastmod: (item.release_date || item.first_air_date || '').split('T')[0]
        });
      });
    };

    addItems(trendingMovies?.results, 'movie');
    addItems(popularMovies?.results, 'movie');
    addItems(trendingTv?.results, 'tv');

    const xmlItems = urls
      .map(u => {
        return `
  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
${xmlItems}
</urlset>`;

    res.type('application/xml').send(xml);
  } catch (e) {
    console.error(e);
    res.status(500).send('Error generating sitemap');
  }
});

app.listen(PORT, () => {
  console.log(`Server running at ${SITE_URL} (PORT ${PORT})`);
});
