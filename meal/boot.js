/*
 * 點餐系統 LINE 頁外殼（meal-liff-3，M4 v0.5.0）：LIFF 初始化 → 同時叫醒點餐伺服器（ping，順便問要載哪一版內容）→ 載 app-<版號>.js。
 *   不存任何身分資料；身分憑證（idToken）每個請求都跟 LINE 現拿（app-<n>.js 裡）。畫面一律 textContent。
 */
(function () {
  'use strict';
  var LIFF_ID = '2012025322-vLggdapT';   // 「鋁創點餐」通道底下的正式入口「點餐」；推送的 bat 會檢查
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbzw8iqSiZ9xdiCR3baICTBXZwFCT0L7lCvt56GRcg7XJ4mutieiQhUt7YnALnkSuTwp/exec';
  var $ = function (id) { return document.getElementById(id); };
  function status(t, bad) { var e = $('status'); e.textContent = t; e.className = bad ? 'hint warn' : 'muted'; }
  //  叫醒伺服器跟 LINE 初始化同時做（開頁只多打這一下；規格 3.1 速度目標）
  var pingP = fetch(GAS_URL + '?api=liff', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: '{"action":"ping"}' })
    .then(function (r) { return r.json(); }).catch(function () { return null; });
  if (!window.liff) { status('LINE 的程式沒有載入，請關掉這一頁再從 LINE 打開', true); return; }
  liff.init({ liffId: LIFF_ID }).then(function () {
    if (!liff.isLoggedIn()) { status('登入 LINE 中…'); liff.login({ redirectUri: location.href }); return; }
    return pingP.then(function (p) {
      var v = p && p.success && /^\d{1,3}$/.test(String(p.v)) ? String(p.v) : '1';
      window.MEAL_BOOT = { GAS_URL: GAS_URL, liff: liff, t0: Date.now() };
      var s = document.createElement('script');
      s.src = 'app-' + v + '.js?b=3';   // ?b＝推送版號（meal-liff-3）：LINE 內建瀏覽器快取舊檔時換版就會重抓
      s.addEventListener('error', function () { status('頁面內容載不到（app-' + v + '.js），請稍後再開一次', true); });
      document.body.appendChild(s);
    });
  }).catch(function (e) { status('LINE 初始化失敗：' + String(e && e.code || '') + ' ' + String(e && e.message || e).substring(0, 120), true); });
})();
