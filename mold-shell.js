/*
 * 鋁創模具派工系統 LINE 頁（外殼的程式）—— 很少改。
 *   1. 一打開就「叫醒」模具伺服器（ping：不驗身分、不讀表），順便問畫面本體該載哪一版（只收 1～999 的整數）。
 *   2. 載 mold-app-<版號>.js；載不到（GitHub 還沒更新好）就退回 FALLBACK 那一版。
 *   以後改畫面：放一個新檔名的 mold-app-<n+1>.js（舊的不刪）、伺服器 LIFF_CONTENT_VERSION 改成 n+1 —— 不用去 LINE 後台改網址，也避開快取。
 */
(function () {
  'use strict';
  var GAS = 'https://script.google.com/macros/s/AKfycbyXZ_mioT27ja9viW5A-XEdctD0DN8hMnf2Gnyr5kKiKPnRWdJDO81DDsm0THUhLgy1bg/exec';
  var LIFF_ID = '2011795144-XlGzq8wv';   // LINE Developers「鋁創模具派工」通道底下的「模具派工」入口（2026-09-30 建）；推送的 bat 會檢查格式
  var FALLBACK = 1;
  window.MOLD_GAS = GAS;
  window.MOLD_LIFF_ID = LIFF_ID;
  var loaded = false;
  function load(v) {
    if (loaded) return;
    loaded = true;
    var s = document.createElement('script');
    s.src = 'mold-app-' + v + '.js';
    s.onerror = function () {
      if (v !== FALLBACK) { loaded = false; load(FALLBACK); return; }
      var b = document.getElementById('boot');
      if (b) b.textContent = '頁面載入失敗，請關掉再開一次。 Failed to load — close and open again. โหลดไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่';
    };
    document.body.appendChild(s);
  }
  //  伺服器冷啟動可能要十幾秒：等 20 秒還沒回才退回第 1 版（等太短的話，出了新版之後慢的人會默默用到舊畫面；v0.2.0 審查）
  var timer = setTimeout(function () { load(FALLBACK); }, 20000);
  try {
    fetch(GAS + '?api=liff', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: '{"action":"ping"}' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        clearTimeout(timer);
        var v = j && j.v;
        load((typeof v === 'number' && Math.floor(v) === v && v >= 1 && v <= 999) ? v : FALLBACK);
      })
      .catch(function () { clearTimeout(timer); load(FALLBACK); });
  } catch (e) { clearTimeout(timer); load(FALLBACK); }
})();
