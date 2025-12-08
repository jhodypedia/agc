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
  // Core load-more handler (manual & auto)
  // ================================
  function triggerLoadMore($btn, isAuto) {
    const section = $btn.data('section'); // trending-movie, trending-tv, popular-movie
    const targetId = $btn.data('target'); // gridTrendingMovies, gridTrendingTv, gridPopularMovies
    let currentPage = Number($btn.data('page') || 1);

    if (!section || !targetId) return;
    if ($btn.data('loading')) return; // already loading

    const $grid = $('#' + targetId);
    if (!$grid.length) return;

    // Skeleton id: "skeleton" + (targetId.replace('grid', ''))
    const skeletonId = 'skeleton' + targetId.replace('grid', '');
    const $skeleton = $('#' + skeletonId);

    // UI state
    const originalHtml = $btn.html();
    $btn.data('loading', true);
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

        // Smooth scroll hanya untuk klik manual
        if (!isAuto) {
          const gridOffset = $grid.offset();
          if (gridOffset) {
            $('html, body').animate(
              {
                scrollTop: gridOffset.top - 80
              },
              380
            );
          }
        }
      })
      .fail(function () {
        $btn.prop('disabled', false).html(originalHtml);
      })
      .always(function () {
        $btn.data('loading', false);
        if ($skeleton.length) {
          $skeleton.hide();
        }
      });
  }

  // ================================
  // Klik tombol "Load more"
  // ================================
  $('.load-more').on('click', function () {
    triggerLoadMore($(this), false);
  });

  // ================================
  // Auto infinite scroll (IntersectionObserver)
  // ================================
  function setupAutoLoad() {
    const buttons = document.querySelectorAll('.load-more');
    if (!buttons.length) return;

    // Inisialisasi counter auto-load per button
    $('.load-more').each(function () {
      const $btn = $(this);
      if ($btn.data('autoCount') == null) {
        $btn.data('autoCount', 0);
      }
    });

    if (!('IntersectionObserver' in window)) {
      // Browser lama: skip, manual only
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;

          const btn = entry.target;
          const $btn = $(btn);

          if ($btn.prop('disabled')) return;
          if ($btn.data('loading')) return;

          let autoCount = Number($btn.data('autoCount') || 0);
          const maxAuto = 3; // max auto-load per section

          if (autoCount >= maxAuto) return;

          autoCount += 1;
          $btn.data('autoCount', autoCount);

          triggerLoadMore($btn, true);
        });
      },
      {
        root: null,
        rootMargin: '0px 0px 120px 0px',
        threshold: 0.2
      }
    );

    buttons.forEach(btn => observer.observe(btn));
  }

  setupAutoLoad();

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
      window.location.href = url.toString();
    } catch (e) {
      const separator = window.location.href.indexOf('?') === -1 ? '?' : '&';
      window.location.href =
        window.location.href + separator + 'lang=' + encodeURIComponent(lang);
    }
  });

  // ================================
  // Scroll-to-top floating button
  // ================================
  const $scrollTopBtn = $(
    '<button id="scrollTopBtn" aria-label="Scroll to top"><i class="ri-arrow-up-line"></i></button>'
  ).appendTo('body');

  function updateScrollTopBtn() {
    const y = window.scrollY || window.pageYOffset;
    if (y > 320) {
      $scrollTopBtn.addClass('show');
    } else {
      $scrollTopBtn.removeClass('show');
    }
  }

  $(window).on('scroll', function () {
    updateScrollTopBtn();
  });

  $scrollTopBtn.on('click', function () {
    $('html, body').animate(
      {
        scrollTop: 0
      },
      450
    );
  });

  // initial state
  updateScrollTopBtn();
});
