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

const SUPPORTED_LANGS = ['en', 'id'];
const DEFAULT_LANG = 'en';

// View engine & static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ===== Lang helpers =====
function getLangFromCookie(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)lang_preference=(\w+)/);
  return match ? match[1] : null;
}

function getRequestLang(req, res) {
  let lang = req.query.lang;

  if (lang && SUPPORTED_LANGS.includes(lang)) {
    // Simpan preferensi bahasa (1 tahun)
    res.setHeader(
      'Set-Cookie',
      `lang_preference=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`
    );
    return lang;
  }

  const cookieLang = getLangFromCookie(req);
  if (cookieLang && SUPPORTED_LANGS.includes(cookieLang)) {
    return cookieLang;
  }

  const accept = (req.headers['accept-language'] || '').toLowerCase();
  if (accept.startsWith('id')) return 'id';

  return DEFAULT_LANG;
}

function tmdbLangCode(lang) {
  return lang === 'id' ? 'id-ID' : 'en-US';
}

// ===== TMDB helper =====
async function tmdbGet(endpoint, params = {}, lang = DEFAULT_LANG) {
  try {
    const res = await axios.get(`${TMDB_BASE_URL}${endpoint}`, {
      params: {
        api_key: TMDB_API_KEY,
        language: tmdbLangCode(lang),
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

async function getGenres(mediaType, lang) {
  if (genreCache[mediaType]) return genreCache[mediaType];
  const endpoint =
    mediaType === 'tv' ? '/genre/tv/list' : '/genre/movie/list';
  const data = await tmdbGet(endpoint, {}, lang);
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
  const lang = getRequestLang(req, res);

  try {
    const [trendingMovies, trendingTv, popularMovies] = await Promise.all([
      tmdbGet('/trending/movie/week', { page: 1 }, lang),
      tmdbGet('/trending/tv/week', { page: 1 }, lang),
      tmdbGet('/movie/popular', { page: 1 }, lang)
    ]);

    const canonicalUrl = buildCanonical('/');
    const metaDescription =
      lang === 'id'
        ? 'Jelajahi film dan serial TV trending dari seluruh dunia. Halaman otomatis dengan trailer, rating, genre, dan tahun rilis dari TMDB.'
        : 'Discover trending movies and TV shows from around the world. Auto-generated pages with trailers, ratings, genres and year-based navigation powered by TMDB.';

    const pageTitle =
      lang === 'id'
        ? 'StreamingZone – Film & Serial TV Trending'
        : 'StreamingZone – Trending Movies & TV Shows';

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
      lang,
      trendingMovies: trendingMovies?.results || [],
      trendingTv: trendingTv?.results || [],
      popularMovies: popularMovies?.results || [],
      imageBase: TMDB_IMAGE_BASE,
      pageTitle,
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
  const lang = getRequestLang(req, res);
  const { id } = req.params;

  try {
    const movie = await tmdbGet(
      `/movie/${id}`,
      { append_to_response: 'videos,credits,similar' },
      lang
    );

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
      overview.slice(0, 155) ||
      (lang === 'id'
        ? `${title} – detail film, rating dan trailer.`
        : `${title} movie details, rating and trailer.`);

    const ogImage = movie.poster_path
      ? `${TMDB_IMAGE_BASE}${movie.poster_path}`
      : `${SITE_URL}/og-default.jpg`;

    const pageTitle =
      lang === 'id'
        ? `${title} – Detail & Trailer Film`
        : `${title} – Movie Details & Trailer`;

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
      lang,
      type: 'movie',
      item: movie,
      trailer,
      imageBase: TMDB_IMAGE_BASE,
      pageTitle,
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
  const lang = getRequestLang(req, res);
  const { id } = req.params;

  try {
    const tv = await tmdbGet(
      `/tv/${id}`,
      { append_to_response: 'videos,credits,similar' },
      lang
    );

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
      overview.slice(0, 155) ||
      (lang === 'id'
        ? `${title} – detail serial TV, rating dan trailer.`
        : `${title} TV show details, rating and trailer.`);

    const ogImage = tv.poster_path
      ? `${TMDB_IMAGE_BASE}${tv.poster_path}`
      : `${SITE_URL}/og-default.jpg`;

    const pageTitle =
      lang === 'id'
        ? `${title} – Detail & Trailer Serial TV`
        : `${title} – TV Show Details & Trailer`;

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
      lang,
      type: 'tv',
      item: tv,
      trailer,
      imageBase: TMDB_IMAGE_BASE,
      pageTitle,
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
  const lang = getRequestLang(req, res);
  const query = (req.query.q || '').trim();
  if (!query) return res.redirect('/');

  try {
    const data = await tmdbGet('/search/multi', { query, page: 1 }, lang);

    const canonicalUrl = buildCanonical(`/search?q=${encodeURIComponent(query)}`);
    const metaDescription =
      lang === 'id'
        ? `Hasil pencarian untuk "${query}" – film dan serial TV.`
        : `Search results for "${query}" – movies and TV shows.`;

    const structuredData = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'SearchResultsPage',
        name:
          (lang === 'id' ? 'Pencarian: ' : 'Search: ') +
          query,
        url: canonicalUrl
      },
      null,
      2
    );

    const pageTitle =
      (lang === 'id' ? 'Pencarian: ' : 'Search: ') +
      query +
      ' – StreamingZone';

    res.render('index', {
      lang,
      searchMode: true,
      searchQuery: query,
      searchResults: data?.results || [],
      trendingMovies: [],
      trendingTv: [],
      popularMovies: [],
      imageBase: TMDB_IMAGE_BASE,
      pageTitle,
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
  const lang = getRequestLang(req, res);
  const { mediaType, genreId } = req.params;
  const pageParam = Number(req.query.page || 1);

  try {
    const genresList = await getGenres(mediaType, lang);
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

    const data = await tmdbGet(
      endpoint,
      {
        with_genres: genreId,
        sort_by: 'popularity.desc',
        page: pageParam
      },
      lang
    );

    const items = data?.results || [];
    const canonicalUrl = buildCanonical(
      `/genre/${mediaType}/${genreId}/${genreSlug}`
    );

    const metaDescription =
      lang === 'id'
        ? `Lihat judul populer dalam genre "${genreName}".`
        : `Browse popular ${
            mediaType === 'tv' ? 'TV shows' : 'movies'
          } in the "${genreName}" genre.`;

    const pageTitle =
      lang === 'id'
        ? `${genreName} ${
            mediaType === 'tv' ? 'Serial TV' : 'Film'
          } – StreamingZone`
        : `${genreName} ${
            mediaType === 'tv' ? 'TV Shows' : 'Movies'
          } – StreamingZone`;

    const structuredData = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: pageTitle,
        url: canonicalUrl,
        numberOfItems: items.length
      },
      null,
      2
    );

    res.render('listing', {
      lang,
      mode: 'genre',
      mediaType,
      genreId,
      genreName,
      year: null,
      items,
      imageBase: TMDB_IMAGE_BASE,
      pageTitle,
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
  const lang = getRequestLang(req, res);
  const { mediaType, year } = req.params;
  const pageParam = Number(req.query.page || 1);

  try {
    const endpoint =
      mediaType === 'tv' ? '/discover/tv' : '/discover/movie';

    const data = await tmdbGet(
      endpoint,
      {
        sort_by: 'popularity.desc',
        page: pageParam,
        ...(mediaType === 'tv'
          ? { first_air_date_year: year }
          : { primary_release_year: year })
      },
      lang
    );

    const items = data?.results || [];
    const canonicalUrl = buildCanonical(`/year/${mediaType}/${year}`);

    const baseLabelEn = mediaType === 'tv' ? 'TV Shows' : 'Movies';
    const baseLabelId = mediaType === 'tv' ? 'Serial TV' : 'Film';

    const pageTitle =
      (lang === 'id' ? baseLabelId : baseLabelEn) +
      (lang === 'id' ? ' tahun ' : ' in ') +
      year +
      ' – StreamingZone';

    const metaDescription =
      lang === 'id'
        ? `Temukan ${baseLabelId.toLowerCase()} populer yang rilis tahun ${year}.`
        : `Discover popular ${baseLabelEn.toLowerCase()} released in ${year}.`;

    const structuredData = JSON.stringify(
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: pageTitle,
        url: canonicalUrl,
        numberOfItems: items.length
      },
      null,
      2
    );

    res.render('listing', {
      lang,
      mode: 'year',
      mediaType,
      year,
      genreId: null,
      genreName: null,
      items,
      imageBase: TMDB_IMAGE_BASE,
      pageTitle,
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
  const lang = getRequestLang(req, res);
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
    const data = await tmdbGet(endpoint, { page }, lang);

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
   STATIC TRUST PAGES (auto translate)
   ========================= */
function renderStatic(req, res, config) {
  const lang = getRequestLang(req, res);
  const { path: p, titleEn, titleId, descEn, descId, view } = config;

  const title = lang === 'id' ? titleId : titleEn;
  const description = lang === 'id' ? descId : descEn;

  const canonicalUrl = buildCanonical(p);
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

  res.render(view, {
    lang,
    pageTitle: title,
    canonicalUrl,
    metaDescription: description,
    ogImage,
    structuredData
  });
}

app.get('/about', (req, res) => {
  renderStatic(req, res, {
    path: '/about',
    view: 'about',
    titleEn: 'About StreamingZone',
    titleId: 'Tentang StreamingZone',
    descEn:
      'Learn more about StreamingZone – a movie and TV information site powered by TMDB, built for fast browsing and a clean, modern experience.',
    descId:
      'Pelajari lebih lanjut tentang StreamingZone – situs informasi film dan serial TV berbasis TMDB yang dirancang untuk pengalaman cepat dan modern.'
  });
});

app.get('/privacy-policy', (req, res) => {
  renderStatic(req, res, {
    path: '/privacy-policy',
    view: 'privacy',
    titleEn: 'Privacy Policy – StreamingZone',
    titleId: 'Kebijakan Privasi – StreamingZone',
    descEn:
      'Read how StreamingZone collects, uses and protects your personal information and cookies while you browse this website.',
    descId:
      'Baca bagaimana StreamingZone mengumpulkan, menggunakan, dan melindungi informasi pribadi serta cookies saat Anda menggunakan situs ini.'
  });
});

app.get('/terms', (req, res) => {
  renderStatic(req, res, {
    path: '/terms',
    view: 'terms',
    titleEn: 'Terms of Use – StreamingZone',
    titleId: 'Syarat Penggunaan – StreamingZone',
    descEn:
      'Review the terms and conditions that apply when using the StreamingZone website and its features.',
    descId:
      'Baca syarat dan ketentuan yang berlaku ketika Anda menggunakan situs dan fitur StreamingZone.'
  });
});

app.get('/dmca', (req, res) => {
  renderStatic(req, res, {
    path: '/dmca',
    view: 'dmca',
    titleEn: 'DMCA / Copyright Policy – StreamingZone',
    titleId: 'DMCA / Kebijakan Hak Cipta – StreamingZone',
    descEn:
      'DMCA notice and copyright policy for StreamingZone, including how to submit takedown requests.',
    descId:
      'Pemberitahuan DMCA dan kebijakan hak cipta StreamingZone, termasuk cara mengajukan permintaan penghapusan konten.'
  });
});

app.get('/contact', (req, res) => {
  renderStatic(req, res, {
    path: '/contact',
    view: 'contact',
    titleEn: 'Contact – StreamingZone',
    titleId: 'Kontak – StreamingZone',
    descEn:
      'Get in touch with the StreamingZone team for feedback, advertising inquiries, or DMCA notices.',
    descId:
      'Hubungi tim StreamingZone untuk saran, kerja sama iklan, atau pengajuan DMCA.'
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
    // sitemap pakai bahasa Inggris untuk TMDB
    const [trendingMovies, trendingTv, popularMovies] = await Promise.all([
      tmdbGet('/trending/movie/week', { page: 1 }, 'en'),
      tmdbGet('/trending/tv/week', { page: 1 }, 'en'),
      tmdbGet('/movie/popular', { page: 1 }, 'en')
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
