/*
 * 點餐系統 LINE 頁外殼（meal-liff-9，v0.8.2）：LIFF 初始化 → 同時叫醒點餐伺服器（ping，順便問要載哪一版內容）→ 載 app-<版號>.js。
 *   不存任何身分資料；身分憑證（idToken）每個請求都跟 LINE 現拿（app-<n>.js 裡）。畫面一律 textContent。
 *   v0.8.2：ping 等太久（開頁後 8 秒、20 秒）就再叫一次，誰先回就用誰；開頁 40 秒還沒拿到版號 ⇒ 寫「連不到」（以前只叫一次、沒有時間上限，卡住就一直停在「載入中」）；
 *           畫面寫現在卡在哪一段；各段花幾毫秒放 MEAL_BOOT.tm，app-7.js 起會帶給伺服器記下來（只有時間、次數，沒有身分資料）。
 */
(function () {
  'use strict';
  var LIFF_ID = '2012025322-vLggdapT';   // 「鋁創點餐」通道底下的正式入口「點餐」；推送的 bat 會檢查
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbzw8iqSiZ9xdiCR3baICTBXZwFCT0L7lCvt56GRcg7XJ4mutieiQhUt7YnALnkSuTwp/exec';
  var PING_AGAIN_MS = [8000, 20000];      // 開頁後這些時間點 ping 還沒回 ⇒ 再叫一次（前面那幾下不取消，誰先回用誰）
  var PING_GIVE_UP_MS = 40000;            // 開頁後這麼久還沒有任何一下回版號 ⇒ 放棄（回應卡在路上的 fetch 不會自己失敗，要有總期限）
  var T0 = Date.now(), tm = { liff: -1, ver: -1, pings: 1 }, onServer = false;   // onServer：畫面正在寫「等伺服器」（LINE 那邊出錯時不會被「再叫一次」蓋掉）
  var $ = function (id) { return document.getElementById(id); };
  function status(t, bad) { var e = $('status'); if (!e) return; e.textContent = t; e.className = bad ? 'hint warn' : 'muted'; }
  function ping() {
    return fetch(GAS_URL + '?api=liff', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: '{"action":"ping"}' })
      .then(function (r) { return r.json(); })
      .then(function (p) { return p && p.success && /^\d{1,3}$/.test(String(p.v)) ? String(p.v) : null; }, function () { return null; });
  }
  //  叫醒伺服器跟 LINE 初始化同時做（開頁只多打這一下；規格 3.1 速度目標）；誰先回一個版號就用誰
  var verP = new Promise(function (resolve) {
    var left = 1 + PING_AGAIN_MS.length, got = false;
    var end = function (v) { if (got) return; got = true; resolve(v); };
    var one = function () { ping().then(function (v) { left--; if (v) end(v); else if (left === 0) end(null); }); };
    one();
    PING_AGAIN_MS.forEach(function (ms) { setTimeout(function () { if (got) return; tm.pings++; if (onServer) status('伺服器回應比較慢，再叫一次…'); one(); }, ms); });
    setTimeout(function () { end(null); }, PING_GIVE_UP_MS);
  });
  if (!window.liff) { status('LINE 的程式沒有載入，請關掉這一頁再從 LINE 打開', true); return; }
  status('連線 LINE 中…');
  liff.init({ liffId: LIFF_ID }).then(function () {
    tm.liff = Date.now() - T0;
    if (!liff.isLoggedIn()) { status('登入 LINE 中…'); liff.login({ redirectUri: location.href }); return; }
    onServer = true; status('連線伺服器中…');
    return verP.then(function (p) {
      tm.ver = Date.now() - T0; onServer = false;
      if (!p) { status('連不到點餐伺服器，請關掉這一頁，稍後再從 LINE 打開', true); return; }   // 三次都沒拿到版號（以前會去載 app-1.js，那是很舊的版本）
      var v = p;
      window.MEAL_BOOT = { GAS_URL: GAS_URL, liff: liff, t0: T0, tm: tm };
      status('載入頁面中…');
      var s = document.createElement('script');
      s.src = 'app-' + v + '.js?b=3';   // ?b＝推送版號（meal-liff-3）：LINE 內建瀏覽器快取舊檔時換版就會重抓
      s.addEventListener('error', function () { status('頁面內容載不到（app-' + v + '.js），請稍後再開一次', true); });
      document.body.appendChild(s);
    });
  }).catch(function (e) { onServer = false; status('LINE 初始化失敗：' + String(e && e.code || '') + ' ' + String(e && e.message || e).substring(0, 120), true); });
})();
