// public/js/main.js
$(function () {
  // ================================
  // AOS (scroll animation)
  // ================================
  if (window.AOS) {
    AOS.init({
      duration: 550,
      once: true,
      easing: 'ease-out-cubic'
    });
  }

  // ================================
  // Lazy fade images
  // ================================
  function applyLazyFade() {
    $('img.lazy-fade').each(function () {
      const $img = $(this);
      if (this.complete) {
        $img.addClass('loaded');
      } else {
        $img.on('load', function () {
          $img.addClass('loaded');
        });
      }
    });
  }

  applyLazyFade();

  // ================================
  // Helper: build card HTML from API item
  // ================================
  function buildCardHTML(item) {
    const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
    const title = item.title || item.name || 'Untitled';
    const year = (item.date || '').slice(0, 4);
    const rating = item.vote_average != null ? item.vote_average : 'N/A';
    const poster = item.poster_path ? item.poster_path : null;
    const slug = item.slug || '';

    const href = `/${mediaType}/${item.id}/${slug}`;

    const posterHTML = poster
      ? `<img class="lazy-fade" src="${poster}" loading="lazy" alt="${title} poster">`
      : `<div class="card-no-image">No image</div>`;

    return `
      <a href="${href}" class="card" data-aos="fade-up" data-aos-delay="60">
        ${posterHTML}
        <div class="card-info">
          <h2>${title}</h2>
          <p class="meta">
            <i class="ri-star-fill"></i> ${rating} • ${year}
          </p>
        </div>
      </a>
    `;
  }

  // ================================
  // Load more sections (AGC friendly)
  // ================================
  $('.load-more').on('click', function () {
    const $btn = $(this);
    const section = $btn.data('section'); // trending-movie, trending-tv, popular-movie
    const targetId = $btn.data('target'); // gridTrendingMovies, gridTrendingTv, gridPopularMovies
    let currentPage = Number($btn.data('page') || 1);

    const $grid = $('#' + targetId);

    // Skeleton id: "skeleton" + (targetId.replace('grid', ''))
    const skeletonId = 'skeleton' + targetId.replace('grid', '');
    const $skeleton = $('#' + skeletonId);

    if (!section || !$grid.length) return;

    // UI state
    const originalHtml = $btn.html();
    $btn.prop('disabled', true).html('<i class="ri-loader-4-line ri-spin"></i> Loading...');
    if ($skeleton.length) {
      $skeleton.css('display', 'grid');
    }

    const nextPage = currentPage + 1;

    $.getJSON('/api/section', { section: section, page: nextPage })
      .done(function (res) {
        if (!res || !Array.isArray(res.results) || !res.results.length) {
          // No more data
          $btn.prop('disabled', true).html('No more items');
          return;
        }

        // Convert poster_path to full URL if needed (API already gives full URL from server.js)
        const htmlParts = res.results.map(buildCardHTML);
        const $newEls = $(htmlParts.join(''));

        $grid.append($newEls);

        // Re-run AOS for new elements
        if (window.AOS) {
          AOS.refreshHard();
        }

        // Apply lazy fade to new images
        applyLazyFade();

        // Update page
        currentPage = res.page || nextPage;
        $btn.data('page', currentPage);

        // Disable if last page
        if (res.total_pages && currentPage >= res.total_pages) {
          $btn.prop('disabled', true).html('No more items');
        } else {
          $btn.prop('disabled', false).html(originalHtml);
        }

        // Smooth scroll a bit to show new content
        const gridOffset = $grid.offset();
        if (gridOffset) {
          $('html, body').animate(
            {
              scrollTop: gridOffset.top - 80
            },
            380
          );
        }
      })
      .fail(function () {
        $btn.prop('disabled', false).html(originalHtml);
      })
      .always(function () {
        if ($skeleton.length) {
          $skeleton.hide();
        }
      });
  });

  // ================================
  // Language switch (auto translate)
  // ================================
  $('.lang-switch button').on('click', function () {
    const $btn = $(this);
    const lang = $btn.data('lang');

    if (!lang) return;
    if ($btn.hasClass('active')) return; // already active

    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      // This will hit server, set cookie, and reload page in selected language
      window.location.href = url.toString();
    } catch (e) {
      // Fallback if URL API not supported
      const separator = window.location.href.indexOf('?') === -1 ? '?' : '&';
      window.location.href = window.location.href + separator + 'lang=' + encodeURIComponent(lang);
    }
  });
});
