/*
 * 點餐系統 LINE 頁內容（app-1.js；meal-liff-3，M4 v0.5.0）。
 *   同仁頁＝下面 STAFF_UI BEGIN～END 那一段，跟點餐網頁版 Index.html 裡的一字不差（C:\ClaudeWorkSpace\meal-clasp\_build_liff.py 從 Index.html 抄過來；harness S-29 比對）。
 *   這支只多「怎麼跟伺服器講話」：每個請求都帶 LINE 現拿的 idToken（只放 body），伺服器不開 session；忙線自動重送一次（同一個請求識別碼）。
 *   網址的 ?go=vote|order|balance|board 只決定先顯示哪一頁，不執行任何動作（規格 3.1）。
 */
(function () {
  'use strict';
  var B = window.MEAL_BOOT; if (!B) return;
  var $ = function (id) { return document.getElementById(id); };
  /* ==== STAFF_UI BEGIN（同仁頁：網頁版跟 LINE 頁同一份；這一段跟 GitHub meal/app-1.js 裡的一字不差，改這裡要用 _build_liff.py 重產，harness S-29 比對） ==== */
  function mealStaffUi(root, api, opt) {
    opt = opt || {};
    var U = { d: null, tab: opt.tab || 'today', cart: [], editing: false, busy: false, req: '', reqHold: false, reqSig: '', showVote: !!opt.vote, seq: 0, photos: {}, sheet: null };
    function h(tag, cls, kids) {
      var e = document.createElement(tag); if (cls) e.className = cls;
      (Array.isArray(kids) ? kids : [kids]).forEach(function (k) { if (k === null || k === undefined || k === false || k === '') return; e.appendChild(typeof k === 'object' && k.nodeType ? k : document.createTextNode(String(k))); });
      return e;
    }
    function wipe(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }
    function b(label, cls, fn) { var x = h('button', 'b' + (cls ? ' ' + cls : ''), label); x.type = 'button'; x.addEventListener('click', function () { if (!U.busy) fn(); }); return x; }
    function $m(n) { return '$' + String(Number(n) || 0); }
    function toast(m, bad) { if (opt.toast) opt.toast(m, bad); }
    function confirmBox(t, m, ok) { return opt.ask ? opt.ask(t, m, ok || '確定', '取消') : Promise.resolve(true); }
    function errMsg(e) { return (e && e.message) || '連線失敗，請稍後再試'; }
    function rid() {
      if (U.reqHold && U.req) return U.req;
      var a = new Uint8Array(12); try { crypto.getRandomValues(a); } catch (x) { for (var i = 0; i < 12; i++) a[i] = Math.floor(Math.random() * 256); }
      U.req = Array.prototype.map.call(a, function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); return U.req;
    }
    //  寫入：拿到明確結果才換新的識別碼；結果不明（沒有代碼、UNEXPECTED、WRITE_UNCERTAIN、BUSY）⇒ 同一個動作、同樣內容再按一次照用同一個（伺服器認得出是同一件、不做兩次）；內容變了就換新的
    function write(action, args) {
      var sig = action + '|' + JSON.stringify(args);
      if (U.reqSig !== sig) U.reqHold = false;
      args.reqId = rid(); U.reqSig = sig; U.busy = true;
      return api(action, args).then(function (r) { U.busy = false; U.reqHold = false; return r; }, function (e) {
        U.busy = false; var c = e && e.errorCode; U.reqHold = !c || c === 'UNEXPECTED' || c === 'WRITE_UNCERTAIN' || c === 'BUSY';
        if (U.reqHold) {
          var um = c === 'BUSY' ? '系統忙線中，還沒送出：等一下再按一次（不會重複）' : c === 'WRITE_UNCERTAIN' ? '存檔時出了問題，不確定有沒有存到：同一個按鈕再按一次不會重複（存過了就只會顯示結果）' : ((e && e.message) || '連線失敗') + '（不確定有沒有送到：同一個按鈕再按一次不會重複）';
          e = { message: um, errorCode: c || '', uncertain: true };
        }
        throw e;
      });
    }
    function hm(ts) { return String(ts || '').substring(11, 16); }
    function md(ymd) { var p = String(ymd || '').split('-'); return p.length === 3 ? Number(p[1]) + '/' + Number(p[2]) : String(ymd || ''); }
    function snap() { return U.d && U.d.today && U.d.today.menu; }
    function itemOf(id) { var s = snap(); return s ? s.items.filter(function (x) { return x.item_id === id; })[0] : null; }
    function dayBase(it) {
      var base = Number(it.price) || 0, hi = null, ha = null;
      ((U.d.today && U.d.today.dayPrices) || []).forEach(function (d) { if (d.scope === 'ITEM' && d.item_id === it.item_id) hi = d; else if (d.scope === 'ALL') ha = d; });
      var d = hi || ha; if (!d) return base;
      return d.mode === 'SET' ? d.value : d.mode === 'DELTA' ? base + d.value : Math.floor((base * d.value + 50) / 100);
    }
    function unitOf(line) {
      var it = itemOf(line.item_id), s = snap(); if (!it || !s) return 0;
      var u = dayBase(it);
      Object.keys(line.opts || {}).forEach(function (g) { var G = s.groups[g]; if (!G) return; (line.opts[g] || []).forEach(function (o) { G.options.forEach(function (x) { if (x.id === o) u += Number(x.delta) || 0; }); }); });
      return u;
    }
    function optNames(line) {
      var s = snap(), out = []; if (!s) return out;
      Object.keys(line.opts || {}).sort().forEach(function (g) { var G = s.groups[g]; if (!G) return; (line.opts[g] || []).forEach(function (o) { G.options.forEach(function (x) { if (x.id === o) out.push(x.name); }); }); });
      return out;
    }
    //  購物車每行的單價：跟伺服器一樣，「品項＋選項」對得上原本那份單的行就沿用那一行的單價（鎖過、逐筆更正過的照那個價），依序配；其他照今天的價
    function sigOf(line) {
      var a = []; Object.keys(line.opts || {}).forEach(function (g) { (line.opts[g] || []).forEach(function (o) { a.push([g, o]); }); });
      a.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0); });
      return line.item_id + '#' + a.map(function (x) { return x[0] + ':' + x[1]; }).join(',');
    }
    function cartUnits() {
      var mo = U.d && U.d.today && U.d.today.myOrder, pool = {};
      if (mo && mo.status === 'ORDERED') mo.lines.forEach(function (l) { var k = l.item_id + '#' + (l.options || []).map(function (x) { return x.g + ':' + x.o; }).join(','); (pool[k] = pool[k] || []).push(Number(l.unit) || 0); });
      return U.cart.map(function (l) { var q = pool[sigOf(l)]; return q && q.length ? q.shift() : unitOf(l); });
    }
    function cartTotal() { var u = cartUnits(); return U.cart.reduce(function (a, l, i) { return a + u[i] * l.qty; }, 0); }
    function fromOrder(o) {
      return (o && o.lines || []).map(function (l) { var opts = {}; (l.options || []).forEach(function (x) { (opts[x.g] = opts[x.g] || []).push(x.o); }); return { item_id: l.item_id, qty: l.qty, opts: opts, remark: l.remark || '' }; });
    }
    function load() {
      var seq = ++U.seq;
      wipe(root).appendChild(h('div', 'muted', '讀取中…'));
      return api('init', {}).then(function (d) {
        if (seq !== U.seq) return;
        U.d = d; U.editing = false; U.sheet = null;
        var mo = d.today && d.today.myOrder;
        U.cart = mo && mo.status === 'ORDERED' ? fromOrder(mo) : [];
        render();
      }, function (e) { if (seq === U.seq) { wipe(root).appendChild(h('div', 'empty', errMsg(e))); } });
    }
    function render() {
      var d = U.d; wipe(root);
      if (!d) return;
      if (d.foreign) root.appendChild(h('div', 'hint su-lang', '點餐功能目前只有中文，如需協助請找美瑛。Meal ordering is in Chinese only — please ask Meiying for help. ระบบสั่งอาหารมีแต่ภาษาจีน หากต้องการความช่วยเหลือโปรดติดต่อเหม่ยอิง'));
      if (!d.open) { root.appendChild(h('div', 'empty', '目前沒有開放點餐')); return; }
      var tabs = [['today', '今天'], ['bal', '餘額'], ['hist', '歷史'], ['me', '我的']], adv = !!(opt.board && d.me && d.me.can && d.me.can.advanced);
      if (adv) tabs.push(['board', '看板']);
      if (U.tab === 'board' && !adv) U.tab = 'today';
      var bar = h('div', 'mtabs su-tabs');
      tabs.forEach(function (t) { var x = b(t[1], 'mtab' + (U.tab === t[0] ? ' on' : ''), function () { U.tab = t[0]; render(); }); x.className = 'mtab' + (U.tab === t[0] ? ' on' : ''); bar.appendChild(x); });
      root.appendChild(bar);
      var body = h('div', 'su-body'); root.appendChild(body);
      if (U.tab === 'today') drawToday(body);
      else if (U.tab === 'bal') drawLedger(body);
      else if (U.tab === 'hist') drawHistory(body);
      else if (U.tab === 'me') drawMe(body);
      else if (U.tab === 'board') drawBoard(body);
    }
    function head(t) {
      var d = U.d, g = t.group;
      var line = h('div', 'su-head', [h('b', '', '🍱 ' + md(t.date) + '（' + String(t.wd || '').replace('週', '') + '）'), h('span', 'su-bal' + (d.balance < 0 ? ' neg' : ''), '餘額 ' + $m(d.balance))]);
      var sub = g ? h('div', 'muted', (g.store_name || g.store_id) + ' · ' + (g.status === 'OPEN' ? '收單到 ' + hm(g.order_close_at) : '')) : null;
      return h('div', 'card su-top', [line, sub]);
    }
    function drawToday(box) {
      var d = U.d, t = d.today;
      box.appendChild(head(t));
      if (d.poll && t.stage !== 'NONE' && t.stage !== 'CANCELLED') box.appendChild(b((U.showVote ? '收起投票' : '🗳 下個上班日（' + d.poll.wd + ' ' + md(d.poll.date) + '）投票') + (d.poll.mine ? '　已投' : ''), '', function () { U.showVote = !U.showVote; render(); }));
      if (U.showVote && d.poll) drawVote(box);
      if (t.stage === 'ORDERING') { if (t.myOrder && t.myOrder.status === 'ORDERED' && !U.editing) drawMine(box, true); else if (t.myOrder && t.myOrder.status === 'SKIPPED' && !U.editing) drawSkipped(box); else drawMenu(box); }
      else if (t.stage === 'CLOSED_WAIT') { drawMine(box, false); box.appendChild(h('div', 'hint', t.group && t.group.status !== 'OPEN' ? '美瑛正在處理這一團（鎖單／結帳中）' : '已截止，要更改請找美瑛')); }
      else if (t.stage === 'LOCKED') { drawMine(box, false); box.appendChild(h('div', 'hint', '已扣款 ' + $m(t.net) + '，餘額 ' + $m(d.balance))); }
      else if (t.stage === 'CANCELLED') box.appendChild(h('div', 'card', [h('b', '', '這一團' + (t.group.status === 'VOID' ? '作廢了（停班）' : '取消了')), h('div', 'muted', t.group.cancel_reason || ''), t.refund ? h('div', '', '已退款 ' + $m(t.refund)) : null]));
      else if (d.poll) drawVote(box);
      else box.appendChild(h('div', 'empty', '今天沒有點餐'));
    }
    function drawVote(box) {
      var p = U.d.poll, card = h('div', 'card su-vote', [h('h3', '', '🗳 下個上班日（' + p.wd + ' ' + md(p.date) + '）想吃哪家？'), h('div', 'muted', '投票到 ' + md(p.close_at.substring(0, 10)) + ' ' + hm(p.close_at))]);
      p.candidates.forEach(function (c) {
        card.appendChild(h('div', 'su-cand' + (p.mine === c.store_id ? ' mine' : ''), [h('div', '', [h('b', '', c.name), '　' + c.votes + ' 票' + (c.last ? '　上次 ' + md(c.last) : '')]), h('div', 'muted', c.voters.join(' ')),
          p.mine === c.store_id ? h('span', 'badge on', '你投這家') : b('投這家', 'p', function () { vote(c.store_id); })]));
      });
      card.appendChild(p.mine === 'NONE' ? h('div', 'badge off', '你選了：下個上班日不訂') : b('下個上班日不訂', '', function () { vote('NONE'); }));
      if (!p.candidates.length) card.appendChild(h('div', 'muted', '沒有候選店家'));
      box.appendChild(card);
    }
    function vote(ch) { write('vote', { pollId: U.d.poll.poll_id, choice: ch }).then(function () { toast('✅ 投好了'); load(); }, function (e) { toast(errMsg(e), true); if (e && e.errorCode && !e.uncertain) load(); }); }
    function drawSkipped(box) { box.appendChild(h('div', 'card', [h('b', '', '你今天不訂'), h('div', 'bar', [b('改成要點', 'p', function () { U.editing = true; render(); })])])); }
    function drawMine(box, canEdit) {
      var t = U.d.today, o = t.myOrder;
      if (!o || o.status !== 'ORDERED') { box.appendChild(h('div', 'empty', o && o.status === 'SKIPPED' ? '你今天不訂' : '你今天沒有點')); return; }
      var card = h('div', 'card', [h('h3', '', canEdit ? '✅ 已送出（可修改到 ' + hm(t.group.order_close_at) + '）' : '我的點單')]);
      o.lines.forEach(function (l) { card.appendChild(h('div', 'su-line', [h('span', '', l.name + (l.options.length ? '（' + l.options.map(function (x) { return x.name; }).join('、') + '）' : '') + (l.remark ? '　備註：' + l.remark : '')), h('span', '', $m(l.unit) + ' × ' + l.qty)])); });
      var tot = o.lines.reduce(function (a, l) { return a + l.unit * l.qty; }, 0);
      card.appendChild(h('div', 'su-line su-sum', [h('b', '', '合計'), h('b', '', $m(o.locked_total !== null && t.stage === 'LOCKED' ? o.locked_total : tot))]));
      if (t.priceAdjusted && canEdit) card.appendChild(h('div', 'hint warn', '價格已調整，目前 ' + $m(tot)));
      if (canEdit) card.appendChild(h('div', 'bar', [b('修改', 'p', function () { U.editing = true; U.cart = fromOrder(o); render(); }), b('取消這份', '', cancelMine)]));
      box.appendChild(card);
    }
    function cancelMine() {
      confirmBox('取消這份點單', '確定今天不點了？（收單截止前可以再點）', '取消這份').then(function (y) {
        if (!y) return;
        write('cancel', { groupId: U.d.today.group.group_id, expected: U.d.today.myOrder.version }).then(function () { toast('已取消'); load(); }, function (e) { toast(errMsg(e), true); if (e && e.errorCode && !e.uncertain) load(); });
      });
    }
    function drawMenu(box) {
      var t = U.d.today, s = t.menu, d = U.d;
      if (!s) { box.appendChild(h('div', 'empty', '菜單讀不到，請重新整理')); return; }
      var quick = h('div', 'bar');
      if (t.lastTime && t.lastTime.lines.length) quick.appendChild(b('跟上次一樣（' + md(t.lastTime.date) + '）', '', function () { U.cart = t.lastTime.lines.map(function (l) { return { item_id: l.item_id, qty: l.qty, opts: l.opts, remark: l.remark || '' }; }); if (t.lastTime.dropped.length) toast('這幾道今天沒有、沒帶入：' + t.lastTime.dropped.join('、'), true); render(); }));
      (t.favorites || []).forEach(function (f) { quick.appendChild(b('⭐ ' + f.name + (f.options.length ? '（' + f.options.join('、') + '）' : ''), '', function () { U.cart.push({ item_id: f.item_id, qty: 1, opts: f.opts, remark: '' }); render(); })); });
      if (quick.firstChild) box.appendChild(quick);
      var cats = (s.categories || []).slice(); s.items.forEach(function (it) { if (cats.indexOf(it.category) < 0) cats.push(it.category); });
      var want = [];
      cats.forEach(function (c) {
        var its = s.items.filter(function (it) { return it.category === c; }); if (!its.length) return;
        box.appendChild(h('div', 'su-cat', '── ' + (c || '其他') + ' ──'));
        its.forEach(function (it) {
          var im = h('img', 'su-th'); im.alt = ''; if (U.photos[it.item_id]) im.src = U.photos[it.item_id]; else if (it.thumb_file_id) want.push(it.item_id);
          im.setAttribute('data-item', it.item_id);
          var p = dayBase(it), row = h('div', 'su-item', [im, h('div', 'su-nm', [h('div', '', it.name_zh), it.note ? h('div', 'muted', it.note) : null]), h('div', 'su-pr', (p !== Number(it.price) ? '今日 ' : '') + $m(p)), b('＋', 'p', function () { openSheet(it); })]);
          box.appendChild(row);
        });
      });
      drawCart(box);
      if (U.sheet) box.appendChild(U.sheet);
      loadPhotos(want);
    }
    function loadPhotos(ids) {
      ids = ids.filter(function (x) { return !Object.prototype.hasOwnProperty.call(U.photos, x); }).slice(0, 20);
      if (!ids.length) return;
      ids.forEach(function (x) { U.photos[x] = null; });
      api('photos', { ids: ids }).then(function (r) {
        Object.keys(r.photos || {}).forEach(function (k) { if (r.photos[k]) U.photos[k] = r.photos[k]; });
        Array.prototype.forEach.call(root.querySelectorAll('img.su-th'), function (im) { var k = im.getAttribute('data-item'); if (U.photos[k] && !im.getAttribute('src')) im.src = U.photos[k]; });
      }, function () {});
    }
    function drawCart(box) {
      var d = U.d, t = d.today, units = cartUnits(), tot = cartTotal(), after = d.balance - (tot - (t.net || 0)), bad = after < d.floor;
      var card = h('div', 'card su-cart', [h('div', 'su-line', [h('b', '', '🛒 ' + U.cart.reduce(function (a, l) { return a + l.qty; }, 0) + ' 項 ' + $m(tot)), h('span', after < 0 ? 'neg' : '', '點完餘額 ' + $m(after))])]);
      U.cart.forEach(function (l, i) {
        var it = itemOf(l.item_id), nm = (it ? it.name_zh : l.item_id) + (optNames(l).length ? '（' + optNames(l).join('、') + '）' : '') + (l.remark ? '　' + l.remark : '');
        card.appendChild(h('div', 'su-line', [h('span', '', nm), h('span', '', [$m(units[i]) + ' ', b('−', '', function () { if (l.qty > 1) l.qty--; else U.cart.splice(i, 1); render(); }), ' ' + l.qty + ' ', b('＋', '', function () { if (l.qty < 20) l.qty++; render(); })])]));
      });
      if (after < 0) card.appendChild(h('div', 'hint warn', bad ? '欠超過下限 ' + $m(d.floor) + '：請先找美瑛儲值' : '餘額不足，點完會欠 ' + $m(-after)));
      var send = b('送出', 'p', submit); send.disabled = bad || !U.cart.length;
      card.appendChild(h('div', 'bar', [b('今天不訂', '', skip), U.editing ? b('不改了', '', function () { U.editing = false; U.cart = fromOrder(t.myOrder); render(); }) : null, send]));
      box.appendChild(card);
    }
    function submit() {
      var t = U.d.today, o = t.myOrder;
      write('order', { groupId: t.group.group_id, lines: U.cart.map(function (l) { return { item_id: l.item_id, qty: l.qty, opts: l.opts, remark: l.remark || '' }; }), expected: o ? o.version : 0 })
        .then(function (r) { toast('✅ 已送出（可修改到 ' + hm(t.group.order_close_at) + '）　合計 ' + $m(r.order.total)); load(); },
              function (e) { toast(errMsg(e), true); if (e && !e.uncertain && e.errorCode === 'VERSION_CONFLICT') load(); });
    }
    function skip() {
      var t = U.d.today, o = t.myOrder;
      confirmBox('今天不訂', '確定今天不訂？（收單截止前可以改）', '今天不訂').then(function (y) {
        if (!y) return;
        write('skip', { groupId: t.group.group_id, expected: o ? o.version : 0 }).then(function () { toast('好，今天不訂'); load(); }, function (e) { toast(errMsg(e), true); if (e && e.errorCode && !e.uncertain) load(); });
      });
    }
    //  點一道菜 ⇒ 選項頁：必選／可選、條件群組（選了某個選項才出現）、數量、備註；固定需求有對應的選項就自動勾、沒有就提示寫備註（不擅自加）
    function openSheet(it) {
      var s = snap(), picked = {}, qty = 1, needs = (U.d.needs || []), hint = [];
      var shown = function (G) { if (!G.show_when_option) return true; var p = String(G.show_when_option).split(':'); return (picked[p[0]] || []).indexOf(p[1]) >= 0; };
      //  一個群組的起始選項：預設的，再套固定需求（群組一開始藏著、之後才出現時也照這樣）
      var startOf = function (g) {
        var G = s.groups[g]; picked[g] = G.options.filter(function (o) { return o['default']; }).map(function (o) { return o.id; }).slice(0, G.max_pick);
        needs.forEach(function (n) { G.options.forEach(function (o) { if (o.name === n && picked[g].indexOf(o.id) < 0) { if (G.max_pick === 1) picked[g] = [o.id]; else if (picked[g].length < G.max_pick) picked[g].push(o.id); } }); });
      };
      (it.group_ids || []).forEach(function (g) { if (s.groups[g]) startOf(g); });
      needs.forEach(function (n) { if (!(it.group_ids || []).some(function (g) { var G = s.groups[g]; return G && G.options.some(function (o) { return o.name === n; }); })) hint.push(n); });
      Object.keys(picked).forEach(function (k) { var GG = s.groups[k]; if (GG && !shown(GG)) picked[k] = []; });   // 條件還沒成立的群組：一開始就是空的（預設、固定需求都不算）
      var remark = document.createElement('input'); remark.type = 'text'; remark.maxLength = 100; remark.placeholder = '備註（例：飯少一點）'; remark.setAttribute('autocomplete', 'off');
      var box = h('div', 'su-sheet');
      var draw = function () {
        wipe(box);
        var unit = dayBase(it);
        box.appendChild(h('div', 'su-line', [h('b', '', it.name_zh), h('b', 'su-u', '')]));
        (it.group_ids || []).forEach(function (g) {
          var G = s.groups[g]; if (!G || !shown(G)) return;
          var lab = G.name + '（' + (G.min_pick ? '必選 ' + (G.min_pick === G.max_pick ? G.min_pick : G.min_pick + '～' + G.max_pick) : '可選' + (G.max_pick > 1 ? '，最多 ' + G.max_pick : '')) + '）';
          var row = h('div', 'su-grp', h('div', 'muted', lab));
          G.options.forEach(function (o) {
            var on = picked[g].indexOf(o.id) >= 0; if (on) unit += Number(o.delta) || 0;
            var x = b((on ? '● ' : '○ ') + o.name + (o.delta ? (o.delta > 0 ? ' +' : ' ') + o.delta : ''), on ? 'p' : '', function () {
              var before = {}; Object.keys(picked).forEach(function (k) { var GG = s.groups[k]; before[k] = !!GG && shown(GG); });
              var cur = picked[g];
              if (cur.indexOf(o.id) >= 0) cur.splice(cur.indexOf(o.id), 1);
              else if (G.max_pick === 1) picked[g] = [o.id];
              else if (cur.length < G.max_pick) cur.push(o.id);
              //  條件群組：藏起來的清空；剛出現的帶回預設選項
              Object.keys(picked).forEach(function (k) { var GG = s.groups[k]; if (!GG) return; if (!shown(GG)) picked[k] = []; else if (!before[k]) startOf(k); });
              draw();
            });
            row.appendChild(x);
          });
          box.appendChild(row);
        });
        box.querySelector('.su-u').textContent = $m(unit * qty);
        if (hint.length) box.appendChild(h('div', 'hint', '你的固定需求「' + hint.join('、') + '」這道沒有這個選項，要寫在備註嗎？'));
        box.appendChild(h('div', 'su-grp', [h('span', 'muted', '數量 '), b('−', '', function () { if (qty > 1) { qty--; draw(); } }), ' ' + qty + ' ', b('＋', '', function () { if (qty < 20) { qty++; draw(); } })]));
        box.appendChild(remark);
        var missing = (it.group_ids || []).filter(function (g) { var G = s.groups[g]; return G && shown(G) && picked[g].length < G.min_pick; }).map(function (g) { return s.groups[g].name; });
        var addB = b(missing.length ? '還要選：' + missing.join('、') : '加入　' + $m(unit * qty), 'p', function () {
          if (missing.length) return;
          var opts = {}; Object.keys(picked).forEach(function (k) { var GG = s.groups[k]; if (picked[k].length && GG && shown(GG)) opts[k] = picked[k].slice(); });
          U.cart.push({ item_id: it.item_id, qty: qty, opts: opts, remark: remark.value.trim() }); U.sheet = null; render();
        });
        addB.disabled = missing.length > 0;
        box.appendChild(h('div', 'bar', [b('取消', '', function () { U.sheet = null; render(); }), addB]));
      };
      draw(); U.sheet = box; render();
      try { box.scrollIntoView({ block: 'nearest' }); } catch (x) {}
    }
    function drawLedger(box) {
      box.appendChild(h('div', 'muted', '讀取中…'));
      api('ledger', { ym: '' }).then(function (r) {
        wipe(box).appendChild(h('div', 'card', [h('b', '', '目前餘額 ' + $m(r.balance))]));
        var KZ = { OPENING: '期初', TOPUP: '儲值', CHARGE: '扣款', ADJUST: '更正', ALLOC: '攤提', REFUND: '退款' };
        if (!r.rows.length) box.appendChild(h('div', 'empty', '還沒有明細'));
        r.rows.slice(0, 100).forEach(function (x) { box.appendChild(h('div', 'su-line', [h('span', '', String(x.ts).substring(5, 16) + '　' + (KZ[x.kind] || x.kind) + (x.reason ? '　' + x.reason : '')), h('span', x.amount < 0 ? 'neg' : '', (x.amount > 0 ? '+' : '') + x.amount)])); });
      }, function (e) { wipe(box).appendChild(h('div', 'empty', errMsg(e))); });
    }
    function drawHistory(box) {
      box.appendChild(h('div', 'muted', '讀取中…'));
      api('history', {}).then(function (r) {
        wipe(box);
        if (!r.rows.length) box.appendChild(h('div', 'empty', '最近 30 天沒有點過'));
        r.rows.forEach(function (x) {
          box.appendChild(h('div', 'card', [h('div', 'su-line', [h('b', '', md(x.date) + '　' + x.store), h('span', '', x.status === 'ORDERED' ? $m(x.locked_total !== null ? x.locked_total : x.total) : '取消')]),
            h('div', 'muted', x.lines.map(function (l) { return l.name + (l.qty > 1 ? '×' + l.qty : '') + (l.options.length ? '（' + l.options.join('、') + '）' : ''); }).join('、'))]));
        });
      }, function (e) { wipe(box).appendChild(h('div', 'empty', errMsg(e))); });
    }
    function drawMe(box) {
      var inp = document.createElement('input'); inp.type = 'text'; inp.value = (U.d.needs || []).join('、'); inp.placeholder = '例：不要香菜、飯少'; inp.setAttribute('autocomplete', 'off');
      box.appendChild(h('div', 'card', [h('h3', '', '我的固定需求'), h('div', 'muted', '點到有這個選項的菜會自動勾；沒有的會提醒你寫備註（用頓號或逗號分開）'), inp,
        h('div', 'bar', [b('存檔', 'p', function () {
          var needs = inp.value.split(/[、,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
          write('prefs', { needs: needs }).then(function (r) { U.d.needs = r.needs; toast('已存'); }, function (e) { toast(errMsg(e), true); });
        })])]));
    }
    //  手機看板（LINE 頁、進階使用者；規格 3.1）：已點／不訂／還沒回／名單外、合計、門檻；提醒點餐、鎖單／重鎖（二次確認）
    function drawBoard(box) {
      var d = U.d, g = d.today && d.today.group, bd = d.board;
      if (!g || !bd) { box.appendChild(h('div', 'empty', '今天沒有開團')); return; }
      box.appendChild(h('div', 'card', [h('b', '', '今日看板　' + (g.store_name || '') + ' · ' + hm(g.order_close_at) + ' 截止'),
        h('div', '', '已點 ' + bd.count + ' · 不訂 ' + bd.skipped.length + ' · 還沒回 ' + bd.notReplied.length + (bd.notReplied.length ? '（' + bd.notReplied.map(function (x) { return x.name; }).join('、') + '）' : '') + ' · 名單外 ' + bd.outside),
        h('div', '', '合計 ' + $m(bd.total) + '　外送門檻 ' + $m(bd.minOrder) + (bd.gap ? '（還差 ' + $m(bd.gap) + '）' : ' ✓'))]));
      bd.ordered.forEach(function (r) { box.appendChild(h('div', 'su-line', [h('span', '', r.name + (r.outside ? '（名單外）' : '') + (r.excluded ? '（' + r.excluded + '）' : '') + '　' + r.items), h('span', '', $m(r.total))])); });
      var ZH = { LOCKING: '鎖單中', LOCKED: '已鎖單', SETTLING: '結帳中', SETTLED: '已結帳', REVERSING: '撤銷結帳中', CANCELLING: '取消中', CANCELLED: '已取消', VOID: '作廢' };
      if (g.status !== 'OPEN') { box.appendChild(h('div', 'hint', '這一團現在是「' + (ZH[g.status] || g.status) + '」；其他操作請到電腦版')); return; }
      box.appendChild(h('div', 'bar', [b('提醒點餐', '', remind), b(g.relock_pending ? '重鎖' : '鎖單', 'p', lockIt)]));
    }
    function remind() {
      var g = U.d.today.group;
      api('remindPreview', { groupId: g.group_id }).then(function (p) {
        var pick = {}; p.maybe.forEach(function (x) { pick[x.account] = 1; });
        var ext = null, lines = '這次會用掉 ' + p.count + ' 則（M5 上線前只記下來、不會真的送）';
        if (p.closed) { ext = prompt0(); if (!ext) { toast('太晚了、沒辦法再延長收單：請到電腦版處理', true); return; } lines += '\n已經過了收單截止：送出提醒時會把收單延到 ' + ext + '（要別的時間請到電腦版）。'; }
        confirmBox('提醒點餐', '預設提醒：' + (p.maybe.map(function (x) { return x.name; }).join('、') || '（沒有人）') + '\n' + lines, '送出提醒').then(function (y) {
          if (!y) return;
          write('remindSend', { groupId: g.group_id, accounts: Object.keys(pick), extendUntil: ext || '' }).then(function (r) { toast('已排 ' + r.queued + ' 則提醒'); load(); }, function (e) { toast(errMsg(e), true); });
        });
      }, function (e) { toast(errMsg(e), true); });
    }
    //  延長收單：從「現在」和原本截止兩個裡晚的那個再加 30 分；過了午夜就不延（收單截止要在團的那一天）
    function prompt0() {
      var g = U.d.today.group, close = String(g.order_close_at).substring(11, 16), now = new Date(Date.now() + 8 * 3600000).toISOString().substring(11, 16);
      var p = (now > close ? now : close).split(':'), m = Number(p[0]) * 60 + Number(p[1]) + 30;
      return m >= 24 * 60 ? null : ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2);
    }
    function lockIt() {
      var g = U.d.today.group;
      api('lockPreview', { groupId: g.group_id }).then(function (p) {
        var msg = p.count + ' 人・' + $m(p.total) + '・' + (p.store || '') + '，' + (p.relock ? '重鎖會照新的金額調整扣款並通知有變的人' : '鎖單後會扣款並通知 ' + p.count + ' 人') + '；解鎖要到電腦版';
        if (p.relock) msg += '\n' + p.people.filter(function (x) { return x.delta; }).map(function (x) { return x.name + '：' + $m(x.net) + ' → ' + $m(x.target); }).join('\n');
        if (p.notReplied.length) msg += '\n還沒回：' + p.notReplied.map(function (x) { return x.name; }).join('、');
        if (p.excluded.length) msg += '\n不成立：' + p.excluded.map(function (x) { return x.name + '（' + x.why + '）'; }).join('、');
        if (p.minsLeft > 0) msg += '\n⚠ 還有 ' + p.minsLeft + ' 分鐘才截止';
        confirmBox(p.relock ? '重鎖' : '鎖單', msg, p.relock ? '確定重鎖' : '確定鎖單').then(function (y) {
          if (!y) return;
          write(p.relock ? 'relock' : 'lock', { groupId: g.group_id, hash: p.hash }).then(function () { toast(p.relock ? '已重鎖' : '已鎖單'); load(); }, function (e) { toast(errMsg(e), true); load(); });
        });
      }, function (e) { toast(errMsg(e), true); });
    }
    return { load: load, render: render };
  }
  /* ==== STAFF_UI END ==== */
  function toast(m, bad) { var t = $('toast'); t.textContent = m; t.className = bad ? 'err' : ''; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, bad ? 7000 : 2600); }
  function ask(title, msg, okLabel, cancelLabel) {
    return new Promise(function (resolve) {
      $('askTitle').textContent = title; $('askMsg').textContent = msg; $('askOk').textContent = okLabel || '確定'; $('askNo').textContent = cancelLabel || '取消';
      $('ask').hidden = false;
      var done = function (v) { $('ask').hidden = true; $('askOk').onclick = null; $('askNo').onclick = null; resolve(v); };
      $('askOk').onclick = function () { done(true); };
      $('askNo').onclick = function () { done(false); };
    });
  }
  function post(action, args) {
    var tok = null;
    try { tok = B.liff.getIDToken(); } catch (e) { tok = null; }
    if (!tok) { B.liff.login({ redirectUri: location.href }); return Promise.reject({ errorCode: 'LIFF_RELOGIN', message: 'LINE 身分過期了，重新登入中…（這一下沒有送出）' }); }
    var body = JSON.stringify({ action: action, idToken: tok, reqId: (args && args.reqId) || '', args: args || {} });
    //  45 秒等不到就放棄（伺服器等鎖最多 10 秒＋處理）；放棄＝結果不明（沒有錯誤代碼），同仁頁會讓他再按一次、沿用同一個請求識別碼。
    //  計時器用 Promise.race（舊手機沒有 AbortController、或 fetch 不理它也照樣會放棄）
    var ac = null, timer = null; try { ac = new AbortController(); } catch (eA) { ac = null; }
    var o = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body }; if (ac) o.signal = ac.signal;
    var late = new Promise(function (res, rej) { timer = setTimeout(function () { try { if (ac) ac.abort(); } catch (eX) {} rej({ message: '網路太慢、等不到回應，請稍後再按一次' }); }, 45000); });
    return Promise.race([fetch(B.GAS_URL + '?api=liff', o).then(function (r) { return r.text(); }), late])
      .then(function (t) { clearTimeout(timer); return t; }, function (e) { clearTimeout(timer); if (e && e.message && !e.name) throw e; throw { message: (e && e.name === 'AbortError' ? '網路太慢、等不到回應' : '連線失敗') + '，請稍後再按一次' }; })
      .then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (eJ) { throw { message: '伺服器的回應看不懂：請關掉這一頁，再從 LINE 打開' }; }
        if (!j || typeof j !== 'object') throw { message: '伺服器沒有回應內容' };
        if (j.success === false && (j.errorCode === 'LIFF_TOKEN_INVALID' || j.errorCode === 'LIFF_TOKEN_EXPIRED')) {
          //  LINE 裡的身分證明是快取的、過期了不會自己換：在 LINE 裡請他重開；在外部瀏覽器就登出再登入
          var inClient = false; try { inClient = B.liff.isInClient(); } catch (eC) { inClient = false; }
          if (inClient) throw { errorCode: j.errorCode, message: 'LINE 身分過期了：請關掉這一頁，再從 LINE 選單打開' };
          //  外部瀏覽器：登出再登入；同一個分頁 10 分鐘內最多自動試 2 次（不會一直跳來跳去）
          var n = 0, now = Date.now(); try { var rec = JSON.parse(sessionStorage.getItem('meal_relogin') || '{}'); n = rec.t && now - rec.t < 600000 ? rec.n || 0 : 0; sessionStorage.setItem('meal_relogin', JSON.stringify({ n: n + 1, t: now })); } catch (eS) { n = 2; }   // 記不住次數就不要自動跳（寧可請他重開）
          if (n >= 2) throw { errorCode: j.errorCode, message: 'LINE 身分一直過期：請關掉這一頁，從 LINE 打開' };
          try { B.liff.logout(); B.liff.login({ redirectUri: location.href }); } catch (eL) {}
          throw { errorCode: j.errorCode, message: 'LINE 身分過期了，重新登入中…' };
        }
        if (j.success === false) throw j;
        return j;
      });
  }
  function api(action, args) {
    var send = function (again) { return post(action, args).catch(function (e) { if (e && e.errorCode === 'BUSY' && !again) return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return send(true); }); throw e; }); };
    return send(false);
  }
  var go = null; try { go = new URLSearchParams(location.search).get('go'); } catch (e) { go = null; }
  var tab = go === 'balance' ? 'bal' : go === 'board' ? 'board' : 'today';
  var ui = mealStaffUi($('root'), function (a, x) { return api(a, x).then(function (r) { if (a === 'init' && r && r.me) $('who').textContent = r.me.name; return r; }); }, { toast: toast, ask: ask, board: true, tab: tab, vote: go === 'vote' });
  $('status').textContent = '';
  ui.load();
})();
