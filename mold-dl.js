/*
 * 鋁創模具派工系統：手機瀏覽器的下載頁（mold-dl.html 的程式；v0.5.1）。
 *   網址：mold-dl.html#t=<一次性憑證 64 碼>&l=<zh|en|th>（憑證放 # 後面：不會送到 GitHub 的伺服器紀錄）
 *   ① 先把 # 後面從網址列清掉（憑證只留在這一頁的記憶體裡）② POST 模具伺服器 ?api=dl {"ticket":…} 換檔案 ③ 一顆「下載」鈕（<a download>，手機瀏覽器支援）
 *   憑證只能換一次：換到之後這一頁可以重按「下載」；重新整理或再開一次 ⇒「連結已失效或用過了，請回 LINE 再按一次下載」。
 *   伺服器忙線（LOCK_TIMEOUT，憑證沒用掉）或連不上 ⇒「再試一次」（用記憶體裡同一張憑證）。
 */
(function () {
  'use strict';
  var GAS = 'https://script.google.com/macros/s/AKfycbyXZ_mioT27ja9viW5A-XEdctD0DN8hMnf2Gnyr5kKiKPnRWdJDO81DDsm0THUhLgy1bg/exec';
  var TICKET_RE = /^[0-9a-f]{64}$/;
  var I18N = {
    zh: { title: '鋁創 · 模具檔案下載', loading: '準備下載…', ready: '檔案準備好了，按下面的鈕存到手機：', btn: '⬇ 下載', retry: '再試一次',
          hintIos: 'iPhone：存好之後在「檔案」App 的「下載項目」裡。', hintAndroid: 'Android：存好之後在「下載」資料夾裡。', hintCad: 'DWG／DXF 手機打不開，請傳到電腦用 CAD 開。',
          expired: '下載連結已失效或用過了（連結 5 分鐘內有效、只能用一次）。請回 LINE 再按一次「下載」。',
          net: '連不上伺服器，請確認網路後按「再試一次」。', busy: '系統忙線中，請稍等幾秒再按「再試一次」。',
          gone: '這個檔案找不到了（可能被刪掉），請聯絡鋁創。', notFound: '找不到這個檔（可能已經被移除），請回 LINE 重新整理後再看。',
          tooBig: '檔案太大，請聯絡鋁創。', generic: '下載失敗，請回 LINE 再按一次「下載」。' },
    en: { title: 'AL-TRON · Mold file download', loading: 'Preparing the download…', ready: 'The file is ready — tap the button below to save it:', btn: '⬇ Download', retry: 'Try again',
          hintIos: 'iPhone: after saving, it is in the Files app under "Downloads".', hintAndroid: 'Android: after saving, it is in the "Downloads" folder.', hintCad: 'A phone cannot open DWG/DXF — send it to a computer and open it with CAD.',
          expired: 'This download link has expired or was already used (links work once, within 5 minutes). Go back to LINE and tap "Download" again.',
          net: 'Cannot reach the server — check the connection and tap "Try again".', busy: 'The system is busy — wait a few seconds and tap "Try again".',
          gone: 'This file can no longer be found (it may have been deleted) — please contact AL-TRON.', notFound: 'This file was not found (it may have been removed) — go back to LINE and refresh.',
          tooBig: 'The file is too large — please contact AL-TRON.', generic: 'The download failed — go back to LINE and tap "Download" again.' },
    th: { title: 'AL-TRON · ดาวน์โหลดไฟล์แม่พิมพ์', loading: 'กำลังเตรียมดาวน์โหลด…', ready: 'ไฟล์พร้อมแล้ว กดปุ่มด้านล่างเพื่อบันทึกลงมือถือ:', btn: '⬇ ดาวน์โหลด', retry: 'ลองอีกครั้ง',
          hintIos: 'iPhone: บันทึกแล้วจะอยู่ในแอป "ไฟล์" ที่ "ดาวน์โหลด"', hintAndroid: 'Android: บันทึกแล้วจะอยู่ในโฟลเดอร์ "ดาวน์โหลด"', hintCad: 'มือถือเปิด DWG/DXF ไม่ได้ กรุณาส่งไปที่คอมพิวเตอร์แล้วเปิดด้วย CAD',
          expired: 'ลิงก์ดาวน์โหลดหมดอายุหรือถูกใช้ไปแล้ว (ใช้ได้ครั้งเดียวภายใน 5 นาที) กรุณากลับไปที่ LINE แล้วกด "ดาวน์โหลด" อีกครั้ง',
          net: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบเครือข่ายแล้วกด "ลองอีกครั้ง"', busy: 'ระบบไม่ว่าง รอสักครู่แล้วกด "ลองอีกครั้ง"',
          gone: 'ไม่พบไฟล์นี้แล้ว (อาจถูกลบ) กรุณาติดต่อ AL-TRON', notFound: 'ไม่พบไฟล์นี้ (อาจถูกนำออกแล้ว) กรุณากลับไปที่ LINE แล้วรีเฟรช',
          tooBig: 'ไฟล์ใหญ่เกินไป กรุณาติดต่อ AL-TRON', generic: 'ดาวน์โหลดไม่สำเร็จ กรุณากลับไปที่ LINE แล้วกด "ดาวน์โหลด" อีกครั้ง' }
  };
  function $(id) { return document.getElementById(id); }
  function parseHash(h) {
    var out = {}, s = String(h || '').replace(/^#/, '');
    s.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) { try { out[kv.substring(0, i)] = decodeURIComponent(kv.substring(i + 1)); } catch (e) {} } });
    return out;
  }
  var q = parseHash(location.hash), ticket = String(q.t || '');
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e0) {}   // 憑證不留在網址列／瀏覽紀錄
  var nav = String((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
  var lang = Object.prototype.hasOwnProperty.call(I18N, q.l || '') ? q.l : (/^th/.test(nav) ? 'th' : (/^zh/.test(nav) ? 'zh' : 'en'));
  var T = I18N[lang];
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : lang;
  document.title = T.title; $('title').textContent = T.title;
  var busy = false, blobUrl = '';
  function say(txt, isErr) { var m = $('msg'); m.textContent = txt; m.className = isErr ? 'err' : ''; }
  function showRetry(on) { var b = $('retry'); b.textContent = T.retry; b.hidden = !on; }
  function errMsg(j) {
    var code = String((j && j.errorCode) || ''), k = String((j && j.errorParams && j.errorParams.k) || '');
    if (code === 'DL_EXPIRED') return { txt: T.expired };
    if (code === 'LOCK_TIMEOUT') return { txt: T.busy, retry: true };
    if (k === 'DRAWING_GONE') return { txt: T.gone };
    if (k === 'DRAWING_SIZE') return { txt: T.tooBig };
    if (code === 'NOT_FOUND') return { txt: T.notFound };
    return { txt: T.generic };
  }
  function hints(isCad) {
    var box = $('hints'); box.textContent = '';
    var ua = String(navigator.userAgent || ''), ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
    var lines = [];
    if (ios || !android) lines.push(T.hintIos);
    if (android || !ios) lines.push(T.hintAndroid);
    if (isCad) lines.push(T.hintCad);
    lines.forEach(function (s) { var p = document.createElement('p'); p.className = 'hint'; p.textContent = s; box.appendChild(p); });
    box.hidden = false;
  }
  //  blob 的型別只放這三種（其他一律 octet-stream）：這個網域上還有請假頁，瀏覽器萬一沒照 download 存、改成打開，也不會變成一頁會跑的網頁
  var SAFE_TYPES = { 'application/pdf': 1, 'image/jpeg': 1, 'image/png': 1 };
  function ready(j) {
    var bin = atob(j.data), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var cad = !!j.downloadOnly, ty = String(j.type || '');
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (eR) {} }
    blobUrl = URL.createObjectURL(new Blob([arr], { type: (!cad && SAFE_TYPES[ty] === 1) ? ty : 'application/octet-stream' }));
    say(T.ready, false);
    var nm = $('name'); nm.textContent = String(j.name); nm.hidden = false;
    var a = $('dl'); a.href = blobUrl; a.setAttribute('download', String(j.name)); a.textContent = T.btn; a.hidden = false;
    showRetry(false); hints(cad);
  }
  function go() {
    if (busy) return;
    if (!TICKET_RE.test(ticket)) { say(T.expired, true); showRetry(false); return; }
    busy = true; say(T.loading, false); showRetry(false);
    //  60 秒沒回來就當斷線（給「再試一次」）；不支援 AbortController 的舊瀏覽器就等瀏覽器自己的逾時
    var ac = null, timer = null;
    try { ac = new AbortController(); timer = setTimeout(function () { try { ac.abort(); } catch (eA) {} }, 60000); } catch (eC) { ac = null; }
    var opts = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ticket: ticket }) };
    if (ac) opts.signal = ac.signal;
    fetch(GAS + '?api=dl', opts)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        clearTimeout(timer); busy = false;
        if (j && j.success === true && typeof j.data === 'string' && j.name) {   // 換到了 ⇒ 憑證已經沒用了（伺服器那邊也刪了）
          ticket = '';
          try { ready(j); } catch (eR) { say(T.generic, true); showRetry(false); $('dl').hidden = true; }   // 內容壞掉（照理不會）⇒ 講失敗，不要一直停在「準備下載」
          return;
        }
        var e = errMsg(j); if (!e.retry) ticket = '';
        say(e.txt, true); showRetry(!!e.retry);
      }, function () { clearTimeout(timer); busy = false; say(T.net, true); showRetry(true); });
  }
  $('retry').addEventListener('click', go);
  go();
})();
