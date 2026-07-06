/* ============================================================
   共用照片牆（所有行程頁共用）
   頁面只需要：
     <div id="gallery-root"></div>
     <script>window.GALLERY_CONFIG = { tag:'xxx-2026', tripStart:'2026-09-05',
       tripDays:7, photoAlt:'北海道', emptyText:'...' };</script>
     <script src="assets/gallery.js" defer></script>
   功能：平行上傳（3 併發）、EXIF 拍攝日自動分組、Lightbox（鍵盤/滑動）、
        管理模式刪照片（連點「共 N 個回憶」5 次 → 輸入 PIN）
   ============================================================ */
(function () {
  const cfg = window.GALLERY_CONFIG || {};
  const CLOUD_NAME = cfg.cloudName || 'dahimm2nk';
  const UPLOAD_PRESET = cfg.uploadPreset || 'travel_journal';
  const TRIP_TAG = cfg.tag;
  const TRIP_START = cfg.tripStart || null; // 'YYYY-MM-DD'
  const TRIP_DAYS = cfg.tripDays || 0;
  const ALT = cfg.photoAlt || '旅遊';
  const EMPTY_TEXT = cfg.emptyText || '還沒有照片，上傳第一張吧！';
  const root = document.getElementById('gallery-root');
  if (!root || !TRIP_TAG) return;

  /* ---------- 版面 ---------- */
  root.innerHTML = `
    <div class="photo-upload-area" id="uploadArea">
      <svg class="upload-icon" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="28" rx="2" stroke="rgba(184,151,90,0.7)" stroke-width="1"/>
        <circle cx="18" cy="22" r="4" stroke="rgba(184,151,90,0.7)" stroke-width="1"/>
        <path d="M6 34l10-10 8 8 6-6 12 12" stroke="rgba(184,151,90,0.7)" stroke-width="1" stroke-linecap="round"/>
        <path d="M30 18V12M27 15l3-3 3 3" stroke="rgba(184,151,90,0.7)" stroke-width="1" stroke-linecap="round"/>
      </svg>
      <div class="upload-text">
        點擊上傳照片或影片<br>
        <strong>iPhone / 電腦皆可直接上傳</strong><br>
        支援 JPG、PNG、MOV、MP4 · 上傳後所有人都看得到
      </div>
    </div>
    <input type="file" id="photoInput" multiple accept="image/*,video/*" style="display:none">
    <div class="upload-progress" id="uploadProgress"></div>
    <div class="admin-bar" id="adminBar">
      <span>管理模式</span>
      <input type="password" id="adminPin" inputmode="numeric" placeholder="PIN" autocomplete="off">
      <button id="adminEnter">進入</button>
      <button id="adminExit" style="background:rgba(250,248,244,0.2);color:#fff;">離開</button>
      <span class="admin-msg" id="adminMsg"></span>
    </div>
    <div class="photo-count" id="photoCount"></div>
    <div id="photoGroups"></div>
    <div class="photo-empty" id="photoEmpty">${EMPTY_TEXT}</div>`;

  const lightboxEl = document.createElement('div');
  lightboxEl.className = 'lightbox';
  lightboxEl.id = 'lightbox';
  lightboxEl.innerHTML = `
    <button class="lightbox-close" aria-label="關閉">✕</button>
    <button class="lightbox-nav lightbox-prev" aria-label="上一張">‹</button>
    <button class="lightbox-nav lightbox-next" aria-label="下一張">›</button>
    <img id="lightboxImg" src="" alt="" style="max-width:90vw;max-height:85vh;object-fit:contain;display:none;">
    <video id="lightboxVid" controls playsinline style="max-width:90vw;max-height:85vh;display:none;background:#000;"></video>
    <div class="lightbox-counter" id="lightboxCounter"></div>`;
  document.body.appendChild(lightboxEl);

  const $ = (id) => document.getElementById(id);
  let mediaItems = [];

  /* ---------- 載入與按日分組 ---------- */
  // EXIF 拍攝時間格式 "2026:09:05 14:23:11"（相機當地時間，直接取用不轉時區）
  function parseWhen(r) {
    if (r.taken_at) {
      const m = String(r.taken_at).match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    }
    return r.created_at ? new Date(r.created_at) : null;
  }

  function dayLabel(d) {
    if (!d) return { key: 'z-other', title: '其他回憶', date: '' };
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const week = '日一二三四五六'[d.getDay()];
    const dateStr = (d.getMonth() + 1) + '月' + d.getDate() + '日（' + week + '）';
    if (TRIP_START) {
      const start = new Date(TRIP_START + 'T00:00:00');
      const dayN = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000) + 1;
      if (dayN >= 1 && (!TRIP_DAYS || dayN <= TRIP_DAYS)) return { key, title: 'Day ' + dayN, date: dateStr };
    }
    return { key, title: d.getFullYear() + '年' + dateStr, date: '' };
  }

  async function loadMedia() {
    try {
      const res = await fetch(`/.netlify/functions/get-photos?tag=${TRIP_TAG}`);
      const data = await res.json();
      mediaItems = (data.resources || []).map((r) => {
        const when = parseWhen(r);
        return {
          id: r.public_id,
          type: r.resource_type,
          when,
          url: r.resource_type === 'video'
            ? `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/q_auto/${r.public_id}.mp4`
            : `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/q_auto,f_auto,w_1600/${r.public_id}`,
          thumb: r.resource_type === 'video'
            ? `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/q_auto,w_500,so_1/${r.public_id}.jpg`
            : `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/q_auto,f_auto,w_500/${r.public_id}`
        };
      });
      mediaItems.sort((a, b) => (a.when ? a.when.getTime() : Infinity) - (b.when ? b.when.getTime() : Infinity));
      renderMedia();
    } catch (e) {
      console.error('載入失敗:', e);
      mediaItems = [];
      renderMedia();
    }
  }

  function itemHTML(m, i) {
    const del = `<button class="media-del" data-idx="${i}">✕ 刪除</button>`;
    if (m.type === 'video') {
      return `<div class="media-item" data-idx="${i}">${del}
        <img src="${m.thumb}" alt="${ALT}影片 ${i + 1}" loading="lazy">
        <div class="media-overlay"><div class="play-btn"><svg viewBox="0 0 24 24" fill="#1a1814"><polygon points="6,3 20,12 6,21"/></svg></div></div>
        <div class="media-type-badge">影片</div></div>`;
    }
    return `<div class="media-item" data-idx="${i}">${del}
      <img src="${m.thumb}" alt="${ALT}照片 ${i + 1}" loading="lazy">
      <div class="media-overlay"><div class="zoom-hint">點擊放大</div></div></div>`;
  }

  function renderMedia() {
    const groupsEl = $('photoGroups');
    const empty = $('photoEmpty');
    const count = $('photoCount');
    if (!mediaItems.length) {
      groupsEl.innerHTML = '';
      empty.style.display = 'block';
      count.textContent = '';
      return;
    }
    empty.style.display = 'none';
    count.textContent = `共 ${mediaItems.length} 個回憶 · 點擊放大瀏覽`;

    // 依拍攝日分組（保持排序後的順序）
    const groups = [];
    let cur = null;
    mediaItems.forEach((m, i) => {
      const lb = dayLabel(m.when);
      if (!cur || cur.key !== lb.key) { cur = { key: lb.key, title: lb.title, date: lb.date, items: [] }; groups.push(cur); }
      cur.items.push(i);
    });

    groupsEl.innerHTML = groups.map((g) => `
      <div class="pg-group">
        <div class="pg-head">${g.title}${g.date ? ` <span class="pg-date">${g.date}</span>` : ''}</div>
        <div class="media-grid">${g.items.map((i) => itemHTML(mediaItems[i], i)).join('')}</div>
      </div>`).join('');

    groupsEl.querySelectorAll('.media-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.media-del')) return;
        openLightbox(+el.dataset.idx);
      });
    });
    groupsEl.querySelectorAll('.media-del').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); onDeleteClick(btn); });
    });
  }

  /* ---------- 上傳（3 個併發） ---------- */
  const progress = () => $('uploadProgress');

  async function uploadOne(file) {
    const isVideo = file.type.startsWith('video');
    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${isVideo ? 'video' : 'image'}/upload`;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', UPLOAD_PRESET);
    fd.append('tags', TRIP_TAG);
    const res = await fetch(endpoint, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
  }

  async function uploadFiles(files) {
    if (!files.length) return;
    const p = progress();
    p.classList.add('active');
    let done = 0, failed = 0;
    const tooBig = [];
    const queue = [];
    for (const file of files) {
      const isVideo = file.type.startsWith('video');
      const maxMB = isVideo ? 100 : 10;
      if (file.size > maxMB * 1024 * 1024) {
        tooBig.push(`${file.name}（${Math.round(file.size / 1048576)}MB，${isVideo ? '影片' : '照片'}上限 ${maxMB}MB${isVideo ? '，可先用手機內建編輯剪短再上傳' : ''}）`);
      } else {
        queue.push(file);
      }
    }
    const total = queue.length;
    const hasVideo = queue.some((f) => f.type.startsWith('video'));
    const tick = () => { p.textContent = `上傳中… 已完成 ${done + failed} / ${total}${hasVideo ? '（影片請耐心等候）' : ''}`; };
    tick();
    const worker = async () => {
      while (queue.length) {
        const file = queue.shift();
        try { await uploadOne(file); done++; }
        catch (err) { console.error('上傳錯誤:', err); failed++; }
        tick();
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, total) }, worker));

    const msgs = [];
    if (done > 0) msgs.push(`✓ 上傳完成！共 ${done} 個檔案`);
    if (failed > 0) msgs.push(`⚠️ ${failed} 個檔案上傳失敗，請檢查網路後重試`);
    if (tooBig.length > 0) msgs.push(`⚠️ ${tooBig.length} 個檔案太大未上傳：${tooBig.join('；')}`);
    p.textContent = msgs.join('　');
    if (done > 0) await loadMedia();
    const holdMs = (failed > 0 || tooBig.length > 0) ? 12000 : 2500;
    setTimeout(() => { p.classList.remove('active'); }, holdMs);
  }

  $('uploadArea').addEventListener('click', () => $('photoInput').click());
  $('photoInput').addEventListener('change', function () {
    uploadFiles(Array.from(this.files));
    this.value = '';
  });
  const uploadArea = $('uploadArea');
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'rgba(184,151,90,0.7)'; });
  uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = 'rgba(184,151,90,0.35)'; });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault(); uploadArea.style.borderColor = 'rgba(184,151,90,0.35)';
    uploadFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/')));
  });

  /* ---------- Lightbox ---------- */
  let currentIndex = 0;
  const lbImg = $('lightboxImg'), lbVid = $('lightboxVid'), lbCounter = $('lightboxCounter');

  function openLightbox(i) { currentIndex = i; showMedia(); lightboxEl.classList.add('active'); }
  function showMedia() {
    const m = mediaItems[currentIndex];
    if (!m) return;
    if (m.type === 'video') {
      lbVid.src = m.url; lbVid.style.display = 'block';
      lbImg.style.display = 'none'; lbImg.src = '';
    } else {
      lbImg.src = m.url; lbImg.style.display = 'block';
      lbVid.pause(); lbVid.style.display = 'none'; lbVid.removeAttribute('src');
    }
    lbCounter.textContent = (currentIndex + 1) + ' / ' + mediaItems.length;
  }
  function nextMedia() { if (!mediaItems.length) return; currentIndex = (currentIndex + 1) % mediaItems.length; showMedia(); }
  function prevMedia() { if (!mediaItems.length) return; currentIndex = (currentIndex - 1 + mediaItems.length) % mediaItems.length; showMedia(); }
  function closeLightbox() {
    lightboxEl.classList.remove('active');
    lbVid.pause(); lbVid.removeAttribute('src'); lbImg.src = '';
  }
  lightboxEl.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lightboxEl.querySelector('.lightbox-prev').addEventListener('click', (e) => { e.stopPropagation(); prevMedia(); });
  lightboxEl.querySelector('.lightbox-next').addEventListener('click', (e) => { e.stopPropagation(); nextMedia(); });
  lightboxEl.addEventListener('click', function (e) { if (e.target === this) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (!lightboxEl.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') nextMedia();
    else if (e.key === 'ArrowLeft') prevMedia();
  });
  let touchStartX = null;
  lightboxEl.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
  lightboxEl.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) { dx < 0 ? nextMedia() : prevMedia(); }
    touchStartX = null;
  }, { passive: true });

  /* ---------- 管理模式（刪照片） ---------- */
  let tapCount = 0, tapTimer = null;
  $('photoCount').addEventListener('click', () => {
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapCount = 0; }, 2500);
    if (tapCount >= 5) {
      tapCount = 0;
      $('adminBar').classList.add('active');
      if (sessionStorage.getItem('galleryPin')) enterAdmin();
    }
  });
  function enterAdmin() {
    document.body.classList.add('gallery-admin');
    $('adminMsg').textContent = '點照片右上角 ✕ 兩次即可刪除';
    $('adminMsg').style.color = 'rgba(250,248,244,0.6)';
  }
  $('adminEnter').addEventListener('click', () => {
    const pin = $('adminPin').value.trim();
    if (!pin) return;
    sessionStorage.setItem('galleryPin', pin);
    enterAdmin();
  });
  $('adminExit').addEventListener('click', () => {
    sessionStorage.removeItem('galleryPin');
    document.body.classList.remove('gallery-admin');
    $('adminBar').classList.remove('active');
    $('adminMsg').textContent = '';
  });

  function onDeleteClick(btn) {
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = '確定刪除？';
      setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = '✕ 刪除'; }, 4000);
      return;
    }
    const idx = +btn.dataset.idx;
    const m = mediaItems[idx];
    btn.textContent = '刪除中…';
    fetch('/.netlify/functions/delete-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_id: m.id, resource_type: m.type, pin: sessionStorage.getItem('galleryPin') || '' })
    }).then((r) => r.json().then((d) => ({ status: r.status, d }))).then(({ status, d }) => {
      const msg = $('adminMsg');
      if (status === 401) {
        msg.textContent = 'PIN 錯誤，請重新輸入';
        msg.style.color = '#e08a7a';
        sessionStorage.removeItem('galleryPin');
        document.body.classList.remove('gallery-admin');
      } else if (d.result === 'ok' || d.result === 'not found') {
        mediaItems.splice(idx, 1);
        renderMedia();
        msg.textContent = '已刪除';
        msg.style.color = 'rgba(250,248,244,0.6)';
      } else {
        msg.textContent = '刪除失敗：' + (d.error || JSON.stringify(d));
        msg.style.color = '#e08a7a';
      }
    }).catch((e) => {
      $('adminMsg').textContent = '連線錯誤：' + e.message;
      $('adminMsg').style.color = '#e08a7a';
    });
  }

  // defer script 執行時 DOM 已就緒，立即載入（不等 window load，
  // 否則 hero 圖/字型慢時照片牆會空白很久）
  loadMedia();
})();
