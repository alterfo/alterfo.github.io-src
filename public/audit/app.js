'use strict';

/* ==========================================================
   Конфигурация API
   ----------------------------------------------------------
   Лендинг статический. Форма бьёт в /lead того же API Gateway,
   что обслуживает остальные лендинги проекта (fincontext-mcp-gw).
   Можно переопределить снаружи через window.__PDMM_API__.
   ========================================================== */
var API_BASE = (typeof window !== 'undefined' && window.__PDMM_API__) || '';
var LEAD_SOURCE = 'pdmm-audit';

(function () {
  // ---- Тень/бордер хедера при скролле --------------------
  var header = document.getElementById('header');
  function onScroll() { header.classList.toggle('scrolled', window.scrollY > 8); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---- Reveal при скролле через IntersectionObserver -----
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e, i) {
        if (e.isIntersecting) {
          e.target.style.transitionDelay = (Math.min(i, 4) * 60) + 'ms';
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // ---- Год в футере --------------------------------------
  document.getElementById('year').textContent = new Date().getFullYear();

  // ---- Слайдер кейсов --------------------------------------
  var sliderTrack = document.getElementById('sliderTrack');
  if (sliderTrack) {
    var sliderPrev = document.getElementById('sliderPrev');
    var sliderNext = document.getElementById('sliderNext');
    var slideBy = function (dir) {
      var card = sliderTrack.querySelector('.slide');
      var gap = 18;
      var step = (card ? card.getBoundingClientRect().width : 300) + gap;
      sliderTrack.scrollBy({ left: dir * step, behavior: 'smooth' });
    };
    if (sliderPrev) sliderPrev.addEventListener('click', function () { slideBy(-1); });
    if (sliderNext) sliderNext.addEventListener('click', function () { slideBy(1); });
  }

  // ---- Кнопка брони (плейсхолдер) ------------------------
  document.getElementById('bookBtn').addEventListener('click', function (ev) {
    ev.preventDefault();
    document.getElementById('applyForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('name').focus();
  });

  // ---- Форма заявки → POST /lead -------------------------
  var form = document.getElementById('applyForm');
  var msgBox = document.getElementById('formMsg');
  var submitBtn = document.getElementById('submitBtn');

  function showMsg(text, kind) {
    msgBox.textContent = text;
    msgBox.className = 'form-msg show ' + kind;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();

    var name = document.getElementById('name');
    var email = document.getElementById('email');

    if (!email.value.trim() || !email.checkValidity()) {
      showMsg('Укажите корректный рабочий email.', 'err');
      email.focus();
      return;
    }

    var payload = {
      email: email.value.trim(),
      message: name.value.trim() ? 'Имя: ' + name.value.trim() : '',
      source: LEAD_SOURCE
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';

    fetch(API_BASE + '/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { ok: res.ok, body: b }; }); })
      .then(function (r) {
        if (r.ok && r.body && r.body.ok) {
          showMsg('Спасибо — заявка принята. Отвечу в течение 2 рабочих дней.', 'ok');
          form.reset();
        } else {
          var err = (r.body && r.body.error) === 'invalid_email'
            ? 'Проверьте email — он выглядит некорректным.'
            : 'Не удалось отправить заявку. Попробуйте ещё раз или напишите на почту.';
          showMsg(err, 'err');
        }
      })
      .catch(function () {
        showMsg('Сеть недоступна. Попробуйте ещё раз или напишите на почту.', 'err');
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Подать заявку на диагностику →';
      });
  });
})();
