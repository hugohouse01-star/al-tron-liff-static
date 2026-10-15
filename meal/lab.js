/*
 * 點餐系統 M0 實機實驗頁（規格第 7 節 E1、E5、E7、E8）—— 程式。
 *   不連任何資料、不寫任何東西：只把 LINE 給的資訊顯示出來，按鈕才會送測試訊息／要求授權。
 *   瀏覽器裡只存計時數字（localStorage 的 meal_lab_runs_v1、sessionStorage 的 meal_lab_first），不存身分資料。
 *   畫面一律 textContent，不拼 HTML。
 */
(function () {
  'use strict';
  var LIFF_ID = '2012025322-dA17cYb4';   // LINE Developers「鋁創點餐」通道底下的「點餐實驗」入口；推送的 bat 會檢查格式
  var GAS_URL = '';                       // 點餐伺服器（M1 上線後才填；空的＝不量伺服器那一段）
  var RUNS_KEY = 'meal_lab_runs_v1', FIRST_KEY = 'meal_lab_first', RUNS_MAX = 40;
  var TEST_TEXT = '🍱 點餐實驗：這是測試訊息，請忽略';

  var t0 = Date.now();
  var navStart = (window.performance && performance.timing && performance.timing.navigationStart) || t0;
  var facts = [], result = { sendMessages: '（還沒按）', perm: '', ping: '' };
  var $ = function (id) { return document.getElementById(id); };

  function setStatus(text, cls) { var el = $('status'); el.textContent = text; el.className = cls || ''; }
  function fact(k, v) { facts.push(k + ' = ' + v); }
  function render() { $('facts').textContent = facts.join('\n'); }
  function out(text) { $('actionOut').textContent = text; }
  function q(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }
  function fmt(ms) { return (typeof ms === 'number' && isFinite(ms)) ? String(Math.round(ms)) + ' ms' : '—'; }
  function hhmm(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  function gapText(ms) { if (!(ms > 0)) return '—'; var m = Math.round(ms / 60000); return m >= 60 ? (Math.round(m / 6) / 10) + ' 小時' : m + ' 分'; }

  //  第一次載入（網址還帶 liff.state）時記下時間：LINE 會先開入口網址、初始化之後再轉到真正的網址，整頁計時要從第一次算
  try {
    if (q('liff.state') !== null && !sessionStorage.getItem(FIRST_KEY)) sessionStorage.setItem(FIRST_KEY, String(navStart));
  } catch (eS) {}

  function loadRuns() { try { var a = JSON.parse(localStorage.getItem(RUNS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveRuns(a) { try { localStorage.setItem(RUNS_KEY, JSON.stringify(a.slice(-RUNS_MAX))); } catch (e) {} }
  function drawRuns() {
    var tb = $('runs'), a = loadRuns();
    while (tb.firstChild) tb.removeChild(tb.firstChild);
    a.forEach(function (r, i) {
      var tr = document.createElement('tr');
      [String(i + 1), hhmm(r.at), gapText(i ? r.at - a[i - 1].at : 0), fmt(r.init), fmt(r.total), r.ping == null ? '—' : fmt(r.ping)].forEach(function (s) {
        var td = document.createElement('td'); td.textContent = s; tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }
  function runsText() {
    return loadRuns().map(function (r, i, a) {
      return '#' + (i + 1) + ' ' + hhmm(r.at) + ' 距上次=' + gapText(i ? r.at - a[i - 1].at : 0) + ' 初始化=' + fmt(r.init) + ' 整頁=' + fmt(r.total) + ' 伺服器=' + (r.ping == null ? '—' : fmt(r.ping));
    }).join('\n');
  }

  function pingGas() {
    if (!GAS_URL) return Promise.resolve(null);
    var s = Date.now();
    return fetch(GAS_URL + '?api=liff', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: '{"action":"ping"}' })
      .then(function (r) { return r.json(); })
      .then(function (j) { var ms = Date.now() - s; result.ping = (j && j.success ? 'ok ' : 'not-ok ') + ms + ' ms'; return ms; })
      .catch(function (e) { result.ping = 'error ' + String(e && e.message || e).substring(0, 80); return null; });
  }

  function start() {
    $('btnClear').onclick = function () { try { localStorage.removeItem(RUNS_KEY); } catch (e) {} drawRuns(); out('計時紀錄已清除'); };
    $('btnCopy').onclick = copyAll;
    drawRuns();
    if (!window.liff) { setStatus('LINE 的 LIFF 程式沒有載入（CSP 或網路？）', 'bad'); return; }
    if (!/^\d{10}-[A-Za-z0-9]{8}$/.test(LIFF_ID)) { setStatus('入口代號還沒填（' + LIFF_ID + '）', 'bad'); return; }
    var initStart = Date.now();
    setStatus('初始化中…');
    liff.init({ liffId: LIFF_ID }).then(function () {
      var initMs = Date.now() - initStart;
      //  網址還帶著 liff.state ＝這是 LINE 的第一次載入，馬上會轉到真正的網址：這一次不記（不然一次開頁會記成兩列）
      if (q('liff.state') !== null) { setStatus('轉址中…'); return; }
      if (!liff.isLoggedIn()) {
        setStatus('還沒登入：轉去 LINE 登入…');
        liff.login({ redirectUri: location.href });
        return;
      }
      var first = null;
      try { first = parseInt(sessionStorage.getItem(FIRST_KEY) || '', 10) || null; sessionStorage.removeItem(FIRST_KEY); } catch (eS) {}
      var totalMs = Date.now() - (first || navStart);
      collect(initMs, totalMs, !!first);
      return pingGas().then(function (pingMs) {
        var a = loadRuns(); a.push({ at: Date.now(), init: initMs, total: totalMs, ping: pingMs }); saveRuns(a); drawRuns();
        fact('E7 這一次', '初始化 ' + fmt(initMs) + '、整頁 ' + fmt(totalMs) + (first ? '（含 LINE 的轉址）' : '') + '、伺服器 ' + (GAS_URL ? (result.ping || '—') : '（M1 上線後才量）'));
        render();
        setStatus('完成（' + hhmm(Date.now()) + '）', 'ok');
        $('btnSend').disabled = false;
        $('btnPerm').disabled = false;
        $('btnPing').disabled = !GAS_URL;
      });
    }).catch(function (e) {
      setStatus('liff.init 失敗：' + String(e && e.code || '') + ' ' + String(e && e.message || e).substring(0, 160), 'bad');
    });
  }

  function collect(initMs, totalMs, hadRedirect) {
    var ctx = {};
    try { ctx = liff.getContext() || {}; } catch (eC) {}
    fact('時間', new Date().toString().substring(0, 24));
    fact('os／LINE 版本／語言', (liff.getOS && liff.getOS()) + ' ／ ' + (liff.getLineVersion && liff.getLineVersion()) + ' ／ ' + (liff.getLanguage && liff.getLanguage()));
    fact('LIFF SDK', liff.getVersion ? liff.getVersion() : '?');
    fact('isInClient（在 LINE 裡面開）', String(liff.isInClient()));
    fact('context.type（utou＝一對一聊天室）', String(ctx.type));
    fact('context.viewType', String(ctx.viewType));
    fact('context.scope', Array.isArray(ctx.scope) ? ctx.scope.join(',') : String(ctx.scope));
    try { fact('context.availability', JSON.stringify(ctx.availability || {}).substring(0, 400)); } catch (eA) {}
    fact('context.liffId', String(ctx.liffId));
    fact('E1 網址的 go 參數（初始化之後）', q('go') === null ? '（沒有）' : q('go'));
    fact('E1 網址 search', location.search || '（空）');
    fact('E1 第一次載入有 liff.state（LINE 轉址）', hadRedirect ? '有' : '沒有');
    var tok = null;
    try { tok = liff.getDecodedIDToken(); } catch (eT) {}
    if (tok) {
      fact('E1 idToken iss', String(tok.iss));
      fact('E1 idToken aud（應＝新通道代號）', String(tok.aud));
      fact('E1 idToken sub（LINE 代號，要跟 Portal 綁定的一樣）', String(tok.sub));
      fact('E1 idToken exp 剩', Math.round((tok.exp * 1000 - Date.now()) / 60000) + ' 分');
    } else {
      fact('E1 idToken', '拿不到（getDecodedIDToken 回空）');
    }
    render();
    if (liff.permission && liff.permission.query) {
      liff.permission.query('chat_message.write').then(function (r) {
        result.perm = r && r.state;
        fact('E5 chat_message.write 授權狀態', String(result.perm));
        render();
      }).catch(function (e) { fact('E5 授權狀態查詢失敗', String(e && e.code || '') + ' ' + String(e && e.message || e).substring(0, 120)); render(); });
    } else {
      fact('E5 授權狀態', 'SDK 沒有 permission.query');
      render();
    }
  }

  $('btnSend') && ($('btnSend').onclick = function () {
    out('送出中…');
    var s = Date.now();
    liff.sendMessages([{ type: 'text', text: TEST_TEXT }]).then(function () {
      result.sendMessages = '成功（' + (Date.now() - s) + ' ms）';
      out('E8 送出成功：請看聊天室有沒有出現「' + TEST_TEXT + '」');
      fact('E8 sendMessages', result.sendMessages);
      render();
    }).catch(function (e) {
      result.sendMessages = '失敗 code=' + String(e && e.code || '') + ' ' + String(e && e.message || e).substring(0, 160);
      out('E8 ' + result.sendMessages);
      fact('E8 sendMessages', result.sendMessages);
      render();
    });
  });
  $('btnPerm') && ($('btnPerm').onclick = function () {
    if (!(liff.permission && liff.permission.requestAll)) { out('SDK 沒有 permission.requestAll'); return; }
    liff.permission.requestAll().then(function () {
      out('已跳出授權畫面（或已經授權過）；回到這頁後請重新開一次看狀態');
    }).catch(function (e) {
      var t = 'requestAll 失敗 code=' + String(e && e.code || '') + ' ' + String(e && e.message || e).substring(0, 160);
      out(t); fact('E5 requestAll', t); render();
    });
  });
  $('btnPing') && ($('btnPing').onclick = function () {
    out('叫伺服器中…');
    pingGas().then(function (ms) { out('伺服器：' + (result.ping || '—')); fact('E7 手動叫伺服器', result.ping || '—'); render(); });
  });

  function copyAll() {
    var text = '[點餐實驗 M0]\n' + facts.join('\n') + '\n--- E7 計時 ---\n' + (runsText() || '（還沒有）');
    var done = function (ok) { out(ok ? '已複製' : '複製失敗：請改用整頁截圖'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); }); return; }
    } catch (e) {}
    fallback();
    function fallback() {
      try {
        var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); done(ok);
      } catch (e2) { done(false); }
    }
  }

  start();
})();
