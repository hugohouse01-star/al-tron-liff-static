/*
 * 鋁創模具派工系統 LINE 頁 —— 畫面本體 第 2 版（mold-app-2.js；v0.3.0：站名、類型名的英泰從伺服器來；客戶看得到金額與預估）
 *   員工：輪到我／我正在做／查進度；「我來做／完成／放回」只有那一站的負責人能按（伺服器擋，按鈕只是跟著顯示）。
 *   客戶：下單（沿用舊模／改圖／新模號／標準品 → 規格 → 確認）、附圖面、我的單。
 *   規矩（規格 T5）：資料一律用 textContent 放進畫面（這一支不用任何「把字串當 HTML 解析」的寫法）；網址的 op 只拿來標亮、不自動做任何動作；
 *   瀏覽器只記「這台選的語言」和「剛剛自動重新登入過」的時間，不記任何身分資料；idToken 只放 body、不放網址。
 */
(function () {
  'use strict';
  var GAS = window.MOLD_GAS, LIFF_ID = window.MOLD_LIFF_ID;
  var OP_RE = /^[A-Z0-9-]{3,40}:[A-Z][A-Z0-9]{1,9}$/, LIFF_ID_RE = /^2011795144-[A-Za-z0-9]{8}$/;
  var LANG_KEY = 'mold_liff_lang', RENEW_KEY = 'mold_liff_renew', DRAFT_KEY = 'mold_liff_draft';
  var FRESH_OPEN_MS = 15 * 60000;   // 開頁時身分證明剩不到 15 分鐘 ⇒ 還沒填任何東西之前先換新（v0.2.0 審查：按下去才換會把客戶填到一半的單整頁洗掉）
  var S = { tok: '', exp: 0, me: null, init: null, lang: 'zh', skew: 0, tab: '', view: '', focus: '', todo: null, board: null, orders: null,
            busy: false, lines: [], draft: null, note: '', reqId: '', bq: '', bf: 'all', toastT: 0 };

  var I18N = {
    zh: {
      'app.title': '模具派工', 'app.lang': '語言',
      'tab.ready': '輪到我', 'tab.mine': '我正在做', 'tab.progress': '查進度', 'tab.order': '下單', 'tab.myOrders': '我的單',
      'state.WAITING': '未就緒', 'state.READY': '待開工', 'state.IN_PROGRESS': '進行中', 'state.DONE': '完成', 'state.SKIPPED': '跳過',
      'card.seq': '第 {n} 次', 'card.od': '外徑 {v}', 'card.thick': '厚 {v}', 'card.qty': '數量 {v}', 'card.prev': '上一站 {st}：{at} {who} 完成',
      'card.takenBy': '已由 {who} 接手', 'card.doneBy': '已經完成（{who} {at}）', 'card.jobClosed': '這張工單已經結束了', 'card.notOwner': '你不是這一站的負責人，只能看',
      'card.waiting': '還沒輪到這一站', 'card.skipped': '這一站跳過了', 'card.fromLink': '從通知點進來的', 'card.note': '備註：{v}', 'card.orderNote': '訂單備註：{v}', 'card.inote': '內部：{v}（{by}）',
      'card.order': '訂單 {v}', 'card.missing': '找不到通知裡的那一站（可能已經被撤銷或取消）',
      'btn.claim': '我來做', 'btn.complete': '完成', 'btn.unclaim': '放回', 'btn.reload': '重新整理', 'btn.ok': '確定', 'btn.cancel': '取消', 'btn.gotIt': '知道了', 'btn.retry': '再試一次', 'btn.working': '處理中…',
      'done.title': '完成「{st}」', 'done.time': '完成時間（預設現在；補登可以改）', 'done.confirm': '確定完成', 'done.rules': '不能晚於現在、不能早於下單日、不能早於 60 天前',
      'unclaim.confirm': '把「{st}」放回待開工？（別的負責人就可以接）',
      'toast.claimed': '已接手', 'toast.completed': '已完成', 'toast.unclaimed': '已放回', 'toast.ordered': '已送出訂單 {id}', 'toast.uploaded': '圖面已存好', 'toast.refreshed': 'LINE 身分已更新，請再按一次', 'toast.draftBack': '剛剛填的內容已經還原', 'toast.draftWhere': '（在「{tab}」分頁）', 'order.refile': '（圖面：送出後到「我的單」補附，或移除這一項重新附）', 'toast.draftBackFile': '剛剛填的內容已經還原；附的圖面要重新選',
      'empty.ready': '現在沒有輪到你的站', 'empty.mine': '你現在沒有正在做的站', 'empty.progress': '沒有符合的工單', 'empty.orders': '還沒有進行中的單',
      'progress.search': '搜尋模號／訂單號／客戶', 'progress.all': '全部', 'progress.readyOnly': '待開工', 'progress.stuckOnly': '卡關', 'progress.wait': '等了 {n} 天', 'progress.stuckTag': '卡關', 'progress.noOwner': '這一站沒人負責', 'progress.now': '目前：{st}（{state}）',
      'order.step1': '1. 這次是', 'order.EXISTING': '沿用舊模', 'order.REVISE': '改圖', 'order.NEW': '新模號', 'order.STD': '標準品',
      'order.moldNo': '模號', 'order.lookup': '查詢', 'order.type': '類型', 'order.od': '外徑', 'order.thick': '厚度（例 45 或 70+13）', 'order.qty': '數量',
      'order.set': '整組改', 'order.single': '單顆改', 'order.drawing': '附圖面（照片或 PDF，可以不附）', 'order.add': '加入這一項', 'order.items': '這張訂單', 'order.remove': '移除',
      'order.note': '訂單備註（可以不填）', 'order.submit': '送出訂單', 'order.sending': '送出中…', 'order.confirmTitle': '確認這張訂單', 'order.confirmOk': '確定送出', 'order.pickType': '請選類型', 'order.lookupFirst': '先輸入模號、按「查詢」',
      'order.notFound': '系統裡沒有這個模號的舊模（第一次在新系統下的舊模號請選「新模號」）', 'order.takenByOther': '這個模號不是你們的，不能下',
      'order.nextSeq': '這次是第 {n} 次', 'order.openJobs': '這顆還有進行中的工單：{ids}', 'order.dupTitle': '可能重複下單', 'order.dupOk': '確定還是要下', 'order.dupLines': '第 {lines} 項還有進行中的工單。確定還要再下嗎？',
      'order.needItem': '至少要加一項', 'order.maxLines': '一張訂單最多 {n} 項', 'order.badQty': '數量要是 1～999 的整數', 'order.pickOd': '請選外徑', 'order.pv.seqQty': '第 {n} 次・數量 {q}', 'order.pv.revise': '改圖 {prev} → {no}',
      'order.pv.autoNo': '系統配的新號：{nos}。如果這個號你們已經用過，請按取消、改填新號。', 'order.newNo': '新模號（空白＝系統配）',
      'order.uploading': '正在存圖面…（{i}/{n}）', 'order.uploadFailed': '訂單已經送出，但有 {n} 張圖面沒有存成功，請到「我的單」再附一次',
      'my.station': '目前：{st}', 'my.done': '已完成', 'my.cancelled': '已取消', 'my.viewDwg': '看圖面', 'my.addDwg': '附圖面', 'my.orderDate': '下單 {d}', 'my.pdfHint': '如果手機打不開，請改用電腦看',
      'money.total': '合計 {v}', 'money.quotePendingHint': '（有站另行報價，合計不含那些站）', 'money.confirmedShort': '已結帳', 'money.quoteLater': '另行報價', 'money.estimate': '預估 {v}', 'money.estimateTotal': '預估合計 {v}',
      'file.badType': '只收 JPG、PNG 照片或 PDF', 'file.tooBig': '檔案太大（最大 2 MB）',
      'err.generic': '發生錯誤，請稍後再試', 'err.network': '連線失敗，請檢查網路後再試', 'err.timeout': '伺服器太久沒有回應；剛剛那一下可能已經成功，請按重新整理確認',
      'err.config': '頁面設定不完整，請聯絡鋁創', 'err.sdk': 'LINE 元件沒有載入，請關掉再開一次', 'err.liffInit': 'LINE 登入沒有成功，請關掉這一頁、從 LINE 重新開啟', 'err.reopen': '請關掉這一頁，從 LINE 重新開啟',
      'err.LIFF_TOKEN_INVALID': 'LINE 身分證明不正確，請關掉這一頁、從 LINE 重新開啟', 'err.LIFF_TOKEN_EXPIRED': 'LINE 身分證明過期了，請關掉這一頁、從 LINE 重新開啟',
      'err.LINE_UNAVAILABLE': '暫時無法向 LINE 確認身分，請稍後再試', 'err.LINE_NOT_BOUND': '請先綁定鋁創官方 LINE（找管理員拿綁定碼）', 'err.LINE_BIND_BROKEN': 'LINE 綁定有異常，請聯絡管理員',
      'err.PORTAL_UNAVAILABLE': '暫時無法確認帳號，請稍後再試', 'err.ACCOUNT_UNKNOWN': '找不到這個 LINE 綁定的帳號，請聯絡管理員', 'err.ACCOUNT_DISABLED': '這個帳號已停用',
      'err.CUSTOMER_INVALID': '客戶代號不正確，請聯絡鋁創', 'err.CUSTOMER_INACTIVE': '客戶帳號目前沒有開通，請聯絡鋁創', 'err.PERM_DENIED': '沒有這個動作的權限',
      'err.NOT_OWNER': '你不是這一站的負責人，只能看', 'err.BAD_STATE': '這一站的狀態已經變了，請看最新的樣子', 'err.NOT_FOUND': '找不到，可能已經被改過',
      'err.JOB_CANCELLED': '這張工單已取消', 'err.LOCK_TIMEOUT': '系統忙線中，請稍後再試', 'err.UNEXPECTED': '操作失敗，請稍後再試', 'err.BAD_ARG': '輸入的資料不正確',
      'err.TOO_MANY': '太多了，請晚一點再試', 'err.TOO_LARGE': '送出的資料太大', 'err.BAD_REQUEST': '請求格式不對', 'err.UNKNOWN_ACTION': '不認得的動作',
      'err.WRITE_UNCERTAIN': '存檔時發生錯誤：請重新整理確認剛剛有沒有成功', 'err.WRITE_FAILED': '沒有存成功，請再試一次', 'err.WRITE_PARTIAL': '寫到一半失敗了，請聯絡鋁創',
      'err.DUP_OPEN': '可能重複下單', 'err.REQ_CHANGED': '剛剛那次其實已經送出了，請先看「我的單」', 'err.DATE_CHANGED': '剛過午夜，請再按一次送出重新確認',
      'err.NUMBER_CHANGED': '配號變了，請再按一次送出重新確認', 'err.SEQ_CHANGED': '第幾次變了，請再按一次送出重新確認', 'err.SPEC_CHANGED': '尺寸變了 —— 改圖請選「改圖」',
      'err.MOLD_NO_INVALID': '模號只能用英文、數字和「-」', 'err.MOLD_OTHER_CUSTOMER': '這個模號不是你們的', 'err.MOLD_EXISTS': '這個模號、類型已經登記過了（請選「沿用舊模」）',
      'err.NEED_MANUAL_NO': '系統無法自動配號，請填新模號', 'err.DUP_LINE': '同一張訂單裡重複了（要多顆請改數量）', 'err.NO_ACTIVE_OP': '這個類型目前不能下單，請聯絡鋁創',
      'err.OPTYPES_INVALID': '系統設定有問題，暫時不能下單，請聯絡鋁創', 'err.NO_ROUTE': '這種類型還沒有設定製程，請聯絡鋁創', 'err.JOB_CONFIRMED': '這張工單已經確認結帳，不能再動',
      'err.BAD_ARG.DONE_AT_FORMAT': '完成時間格式不對', 'err.BAD_ARG.DONE_AT_INVALID': '完成時間不是有效的日期時間', 'err.BAD_ARG.DONE_AT_FUTURE': '完成時間不能晚於現在',
      'err.BAD_ARG.DONE_AT_BEFORE_ORDER': '完成時間不能早於下單日（{orderDate}）', 'err.BAD_ARG.DONE_AT_TOO_OLD': '完成時間不能早於 60 天前',
      'err.PERM_DENIED.UNCLAIM_OTHERS': '只有接手的人可以放回', 'err.PERM_DENIED.COMPLETE_OTHERS': '這一站是 {by} 在做，只有他本人可以按完成',
      'err.BAD_STATE.NOT_READY': '這一站已經不是「待開工」了（可能別人剛接走）', 'err.BAD_STATE.NOT_IN_PROGRESS': '這一站不是「進行中」', 'err.BAD_STATE.NOT_COMPLETABLE': '這一站現在不能完成',
      'err.BAD_STATE.DRAWING_SIZE': '圖面檔案太大，請聯絡鋁創',
      'err.BAD_ARG.DRAWING_TYPE': '圖面只收 JPG、PNG、PDF', 'err.BAD_ARG.DRAWING_SIZE': '圖面檔案最大 {maxMb} MB', 'err.BAD_ARG.DRAWING_BAD': '檔案讀不懂，請重新選一次',
      'err.NOT_FOUND.NO_MOLD': '找不到這顆模具', 'err.NOT_FOUND.NO_DRAWING': '這顆模具還沒有圖面', 'err.NOT_FOUND.DRAWING_GONE': '圖面檔案找不到了，請重新傳一次',
      'err.UNEXPECTED.DRAWING_FAILED': '圖面沒有存成功，請稍後再試', 'err.TOO_MANY.DRAWING_TOO_MANY': '傳太多張了，請晚一點再傳'
    },
    en: {
      'app.title': 'Mold Dispatch', 'app.lang': 'Language',
      'tab.ready': 'My turn', 'tab.mine': 'Doing now', 'tab.progress': 'Progress', 'tab.order': 'Order', 'tab.myOrders': 'My orders',
      'state.WAITING': 'Not yet', 'state.READY': 'Ready', 'state.IN_PROGRESS': 'In progress', 'state.DONE': 'Done', 'state.SKIPPED': 'Skipped',
      'card.seq': '#{n}', 'card.od': 'OD {v}', 'card.thick': 'T {v}', 'card.qty': 'Qty {v}', 'card.prev': 'Previous {st}: done {at} by {who}',
      'card.takenBy': 'Taken by {who}', 'card.doneBy': 'Already done ({who} {at})', 'card.jobClosed': 'This job has ended', 'card.notOwner': 'You are not an owner of this station — view only',
      'card.waiting': 'This station is not ready yet', 'card.skipped': 'This station was skipped', 'card.fromLink': 'From your notification', 'card.note': 'Note: {v}', 'card.orderNote': 'Order note: {v}', 'card.inote': 'Internal: {v} ({by})',
      'card.order': 'Order {v}', 'card.missing': 'The station in the notification was not found (it may have been undone or cancelled)',
      'btn.claim': 'I\'ll do it', 'btn.complete': 'Done', 'btn.unclaim': 'Put back', 'btn.reload': 'Refresh', 'btn.ok': 'OK', 'btn.cancel': 'Cancel', 'btn.gotIt': 'Got it', 'btn.retry': 'Try again', 'btn.working': 'Working…',
      'done.title': 'Finish "{st}"', 'done.time': 'Finish time (default now; change it to back-date)', 'done.confirm': 'Confirm done', 'done.rules': 'Not later than now, not before the order date, not more than 60 days ago',
      'unclaim.confirm': 'Put "{st}" back to ready? (other owners can then take it)',
      'toast.claimed': 'Taken', 'toast.completed': 'Done', 'toast.unclaimed': 'Put back', 'toast.ordered': 'Order {id} submitted', 'toast.uploaded': 'Drawing saved', 'toast.refreshed': 'Your LINE login was refreshed — please press again', 'toast.draftBack': 'What you entered has been restored', 'toast.draftWhere': ' (in the "{tab}" tab)', 'order.refile': '(drawing: attach it in "My orders" after submitting, or remove this item and add it again)', 'toast.draftBackFile': 'What you entered has been restored — please pick the drawing files again',
      'empty.ready': 'Nothing is waiting for you right now', 'empty.mine': 'You are not working on anything right now', 'empty.progress': 'No matching jobs', 'empty.orders': 'No open orders yet',
      'progress.search': 'Search die no. / order no. / customer', 'progress.all': 'All', 'progress.readyOnly': 'Ready', 'progress.stuckOnly': 'Stuck', 'progress.wait': 'waiting {n} d', 'progress.stuckTag': 'Stuck', 'progress.noOwner': 'No owner for this station', 'progress.now': 'Now: {st} ({state})',
      'order.step1': '1. This time', 'order.EXISTING': 'Reuse die', 'order.REVISE': 'Revise', 'order.NEW': 'New die no.', 'order.STD': 'Standard',
      'order.moldNo': 'Die no.', 'order.lookup': 'Look up', 'order.type': 'Type', 'order.od': 'OD', 'order.thick': 'Thickness (e.g. 45 or 70+13)', 'order.qty': 'Qty',
      'order.set': 'Revise set', 'order.single': 'Revise single', 'order.drawing': 'Attach drawing (photo or PDF, optional)', 'order.add': 'Add this item', 'order.items': 'This order', 'order.remove': 'Remove',
      'order.note': 'Order note (optional)', 'order.submit': 'Submit order', 'order.sending': 'Sending…', 'order.confirmTitle': 'Confirm this order', 'order.confirmOk': 'Submit', 'order.pickType': 'Choose a type', 'order.lookupFirst': 'Enter a die no. and press "Look up"',
      'order.notFound': 'No existing die with this number (for an old die ordered here for the first time, choose "New die no.")', 'order.takenByOther': 'This die number is not yours',
      'order.nextSeq': 'This will be #{n}', 'order.openJobs': 'This die still has open jobs: {ids}', 'order.dupTitle': 'Possible duplicate order', 'order.dupOk': 'Order anyway', 'order.dupLines': 'Item(s) {lines} still have open jobs. Order anyway?',
      'order.needItem': 'Add at least one item', 'order.maxLines': 'At most {n} items per order', 'order.badQty': 'Qty must be a whole number 1–999', 'order.pickOd': 'Choose the OD', 'order.pv.seqQty': '#{n} · Qty {q}', 'order.pv.revise': 'Revise {prev} → {no}',
      'order.pv.autoNo': 'Numbers assigned by the system: {nos}. If you already used one, press Cancel and enter a new number.', 'order.newNo': 'New die no. (blank = system assigns)',
      'order.uploading': 'Saving drawings… ({i}/{n})', 'order.uploadFailed': 'The order was submitted, but {n} drawing(s) were not saved — attach them again in "My orders"',
      'my.station': 'Now: {st}', 'my.done': 'Finished', 'my.cancelled': 'Cancelled', 'my.viewDwg': 'View drawing', 'my.addDwg': 'Attach drawing', 'my.orderDate': 'Ordered {d}', 'my.pdfHint': 'If your phone cannot open it, please use a computer',
      'money.total': 'Total {v}', 'money.quotePendingHint': ' (some stations quoted separately — those are not included)', 'money.confirmedShort': 'Billed', 'money.quoteLater': 'Quoted separately', 'money.estimate': 'Est. {v}', 'money.estimateTotal': 'Estimated total {v}',
      'file.badType': 'Only JPG/PNG photos or PDF', 'file.tooBig': 'The file is too large (max 2 MB)',
      'err.generic': 'Something went wrong — please try again later', 'err.network': 'Connection failed — check the network and try again', 'err.timeout': 'The server took too long — it may have worked; press Refresh to check',
      'err.config': 'The page is not fully set up — please contact AL-TRON', 'err.sdk': 'The LINE component did not load — close and open again', 'err.liffInit': 'LINE sign-in failed — close this page and open it again from LINE', 'err.reopen': 'Please close this page and open it again from LINE',
      'err.LIFF_TOKEN_INVALID': 'The LINE login is not valid — close this page and open it again from LINE', 'err.LIFF_TOKEN_EXPIRED': 'The LINE login expired — close this page and open it again from LINE',
      'err.LINE_UNAVAILABLE': 'Cannot confirm with LINE right now — please try again later', 'err.LINE_NOT_BOUND': 'Please bind the AL-TRON official LINE first (ask an administrator for a binding code)', 'err.LINE_BIND_BROKEN': 'There is a problem with your LINE binding — please contact an administrator',
      'err.PORTAL_UNAVAILABLE': 'Cannot confirm the account right now — please try again later', 'err.ACCOUNT_UNKNOWN': 'The account bound to this LINE was not found — please contact an administrator', 'err.ACCOUNT_DISABLED': 'This account is disabled',
      'err.CUSTOMER_INVALID': 'Invalid customer code — please contact AL-TRON', 'err.CUSTOMER_INACTIVE': 'This customer account is not active — please contact AL-TRON', 'err.PERM_DENIED': 'You do not have permission for this',
      'err.NOT_OWNER': 'You are not an owner of this station — view only', 'err.BAD_STATE': 'This station has changed — here is the latest', 'err.NOT_FOUND': 'Not found — it may have changed',
      'err.JOB_CANCELLED': 'This job was cancelled', 'err.LOCK_TIMEOUT': 'The system is busy — please try again shortly', 'err.UNEXPECTED': 'It did not work — please try again later', 'err.BAD_ARG': 'The input is not valid',
      'err.TOO_MANY': 'Too many — please try again later', 'err.TOO_LARGE': 'The data sent is too large', 'err.BAD_REQUEST': 'The request was not valid', 'err.UNKNOWN_ACTION': 'Unknown action',
      'err.WRITE_UNCERTAIN': 'Saving hit an error — refresh to check whether it worked', 'err.WRITE_FAILED': 'Not saved — please try again', 'err.WRITE_PARTIAL': 'Saving failed half-way — please contact AL-TRON',
      'err.DUP_OPEN': 'Possible duplicate order', 'err.REQ_CHANGED': 'Your previous submit already went through — please check "My orders" first', 'err.DATE_CHANGED': 'It just passed midnight — press submit again to confirm',
      'err.NUMBER_CHANGED': 'The assigned number changed — press submit again to confirm', 'err.SEQ_CHANGED': 'The count changed — press submit again to confirm', 'err.SPEC_CHANGED': 'The size changed — for a design change choose "Revise"',
      'err.MOLD_NO_INVALID': 'Die no. may only use letters, digits and "-"', 'err.MOLD_OTHER_CUSTOMER': 'This die number is not yours', 'err.MOLD_EXISTS': 'This die no. and type are already registered (choose "Reuse die")',
      'err.NEED_MANUAL_NO': 'The system cannot assign a number — enter the new die no.', 'err.DUP_LINE': 'Duplicate item in this order (change the quantity instead)', 'err.NO_ACTIVE_OP': 'This type cannot be ordered right now — please contact AL-TRON',
      'err.OPTYPES_INVALID': 'System settings have a problem — orders cannot be placed now; please contact AL-TRON', 'err.NO_ROUTE': 'This type has no route set up yet — please contact AL-TRON', 'err.JOB_CONFIRMED': 'This job is confirmed for billing and cannot be changed',
      'err.BAD_ARG.DONE_AT_FORMAT': 'The finish time format is wrong', 'err.BAD_ARG.DONE_AT_INVALID': 'The finish time is not a valid date/time', 'err.BAD_ARG.DONE_AT_FUTURE': 'The finish time cannot be later than now',
      'err.BAD_ARG.DONE_AT_BEFORE_ORDER': 'The finish time cannot be before the order date ({orderDate})', 'err.BAD_ARG.DONE_AT_TOO_OLD': 'The finish time cannot be more than 60 days ago',
      'err.PERM_DENIED.UNCLAIM_OTHERS': 'Only the person who took it can put it back', 'err.PERM_DENIED.COMPLETE_OTHERS': '{by} is working on this station; only they can mark it done',
      'err.BAD_STATE.NOT_READY': 'This station is no longer ready (someone may have just taken it)', 'err.BAD_STATE.NOT_IN_PROGRESS': 'This station is not in progress', 'err.BAD_STATE.NOT_COMPLETABLE': 'This station cannot be finished now',
      'err.BAD_STATE.DRAWING_SIZE': 'The drawing file is too large — please contact AL-TRON',
      'err.BAD_ARG.DRAWING_TYPE': 'Drawings must be JPG, PNG or PDF', 'err.BAD_ARG.DRAWING_SIZE': 'Drawing files are limited to {maxMb} MB', 'err.BAD_ARG.DRAWING_BAD': 'The file could not be read — please choose it again',
      'err.NOT_FOUND.NO_MOLD': 'Die not found', 'err.NOT_FOUND.NO_DRAWING': 'This die has no drawing yet', 'err.NOT_FOUND.DRAWING_GONE': 'The drawing file is missing — please upload it again',
      'err.UNEXPECTED.DRAWING_FAILED': 'The drawing was not saved — please try again later', 'err.TOO_MANY.DRAWING_TOO_MANY': 'Too many uploads — please try again later'
    },
    th: {
      'app.title': 'จ่ายงานแม่พิมพ์', 'app.lang': 'ภาษา',
      'tab.ready': 'ถึงคิวฉัน', 'tab.mine': 'กำลังทำ', 'tab.progress': 'ดูความคืบหน้า', 'tab.order': 'สั่งงาน', 'tab.myOrders': 'คำสั่งของฉัน',
      'state.WAITING': 'ยังไม่ถึง', 'state.READY': 'รอเริ่ม', 'state.IN_PROGRESS': 'กำลังทำ', 'state.DONE': 'เสร็จ', 'state.SKIPPED': 'ข้าม',
      'card.seq': 'ครั้งที่ {n}', 'card.od': 'OD {v}', 'card.thick': 'หนา {v}', 'card.qty': 'จำนวน {v}', 'card.prev': 'ขั้นก่อนหน้า {st}: เสร็จ {at} โดย {who}',
      'card.takenBy': '{who} รับงานแล้ว', 'card.doneBy': 'เสร็จแล้ว ({who} {at})', 'card.jobClosed': 'ใบงานนี้จบแล้ว', 'card.notOwner': 'คุณไม่ใช่ผู้รับผิดชอบขั้นตอนนี้ ดูได้อย่างเดียว',
      'card.waiting': 'ยังไม่ถึงคิวขั้นตอนนี้', 'card.skipped': 'ขั้นตอนนี้ถูกข้าม', 'card.fromLink': 'จากการแจ้งเตือนของคุณ', 'card.note': 'หมายเหตุ: {v}', 'card.orderNote': 'หมายเหตุคำสั่งซื้อ: {v}', 'card.inote': 'ภายใน: {v} ({by})',
      'card.order': 'คำสั่งซื้อ {v}', 'card.missing': 'ไม่พบขั้นตอนในการแจ้งเตือน (อาจถูกย้อนกลับหรือยกเลิก)',
      'btn.claim': 'ฉันทำเอง', 'btn.complete': 'เสร็จ', 'btn.unclaim': 'คืนงาน', 'btn.reload': 'รีเฟรช', 'btn.ok': 'ตกลง', 'btn.cancel': 'ยกเลิก', 'btn.gotIt': 'รับทราบ', 'btn.retry': 'ลองอีกครั้ง', 'btn.working': 'กำลังดำเนินการ…',
      'done.title': 'จบ "{st}"', 'done.time': 'เวลาเสร็จ (ค่าเริ่มต้นคือตอนนี้ แก้ได้ถ้าบันทึกย้อนหลัง)', 'done.confirm': 'ยืนยันเสร็จ', 'done.rules': 'ต้องไม่เกินเวลาปัจจุบัน ไม่ก่อนวันที่สั่ง และไม่ย้อนหลังเกิน 60 วัน',
      'unclaim.confirm': 'คืน "{st}" กลับเป็นรอเริ่ม? (ผู้รับผิดชอบคนอื่นจะรับได้)',
      'toast.claimed': 'รับงานแล้ว', 'toast.completed': 'เสร็จแล้ว', 'toast.unclaimed': 'คืนงานแล้ว', 'toast.ordered': 'ส่งคำสั่งซื้อ {id} แล้ว', 'toast.uploaded': 'บันทึกแบบแล้ว', 'toast.refreshed': 'อัปเดตการยืนยันตัวตน LINE แล้ว กรุณากดอีกครั้ง', 'toast.draftBack': 'กู้คืนข้อมูลที่กรอกไว้แล้ว', 'toast.draftWhere': ' (อยู่ในแท็บ "{tab}")', 'order.refile': '(แบบ: แนบใน "คำสั่งของฉัน" หลังส่ง หรือลบรายการนี้แล้วเพิ่มใหม่)', 'toast.draftBackFile': 'กู้คืนข้อมูลที่กรอกไว้แล้ว กรุณาเลือกไฟล์แบบใหม่อีกครั้ง',
      'empty.ready': 'ตอนนี้ไม่มีงานที่ถึงคิวคุณ', 'empty.mine': 'ตอนนี้คุณไม่มีงานที่กำลังทำ', 'empty.progress': 'ไม่มีใบงานที่ตรงเงื่อนไข', 'empty.orders': 'ยังไม่มีคำสั่งที่กำลังทำ',
      'progress.search': 'ค้นหาเลขแม่พิมพ์ / เลขคำสั่งซื้อ / ลูกค้า', 'progress.all': 'ทั้งหมด', 'progress.readyOnly': 'รอเริ่ม', 'progress.stuckOnly': 'ติดขัด', 'progress.wait': 'รอ {n} วัน', 'progress.stuckTag': 'ติดขัด', 'progress.noOwner': 'ขั้นตอนนี้ไม่มีผู้รับผิดชอบ', 'progress.now': 'ตอนนี้: {st} ({state})',
      'order.step1': '1. ครั้งนี้', 'order.EXISTING': 'ใช้แม่พิมพ์เดิม', 'order.REVISE': 'แก้แบบ', 'order.NEW': 'เลขแม่พิมพ์ใหม่', 'order.STD': 'สินค้ามาตรฐาน',
      'order.moldNo': 'เลขแม่พิมพ์', 'order.lookup': 'ค้นหา', 'order.type': 'ประเภท', 'order.od': 'OD', 'order.thick': 'ความหนา (เช่น 45 หรือ 70+13)', 'order.qty': 'จำนวน',
      'order.set': 'แก้ทั้งชุด', 'order.single': 'แก้รายชิ้น', 'order.drawing': 'แนบแบบ (รูปถ่ายหรือ PDF ไม่แนบก็ได้)', 'order.add': 'เพิ่มรายการนี้', 'order.items': 'คำสั่งซื้อนี้', 'order.remove': 'ลบ',
      'order.note': 'หมายเหตุคำสั่งซื้อ (ไม่กรอกก็ได้)', 'order.submit': 'ส่งคำสั่งซื้อ', 'order.sending': 'กำลังส่ง…', 'order.confirmTitle': 'ยืนยันคำสั่งซื้อนี้', 'order.confirmOk': 'ยืนยันส่ง', 'order.pickType': 'กรุณาเลือกประเภท', 'order.lookupFirst': 'กรอกเลขแม่พิมพ์แล้วกด "ค้นหา"',
      'order.notFound': 'ในระบบไม่มีแม่พิมพ์เดิมเลขนี้ (แม่พิมพ์เก่าที่สั่งในระบบนี้ครั้งแรกให้เลือก "เลขแม่พิมพ์ใหม่")', 'order.takenByOther': 'เลขแม่พิมพ์นี้ไม่ใช่ของคุณ',
      'order.nextSeq': 'ครั้งนี้เป็นครั้งที่ {n}', 'order.openJobs': 'แม่พิมพ์นี้ยังมีใบงานที่ทำอยู่: {ids}', 'order.dupTitle': 'อาจสั่งซ้ำ', 'order.dupOk': 'ยืนยันสั่ง', 'order.dupLines': 'รายการที่ {lines} ยังมีใบงานที่ทำอยู่ ยืนยันจะสั่งอีกหรือไม่?',
      'order.needItem': 'ต้องเพิ่มอย่างน้อยหนึ่งรายการ', 'order.maxLines': 'หนึ่งคำสั่งซื้อไม่เกิน {n} รายการ', 'order.badQty': 'จำนวนต้องเป็นจำนวนเต็ม 1–999', 'order.pickOd': 'กรุณาเลือก OD', 'order.pv.seqQty': 'ครั้งที่ {n} · จำนวน {q}', 'order.pv.revise': 'แก้แบบ {prev} → {no}',
      'order.pv.autoNo': 'เลขที่ระบบให้: {nos} ถ้าเคยใช้เลขนี้แล้ว กรุณากดยกเลิกแล้วกรอกเลขใหม่', 'order.newNo': 'เลขแม่พิมพ์ใหม่ (ว่าง = ระบบให้)',
      'order.uploading': 'กำลังบันทึกแบบ… ({i}/{n})', 'order.uploadFailed': 'ส่งคำสั่งซื้อแล้ว แต่แบบ {n} ไฟล์บันทึกไม่สำเร็จ กรุณาแนบใหม่ใน "คำสั่งของฉัน"',
      'my.station': 'ตอนนี้: {st}', 'my.done': 'เสร็จแล้ว', 'my.cancelled': 'ยกเลิกแล้ว', 'my.viewDwg': 'ดูแบบ', 'my.addDwg': 'แนบแบบ', 'my.orderDate': 'สั่ง {d}', 'my.pdfHint': 'ถ้าโทรศัพท์เปิดไม่ได้ กรุณาดูบนคอมพิวเตอร์',
      'money.total': 'รวม {v}', 'money.quotePendingHint': ' (บางขั้นตอนเสนอราคาแยก ไม่รวมในยอด)', 'money.confirmedShort': 'ปิดบัญชีแล้ว', 'money.quoteLater': 'เสนอราคาแยก', 'money.estimate': 'ประมาณ {v}', 'money.estimateTotal': 'ยอดประมาณรวม {v}',
      'file.badType': 'รับเฉพาะรูป JPG/PNG หรือ PDF', 'file.tooBig': 'ไฟล์ใหญ่เกินไป (ไม่เกิน 2 MB)',
      'err.generic': 'เกิดข้อผิดพลาด กรุณาลองใหม่ภายหลัง', 'err.network': 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจเครือข่ายแล้วลองใหม่', 'err.timeout': 'เซิร์ฟเวอร์ตอบช้าเกินไป อาจทำสำเร็จแล้ว กรุณากดรีเฟรชเพื่อตรวจสอบ',
      'err.config': 'หน้านี้ตั้งค่าไม่ครบ กรุณาติดต่อ AL-TRON', 'err.sdk': 'ส่วนประกอบ LINE โหลดไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่', 'err.liffInit': 'เข้าสู่ระบบ LINE ไม่สำเร็จ กรุณาปิดหน้านี้แล้วเปิดใหม่จาก LINE', 'err.reopen': 'กรุณาปิดหน้านี้แล้วเปิดใหม่จาก LINE',
      'err.LIFF_TOKEN_INVALID': 'การยืนยันตัวตน LINE ไม่ถูกต้อง กรุณาปิดหน้านี้แล้วเปิดใหม่จาก LINE', 'err.LIFF_TOKEN_EXPIRED': 'การยืนยันตัวตน LINE หมดอายุ กรุณาปิดหน้านี้แล้วเปิดใหม่จาก LINE',
      'err.LINE_UNAVAILABLE': 'ยังยืนยันกับ LINE ไม่ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง', 'err.LINE_NOT_BOUND': 'กรุณาผูก LINE ทางการของ AL-TRON ก่อน (ขอรหัสผูกจากผู้ดูแล)', 'err.LINE_BIND_BROKEN': 'การผูก LINE มีปัญหา กรุณาติดต่อผู้ดูแล',
      'err.PORTAL_UNAVAILABLE': 'ยังยืนยันบัญชีไม่ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง', 'err.ACCOUNT_UNKNOWN': 'ไม่พบบัญชีที่ผูกกับ LINE นี้ กรุณาติดต่อผู้ดูแล', 'err.ACCOUNT_DISABLED': 'บัญชีนี้ถูกปิดใช้งาน',
      'err.CUSTOMER_INVALID': 'รหัสลูกค้าไม่ถูกต้อง กรุณาติดต่อ AL-TRON', 'err.CUSTOMER_INACTIVE': 'บัญชีลูกค้านี้ยังไม่เปิดใช้ กรุณาติดต่อ AL-TRON', 'err.PERM_DENIED': 'คุณไม่มีสิทธิ์ทำรายการนี้',
      'err.NOT_OWNER': 'คุณไม่ใช่ผู้รับผิดชอบขั้นตอนนี้ ดูได้อย่างเดียว', 'err.BAD_STATE': 'ขั้นตอนนี้เปลี่ยนไปแล้ว นี่คือสถานะล่าสุด', 'err.NOT_FOUND': 'ไม่พบ อาจมีการเปลี่ยนแปลง',
      'err.JOB_CANCELLED': 'ใบงานนี้ถูกยกเลิกแล้ว', 'err.LOCK_TIMEOUT': 'ระบบไม่ว่าง กรุณาลองใหม่อีกครั้ง', 'err.UNEXPECTED': 'ทำรายการไม่สำเร็จ กรุณาลองใหม่ภายหลัง', 'err.BAD_ARG': 'ข้อมูลที่กรอกไม่ถูกต้อง',
      'err.TOO_MANY': 'มากเกินไป กรุณาลองใหม่ภายหลัง', 'err.TOO_LARGE': 'ข้อมูลที่ส่งใหญ่เกินไป', 'err.BAD_REQUEST': 'รูปแบบคำขอไม่ถูกต้อง', 'err.UNKNOWN_ACTION': 'ไม่รู้จักคำสั่งนี้',
      'err.WRITE_UNCERTAIN': 'เกิดข้อผิดพลาดขณะบันทึก กรุณารีเฟรชเพื่อตรวจว่าสำเร็จหรือไม่', 'err.WRITE_FAILED': 'บันทึกไม่สำเร็จ กรุณาลองใหม่', 'err.WRITE_PARTIAL': 'บันทึกล้มเหลวกลางทาง กรุณาติดต่อ AL-TRON',
      'err.DUP_OPEN': 'อาจสั่งซ้ำ', 'err.REQ_CHANGED': 'การส่งครั้งก่อนสำเร็จแล้ว กรุณาดู "คำสั่งของฉัน" ก่อน', 'err.DATE_CHANGED': 'เพิ่งผ่านเที่ยงคืน กรุณากดส่งอีกครั้งเพื่อยืนยัน',
      'err.NUMBER_CHANGED': 'เลขที่ได้เปลี่ยน กรุณากดส่งอีกครั้งเพื่อยืนยัน', 'err.SEQ_CHANGED': 'ลำดับครั้งเปลี่ยน กรุณากดส่งอีกครั้งเพื่อยืนยัน', 'err.SPEC_CHANGED': 'ขนาดเปลี่ยน ถ้าแก้แบบให้เลือก "แก้แบบ"',
      'err.MOLD_NO_INVALID': 'เลขแม่พิมพ์ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ "-"', 'err.MOLD_OTHER_CUSTOMER': 'เลขแม่พิมพ์นี้ไม่ใช่ของคุณ', 'err.MOLD_EXISTS': 'เลขแม่พิมพ์และประเภทนี้ลงทะเบียนแล้ว (ให้เลือก "ใช้แม่พิมพ์เดิม")',
      'err.NEED_MANUAL_NO': 'ระบบให้เลขอัตโนมัติไม่ได้ กรุณากรอกเลขใหม่', 'err.DUP_LINE': 'รายการซ้ำในคำสั่งซื้อเดียวกัน (ให้แก้จำนวนแทน)', 'err.NO_ACTIVE_OP': 'ประเภทนี้สั่งไม่ได้ในตอนนี้ กรุณาติดต่อ AL-TRON',
      'err.OPTYPES_INVALID': 'การตั้งค่าระบบมีปัญหา สั่งงานไม่ได้ชั่วคราว กรุณาติดต่อ AL-TRON', 'err.NO_ROUTE': 'ประเภทนี้ยังไม่ได้ตั้งกระบวนการ กรุณาติดต่อ AL-TRON', 'err.JOB_CONFIRMED': 'ใบงานนี้ยืนยันปิดบัญชีแล้ว แก้ไขไม่ได้',
      'err.BAD_ARG.DONE_AT_FORMAT': 'รูปแบบเวลาเสร็จไม่ถูกต้อง', 'err.BAD_ARG.DONE_AT_INVALID': 'เวลาเสร็จไม่ใช่วันเวลาที่ถูกต้อง', 'err.BAD_ARG.DONE_AT_FUTURE': 'เวลาเสร็จต้องไม่เกินเวลาปัจจุบัน',
      'err.BAD_ARG.DONE_AT_BEFORE_ORDER': 'เวลาเสร็จต้องไม่ก่อนวันที่สั่ง ({orderDate})', 'err.BAD_ARG.DONE_AT_TOO_OLD': 'เวลาเสร็จต้องไม่ย้อนหลังเกิน 60 วัน',
      'err.PERM_DENIED.UNCLAIM_OTHERS': 'เฉพาะคนที่รับงานเท่านั้นที่คืนงานได้', 'err.PERM_DENIED.COMPLETE_OTHERS': '{by} กำลังทำขั้นตอนนี้ เฉพาะเจ้าตัวเท่านั้นที่กดเสร็จได้',
      'err.BAD_STATE.NOT_READY': 'ขั้นตอนนี้ไม่ได้รอเริ่มแล้ว (อาจมีคนเพิ่งรับไป)', 'err.BAD_STATE.NOT_IN_PROGRESS': 'ขั้นตอนนี้ไม่ได้อยู่ในสถานะกำลังทำ', 'err.BAD_STATE.NOT_COMPLETABLE': 'ขั้นตอนนี้ยังจบไม่ได้ในตอนนี้',
      'err.BAD_STATE.DRAWING_SIZE': 'ไฟล์แบบใหญ่เกินไป กรุณาติดต่อ AL-TRON',
      'err.BAD_ARG.DRAWING_TYPE': 'แบบรับเฉพาะ JPG, PNG, PDF', 'err.BAD_ARG.DRAWING_SIZE': 'ไฟล์แบบไม่เกิน {maxMb} MB', 'err.BAD_ARG.DRAWING_BAD': 'อ่านไฟล์ไม่ได้ กรุณาเลือกใหม่',
      'err.NOT_FOUND.NO_MOLD': 'ไม่พบแม่พิมพ์นี้', 'err.NOT_FOUND.NO_DRAWING': 'แม่พิมพ์นี้ยังไม่มีแบบ', 'err.NOT_FOUND.DRAWING_GONE': 'ไม่พบไฟล์แบบแล้ว กรุณาอัปโหลดใหม่',
      'err.UNEXPECTED.DRAWING_FAILED': 'บันทึกแบบไม่สำเร็จ กรุณาลองใหม่ภายหลัง', 'err.TOO_MANY.DRAWING_TOO_MANY': 'อัปโหลดมากเกินไป กรุณาลองใหม่ภายหลัง'
    }
  };
  //  站名、類型名：中文用伺服器給的（試算表上的）；英、泰 v0.3.0 起也由伺服器給（init.names，來自 OpExtra／MoldTypes），不再寫死
  function has_(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function namesOf(kind) { var n = S.init && S.init.names; return (n && has_(n, kind) && n[kind]) || {}; }
  function money(v) { var n = Number(v); if (!isFinite(n)) return String(v == null ? '' : v); return (n < 0 ? '-' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function t(k, v) {
    var d = I18N[S.lang] || I18N.zh, s = has_(d, k) ? d[k] : (has_(I18N.zh, k) ? I18N.zh[k] : null);
    if (s === null) return '[' + k + ']';
    return v ? String(s).replace(/\{(\w+)\}/g, function (a, n) { return has_(v, n) ? String(v[n]) : a; }) : s;
  }
  function opName(code, zh) { if (S.lang === 'zh') return zh || code; var N = namesOf('ops'), m = has_(N, code) ? N[code] : null; return (m && m[S.lang]) || zh || code; }
  function typeName(code, zh) { if (S.lang === 'zh') return zh || code; var N = namesOf('types'), m = has_(N, code) ? N[code] : null; return (m && m[S.lang]) || zh || code; }
  function moldNm(no, kind) {   // 標準品「車120」：英 STD 120、泰 มาตรฐาน 120（跟通知同一套）
    if (kind !== 'STD' || S.lang === 'zh') return String(no || '');
    var m = /^車(\d+)$/.exec(String(no || ''));
    return m ? (S.lang === 'th' ? 'มาตรฐาน ' : 'STD ') + m[1] : String(no || '');
  }
  function sameAcct(a, b) { return String(a || '').toUpperCase() === String(b || '').toUpperCase(); }
  //  錯誤：伺服器回的照代碼翻；中文可以直接用伺服器的句子（比較詳細）；不是伺服器回的（網路、逾時、程式自己的例外）一律固定句子
  function errText(e) {
    if (e && e.timeout) return t('err.timeout');
    if (!e || e.net) return t('err.network');
    if (e.fileMsg) return e.fileMsg;
    if (e.success !== false) return t('err.generic');
    var code = String(e.errorCode || ''), p = (e.errorParams && typeof e.errorParams === 'object') ? e.errorParams : {}, d = I18N[S.lang] || I18N.zh;
    if (S.lang === 'zh' && e.message && code !== 'LIFF_TOKEN_EXPIRED') return String(e.message);
    if (code && p.k && has_(d, 'err.' + code + '.' + p.k)) return t('err.' + code + '.' + p.k, p);
    if (code && has_(d, 'err.' + code)) return t('err.' + code, p);
    return t('err.generic');
  }
  function storedLang() { try { var v = localStorage.getItem(LANG_KEY); return (v === 'zh' || v === 'en' || v === 'th') ? v : ''; } catch (e) { return ''; } }

  /* ---------- DOM：只用 createElement／textContent ---------- */
  function h(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = String(v);
      else if (k === 'cls') e.className = v;
      else if (k === 'value') e.value = String(v);
      else if (k === 'checked' || k === 'disabled' || k === 'selected') e[k] = !!v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    });
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function short(x) { return x ? String(x).substring(5, 16).replace('-', '/') : ''; }
  function srvNow() { return Date.now() + S.skew; }
  function tpeStamp(ms) { return new Date(ms + 8 * 3600000).toISOString().substring(0, 16); }   // 台北時間 'YYYY-MM-DDTHH:mm'
  var CSS = [
    '*{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#1f2937;font-size:15px}',
    '.top{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-bottom:1px solid #e5e7eb}',
    '.top .ttl{font-weight:700;font-size:16px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.top select,.top button{font-size:13px;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151}',
    '.tabs{display:flex;gap:6px;padding:10px 12px 0;max-width:560px;margin:0 auto}.tabs button{flex:1;min-height:44px;border:1px solid #d1d5db;background:#fff;border-radius:8px;font-size:14px;color:#374151}',
    '.tabs button.on{background:#06C755;border-color:#06C755;color:#fff;font-weight:600}',
    '.wrap{padding:12px;max-width:560px;margin:0 auto}.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;margin-bottom:12px}',
    '.card.hl{border:2px solid #f59e0b;box-shadow:0 0 0 3px #fef3c7}.card .mo{font-size:18px;font-weight:700;word-break:break-all}.card .sub{color:#6b7280;font-size:13px;margin:2px 0}.sub.money{color:#1f2937;font-weight:600}',
    '.st{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:600;margin:6px 0}.st.READY{background:#fef9c3;color:#854d0e}.st.IN_PROGRESS{background:#dbeafe;color:#1e40af}',
    '.st.DONE{background:#dcfce7;color:#166534}.st.WAITING,.st.SKIPPED,.st.CANCELLED{background:#f3f4f6;color:#6b7280}.st.STUCK{background:#fee2e2;color:#991b1b}',
    '.note{font-size:13px;color:#374151;margin:2px 0;word-break:break-word}.inote{font-size:13px;color:#92400e;background:#fef3c7;border-radius:6px;padding:3px 8px;margin:4px 0;word-break:break-word}',
    '.msg{font-size:13px;color:#b45309;margin:6px 0}.acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '.btn{flex:1;min-height:48px;border-radius:10px;border:1px solid #d1d5db;background:#fff;font-size:16px;font-weight:600;color:#374151}.btn.p{background:#06C755;border-color:#06C755;color:#fff}',
    '.btn.sm{flex:0 0 auto;min-height:36px;font-size:13px;padding:0 12px}.btn:disabled{opacity:.5}',
    '.empty{text-align:center;color:#6b7280;padding:28px 8px}.err{background:#fee2e2;color:#991b1b;border-radius:10px;padding:14px;margin:12px;white-space:pre-line}',
    '.bar{display:flex;gap:8px;align-items:center;margin-bottom:10px}.bar input{flex:1;min-width:0;min-height:40px;border:1px solid #d1d5db;border-radius:8px;padding:6px 10px;font-size:15px}',
    '.chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}.chip{font-size:12px;padding:2px 6px;border-radius:6px;background:#f3f4f6;color:#6b7280}',
    '.chip.READY{background:#fef9c3;color:#854d0e}.chip.IN_PROGRESS{background:#dbeafe;color:#1e40af}.chip.DONE{background:#dcfce7;color:#166534}',
    '.mask{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:50;padding:14px}',
    '.box{background:#fff;border-radius:14px;padding:16px;width:100%;max-width:420px;max-height:90vh;overflow:auto}.box h3{margin:0 0 10px;font-size:17px;word-break:break-all}',
    '.box input,.box select,.fld input,.fld select{width:100%;min-height:44px;font-size:16px;border:1px solid #d1d5db;border-radius:8px;padding:6px 10px;background:#fff}',
    '.fld{margin:8px 0}.fld label{display:block;font-size:13px;color:#6b7280;margin-bottom:3px}.seg{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}',
    '.seg button{flex:1;min-height:44px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:14px;color:#374151}.seg button.on{background:#1d4ed8;border-color:#1d4ed8;color:#fff}',
    '#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;z-index:60;max-width:92%;display:none;white-space:pre-line}',
    '#toast.bad{background:#dc2626}img.dwg{max-width:100%;border:1px solid #e5e7eb;border-radius:8px}ol.pv{padding-left:20px;margin:6px 0}ol.pv li{margin:4px 0}'
  ].join('\n');

  /* ---------- 伺服器 ---------- */
  function takeToken() {
    S.tok = (window.liff && typeof liff.getIDToken === 'function' && liff.getIDToken()) || '';
    S.exp = 0;
    try { var p = S.tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); while (p.length % 4) p += '='; S.exp = Number(JSON.parse(atob(p)).exp) || 0; } catch (e) { S.exp = 0; }
  }
  //  一律 POST text/plain（免 preflight）；idToken 只放 body；等太久（逾時）就放棄，但告訴人「可能已經成功」
  //  quiet＝背景的請求（送通知、下單之後接著傳圖面）：身分證明過期也不自動重新整理（不然客戶剛做的事會整頁不見；v0.2.0 審查）
  function rpc(action, extra, waitMs, quiet) {
    var body = { action: action, idToken: S.tok };
    Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
    var ctl = (typeof AbortController === 'function') ? new AbortController() : null, timer = 0, timedOut = false;
    if (ctl) timer = setTimeout(function () { timedOut = true; ctl.abort(); }, waitMs || 45000);
    var opts = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) };
    if (ctl) opts.signal = ctl.signal;
    return fetch(GAS + '?api=liff', opts)
      .then(function (r) { if (!r.ok) throw { net: true }; return r.json(); }, function () { throw timedOut ? { net: true, timeout: true } : { net: true }; })
      .then(function (res) {
        clearTimeout(timer);
        if (!res || res.success === false) {
          if (!quiet && res && (res.errorCode === 'LIFF_TOKEN_EXPIRED' || res.errorCode === 'LIFF_TOKEN_INVALID') && renew(extra && extra.op)) return new Promise(function () {});
          throw res || { success: false };
        }
        return res;
      }, function (e) { clearTimeout(timer); throw (e && (e.net || e.success === false)) ? e : { net: true }; });
  }
  function flush() { rpc('flush', {}, 20000, true).catch(function () {}); }   // 背景請系統送通知（失敗不影響畫面；另有每 10 分鐘的排程保底）

  /* ---------- LINE 身分過期：登出、重新整理、停在同一站（LINE 會發新的）；1 分鐘內不重來第二次（免得一直轉） ---------- */
  //  記號＝時間（開頁就先換的，後面多一個 o：回來不說「請再按一次」—— 他什麼都還沒按）
  function renewedRecently() { try { return Date.now() - (parseInt(sessionStorage.getItem(RENEW_KEY) || '0', 10) || 0) < 60000; } catch (e) { return true; } }
  function renewedAtOpen() { try { return /o$/.test(String(sessionStorage.getItem(RENEW_KEY) || '')); } catch (e) { return false; } }
  //  換新回來要停在原本那個分頁：開好頁之後照「目前在哪個分頁」（查進度／我的、我的單），還沒開好照網址（審查第三輪 LOW-1）
  function hereUrl(op) {
    var q = [], v = S.me ? (S.tab === 'progress' ? 'progress' : ((S.tab === 'mine' || S.tab === 'myOrders') ? 'mine' : '')) : S.view;
    if (op && OP_RE.test(op)) q.push('op=' + encodeURIComponent(op));
    if (v) q.push('view=' + v);
    return location.pathname + (q.length ? '?' + q.join('&') : '');
  }
  function renew(op, atOpen) {
    if (renewedRecently()) return false;
    try { sessionStorage.setItem(RENEW_KEY, String(Date.now()) + (atOpen ? 'o' : '')); } catch (e) { return false; }
    saveDraft();
    var url = hereUrl(op || S.focus);
    try { liff.logout(); } catch (e1) {}
    var inClient = false;
    try { inClient = !!liff.isInClient(); } catch (e2) {}
    if (inClient) location.replace(url);                                  // LINE 裡：重新整理，liff.init 會自動重新登入
    else { try { liff.login({ redirectUri: location.origin + url }); } catch (e3) { location.replace(url); } }   // 外部瀏覽器：重新登入後回到同一站
    return true;
  }
  //  客戶填到一半的單：重新整理之前存在這個分頁（sessionStorage），回來馬上還原、刪掉；檔案存不了（只記「有附」，請他重選）
  //  存的時候記「是誰的」（帳號的雜湊，不存帳號本身）：外部瀏覽器同一個分頁換成別的 LINE 帳號登入，不會看到上一位的草稿
  function acctTag(a) { var s = String(a || '').toUpperCase(), x = 5381; for (var i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0; return 'a' + x.toString(36); }
  function saveDraft() {
    if (!S.me || !S.me.isCustomer) return;
    var strip = function (L) { var x = {}; Object.keys(L || {}).forEach(function (k) { if (k !== 'file') x[k] = L[k]; }); x.hadFile = !!(L && (L.file || L.hadFile)); return x; };
    if (!S.lines.length && !S.note && !(S.draft && (S.draft.moldNo || S.draft.file || S.draft.hadFile))) return;
    //  送出代號也存：上一次其實已經建好（網路斷掉沒看到），回來再送會被認出是同一筆，不會多一張
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ who: acctTag(S.me.account), reqId: S.reqId || '', lines: S.lines.map(strip), note: S.note, draft: S.draft ? strip(S.draft) : null })); } catch (e) {}
  }
  function takeDraft(me) {
    var d = null;
    try { d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); sessionStorage.removeItem(DRAFT_KEY); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || !Array.isArray(d.lines) || !me || d.who !== acctTag(me.account)) return null;
    return d;
  }
  //  按下去之前先看身分證明還剩多久（照伺服器的時間算）：不到 90 秒 ⇒ 先換新的再請他按
  function fresh(op) { if (S.exp && S.exp * 1000 - srvNow() < 90000) return !renew(op); return true; }

  /* ---------- 共用小畫面 ---------- */
  function toast(msg, bad, ms) {
    var el = $('toast'); if (!el) return;
    el.textContent = msg; el.className = bad ? 'bad' : ''; el.style.display = 'block';
    clearTimeout(S.toastT); S.toastT = setTimeout(function () { el.style.display = 'none'; }, ms || (bad ? 5000 : 2200));
  }
  function untoast() { var el = $('toast'); clearTimeout(S.toastT); if (el) el.style.display = 'none'; }
  function fatal(msg, retry) {
    var a = $('app'); clear(a); closeDialog();
    var b = $('boot'); if (b) b.style.display = 'none';
    a.appendChild(h('div', { cls: 'err', id: 'fatal', text: msg }));
    if (retry) a.appendChild(h('div', { cls: 'wrap' }, [h('button', { cls: 'btn', id: 'retry', text: t('btn.retry'), onclick: function () { clear(a); if (b) b.style.display = ''; boot(); } })]));
  }
  function dialog(title, body, okLabel, onOk, noCancel, onCancel) {
    closeDialog();
    var okB = h('button', { cls: 'btn p', id: 'dOk', text: okLabel || t('btn.ok') });
    var cancelB = noCancel ? null : h('button', { cls: 'btn', id: 'dCancel', text: t('btn.cancel'), onclick: function () { closeDialog(); if (onCancel) onCancel(); } });
    okB.addEventListener('click', function () {
      if (okB.disabled) return;
      okB.disabled = true;
      Promise.resolve(onOk ? onOk() : true).then(function (ok) { okB.disabled = false; if (ok !== false) closeDialog(); }, function () { okB.disabled = false; });
    });
    document.body.appendChild(h('div', { cls: 'mask', id: 'dlg' }, [h('div', { cls: 'box' }, [h('h3', { text: title }), body, h('div', { cls: 'acts' }, [cancelB, okB])])]));
  }
  function closeDialog() { var d = $('dlg'); if (d && d.parentNode) d.parentNode.removeChild(d); }
  function header() {
    var who = S.me.isCustomer ? (S.init.customerName || S.me.customerId) + ' · ' + S.me.name : S.me.name;
    var sel = h('select', { id: 'lang', 'aria-label': t('app.lang') }, [['zh', '中文'], ['en', 'English'], ['th', 'ไทย']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: x[0] === S.lang }); }));
    sel.addEventListener('change', function () { S.lang = sel.value; try { localStorage.setItem(LANG_KEY, S.lang); } catch (e) {} render(); });
    return h('div', { cls: 'top' }, [h('div', { cls: 'ttl', text: t('app.title') + ' · ' + who }), h('button', { id: 'reload', text: '↻ ' + t('btn.reload'), onclick: reloadTab }), sel]);
  }
  function tabs(list) {
    return h('div', { cls: 'tabs' }, list.map(function (x) {
      return h('button', { cls: S.tab === x[0] ? 'on' : '', 'data-tab': x[0], text: x[1], onclick: function () {
        S.tab = x[0]; render();
        if (x[0] === 'progress' && !S.board) loadProgress();
        if (x[0] === 'myOrders') loadMyOrders();
      } });
    }));
  }
  function reloadTab() {
    if (S.busy) return;
    if (S.me.isCustomer) { if (S.tab === 'myOrders') loadMyOrders(); return; }
    if (S.tab === 'progress') return loadProgress();
    rpc('list', { op: S.focus }).then(function (r) { S.todo = r; render(); }, function (e) { toast(errText(e), true); });
  }

  /* ---------- 員工 ---------- */
  function isMineWip(it) { return it.state === 'IN_PROGRESS' && sameAcct(it.claimedBy, S.me.account); }
  function focusTab(f) { return isMineWip(f) ? 'mine' : 'ready'; }
  function jobLine(j) {
    var bits = [j.customerName || j.customerId, t('card.od', { v: j.od || '—' })];
    if (j.thickness) bits.push(t('card.thick', { v: j.thickness }));
    bits.push(t('card.qty', { v: j.qty }), t('card.seq', { n: j.seq }));
    return bits.join(' · ');
  }
  function opCard(it, hl) {
    var j = it.job, kids = [];
    if (hl) kids.push(h('div', { cls: 'sub', text: t('card.fromLink') }));
    kids.push(h('div', { cls: 'mo', text: moldNm(j.moldNo, j.kind) + ' ' + typeName(j.typeCode, j.typeName) }));
    kids.push(h('div', { cls: 'sub', text: jobLine(j) }));
    kids.push(h('div', { cls: 'sub', text: t('card.order', { v: j.orderId }) }));
    kids.push(h('span', { cls: 'st ' + it.state, text: opName(it.code, it.name) + '・' + t('state.' + it.state) + (it.state === 'IN_PROGRESS' && it.claimedBy ? '（' + (it.claimedByName || it.claimedBy) + '）' : '') }));
    if (it.prev) kids.push(h('div', { cls: 'note', text: t('card.prev', { st: opName(it.prev.code, it.prev.name), at: short(it.prev.doneAt), who: it.prev.doneByName || it.prev.doneBy || '' }) }));
    if (j.orderNote) kids.push(h('div', { cls: 'note', text: t('card.orderNote', { v: j.orderNote }) }));
    if (j.note) kids.push(h('div', { cls: 'note', text: t('card.note', { v: j.note }) }));
    (j.internalNotes || []).forEach(function (n) { kids.push(h('div', { cls: 'inote', text: t('card.inote', { v: n.text, by: n.by }) })); });
    //  不能按的原因直接講現在的狀態（從通知點進來、已經被別人接走或做完的，不報錯）
    var why = '';
    if (j.status !== 'OPEN' && j.status !== 'WIP') why = t('card.jobClosed');
    else if (it.state === 'DONE') why = t('card.doneBy', { who: it.doneByName || it.doneBy, at: short(it.doneAt) });
    else if (it.state === 'SKIPPED') why = t('card.skipped');
    else if (it.state === 'WAITING') why = t('card.waiting');
    else if (it.state === 'IN_PROGRESS' && !isMineWip(it)) why = t('card.takenBy', { who: it.claimedByName || it.claimedBy });
    else if (!it.own) why = t('card.notOwner');
    if (why) kids.push(h('div', { cls: 'msg', text: why }));
    var acts = [];
    if (it.canClaim) acts.push(h('button', { cls: 'btn p', 'data-act': 'claim', 'data-op': it.id, text: t('btn.claim'), onclick: function (ev) { doAct(ev.currentTarget, 'claim', it, 'toast.claimed'); } }));
    if (it.canComplete) acts.push(h('button', { cls: 'btn p', 'data-act': 'complete', 'data-op': it.id, text: t('btn.complete'), onclick: function (ev) { askDone(ev.currentTarget, it); } }));
    if (it.canUnclaim) acts.push(h('button', { cls: 'btn', 'data-act': 'unclaim', 'data-op': it.id, text: t('btn.unclaim'), onclick: function (ev) { askUnclaim(ev.currentTarget, it); } }));
    if (acts.length) kids.push(h('div', { cls: 'acts' }, acts));
    return h('div', { cls: 'card' + (hl ? ' hl' : ''), 'data-op': it.id }, kids);
  }
  function renderStaff(main) {
    var td = S.todo || { ready: [], mine: [] }, ready = td.ready || [], mine = td.mine || [];
    main.appendChild(tabs([['ready', t('tab.ready') + '（' + ready.length + '）'], ['mine', t('tab.mine') + '（' + mine.length + '）'], ['progress', t('tab.progress')]]));
    var w = h('div', { cls: 'wrap', id: 'list' });
    main.appendChild(w);
    if (S.tab === 'progress') return renderProgress(w);
    var list = S.tab === 'mine' ? mine : ready;
    if (S.focus && td.focusMissing) w.appendChild(h('div', { cls: 'msg', id: 'focusMissing', text: t('card.missing') }));
    //  從通知點進來的那一站：排在它該在的分頁最前面、標亮（別人接走、做完的也照現在的狀態顯示）
    var f = (S.focus && td.focus && td.focus.id === S.focus && focusTab(td.focus) === S.tab) ? td.focus : null;
    if (f) w.appendChild(opCard(f, true));
    list.forEach(function (it) { if (!f || it.id !== f.id) w.appendChild(opCard(it, false)); });
    if (!w.firstChild) w.appendChild(h('div', { cls: 'empty', text: S.tab === 'mine' ? t('empty.mine') : t('empty.ready') }));
  }
  //  按下去：先確認身分證明夠新 → 送 → 用回來的待辦重畫；被擋也用回來的待辦重畫（看得到現在的狀態）
  function doAct(btn, action, it, okKey, extra) {
    if (S.busy) return Promise.resolve('BUSY');
    if (!fresh(it.id)) return Promise.resolve('RENEW');
    S.busy = true;
    if (btn) { btn.disabled = true; btn.textContent = t('btn.working'); }
    var body = { op: it.id, focus: S.focus };
    Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
    return rpc(action, body).then(function (r) {
      if (r.todo) S.todo = r.todo;
      toast(t(okKey));
      if (action === 'claim' && it.id === S.focus) S.tab = 'mine';   // 從通知點進來、按了我來做 ⇒ 跳到「我正在做」，完成鈕就在最上面
      if (action === 'complete') flush();                              // 完成 ⇒ 下一站可能輪到了：背景請系統送通知
      return 'OK';
    }, function (e) {
      if (e && e.todo) S.todo = e.todo;
      toast(errText(e), true);
      return (e && e.errorCode) || 'ERR';
    }).then(function (code) { S.busy = false; render(); return code; });
  }
  function askDone(btn, it) {
    var now = tpeStamp(srvNow()), floor = tpeStamp(srvNow() - 60 * 86400000).substring(0, 10), od = String(it.job.orderDate || '');
    var inp = h('input', { type: 'datetime-local', id: 'doneAt', value: now, max: now, min: (od > floor ? od : floor) + 'T00:00' });
    dialog(t('done.title', { st: opName(it.code, it.name) }), h('div', {}, [h('div', { cls: 'fld' }, [h('label', { text: t('done.time') }), inp]), h('div', { cls: 'sub', text: t('done.rules') })]), t('done.confirm'), function () {
      var v = String(inp.value || '').substring(0, 16);
      //  沒改就送空白 ＝ 伺服器的「現在」；時間不對（BAD_ARG）⇒ 確認框留著讓他改
      return doAct(btn, 'complete', it, 'toast.completed', { doneAt: (v && v !== now) ? v.replace('T', ' ') : '' }).then(function (code) { return code !== 'BAD_ARG'; });
    });
  }
  function askUnclaim(btn, it) {
    dialog(t('btn.unclaim'), h('p', { text: t('unclaim.confirm', { st: opName(it.code, it.name) }) }), t('btn.unclaim'), function () { return doAct(btn, 'unclaim', it, 'toast.unclaimed').then(function () { return true; }); });
  }
  function loadProgress() {
    return rpc('progress').then(function (r) { S.board = r; render(); }, function (e) { toast(errText(e), true); });
  }
  function renderProgress(w) {
    var B = S.board;
    var q = h('input', { type: 'search', id: 'pq', placeholder: t('progress.search'), value: S.bq });
    q.addEventListener('input', function () { S.bq = q.value; drawRows(); });
    w.appendChild(h('div', { cls: 'bar' }, [q]));
    w.appendChild(h('div', { cls: 'seg', id: 'pf' }, [['all', t('progress.all')], ['ready', t('progress.readyOnly')], ['stuck', t('progress.stuckOnly')]].map(function (x) {
      return h('button', { cls: S.bf === x[0] ? 'on' : '', 'data-val': x[0], text: x[1], onclick: function () { S.bf = x[0]; render(); } });
    })));
    var rows = h('div', { id: 'prows' });
    w.appendChild(rows);
    function drawRows() {
      clear(rows);
      if (!B) return;
      var qq = String(S.bq || '').trim().toUpperCase();
      var js = (B.jobs || []).filter(function (j) {
        if (S.bf === 'stuck' && !j.stuck) return false;
        if (S.bf === 'ready' && j.activeState !== 'READY') return false;
        if (!qq) return true;
        return [j.moldNo, moldNm(j.moldNo, j.kind), j.orderId, j.customerName, j.customerId].some(function (x) { return String(x || '').toUpperCase().indexOf(qq) >= 0; });
      });
      if (!js.length) { rows.appendChild(h('div', { cls: 'empty', text: t('empty.progress') })); return; }
      js.forEach(function (j) {
        var kids = [h('div', { cls: 'mo', text: moldNm(j.moldNo, j.kind) + ' ' + typeName(j.typeCode, j.typeName) }), h('div', { cls: 'sub', text: jobLine(j) + ' · ' + j.orderId })];
        if (j.activeOp) {
          var extra = (j.waitDays !== null && j.waitDays !== undefined ? ' · ' + t('progress.wait', { n: j.waitDays }) : '') + (j.stuck ? ' · ' + t('progress.stuckTag') : '');
          kids.push(h('span', { cls: 'st ' + (j.stuck ? 'STUCK' : j.activeState), text: t('progress.now', { st: opName(j.activeOp, j.activeName), state: t('state.' + j.activeState) }) + extra }));
        }
        if (j.noOwner) kids.push(h('div', { cls: 'msg', text: t('progress.noOwner') }));
        kids.push(h('div', { cls: 'chips' }, (B.stations || []).map(function (s) { var c = j.cells && j.cells[s.code]; return h('span', { cls: 'chip ' + (c ? c.state : ''), text: opName(s.code, s.name) + ' ' + (c ? t('state.' + c.state) : '—') }); })));
        (j.internalNotes || []).forEach(function (n) { kids.push(h('div', { cls: 'inote', text: t('card.inote', { v: n.text, by: n.by }) })); });
        rows.appendChild(h('div', { cls: 'card', 'data-job': j.jobId }, kids));
      });
    }
    drawRows();
  }

  /* ---------- 客戶 ---------- */
  function renderCustomer(main) {
    var tl = [['myOrders', t('tab.myOrders')]];
    if (S.me.can.order) tl.unshift(['order', t('tab.order')]);
    main.appendChild(tabs(tl));
    var w = h('div', { cls: 'wrap', id: 'list' });
    main.appendChild(w);
    if (S.tab === 'order' && S.me.can.order) return renderOrderForm(w);
    renderMyOrders(w);
  }
  function loadMyOrders(quiet) {
    return rpc('myOrders', {}, 0, quiet).then(function (r) { S.orders = r.orders || []; render(); }, function (e) { if (!quiet) toast(errText(e), true); });
  }
  function jobState(j) {
    if (j.status === 'DONE') return { cls: 'DONE', text: t('my.done') };
    if (j.status === 'CANCELLED') return { cls: 'CANCELLED', text: t('my.cancelled') };
    var cur = null;
    (j.ops || []).forEach(function (o) { if (!cur && o.state !== 'DONE' && o.state !== 'SKIPPED') cur = o; });
    return cur ? { cls: cur.state, text: t('my.station', { st: opName(cur.code, cur.name) + '・' + t('state.' + cur.state) }) } : { cls: 'WAITING', text: '' };
  }
  function renderMyOrders(w) {
    var os = S.orders || [];
    if (!os.length) { w.appendChild(h('div', { cls: 'empty', text: t('empty.orders') })); return; }
    os.forEach(function (o) {
      var kids = [h('div', { cls: 'mo', text: o.orderId }), h('div', { cls: 'sub', text: t('my.orderDate', { d: o.orderDate }) })];
      if (o.note) kids.push(h('div', { cls: 'note', text: t('card.orderNote', { v: o.note }) }));
      (o.jobs || []).forEach(function (j) {
        var acts = [], js = jobState(j);
        if (j.hasDrawing) acts.push(h('button', { cls: 'btn sm', 'data-act': 'dwg', 'data-key': j.moldKey, text: t('my.viewDwg'), onclick: function (ev) { viewDrawing(ev.currentTarget, j.moldKey); } }));
        if (S.me.can.order && j.kind !== 'STD') acts.push(h('button', { cls: 'btn sm', 'data-act': 'addDwg', 'data-key': j.moldKey, text: t('my.addDwg'), onclick: function () { pickAndUpload(j.moldKey); } }));
        kids.push(h('div', { cls: 'card', 'data-job': j.jobId }, [h('div', { cls: 'mo', text: moldNm(j.moldNo, j.kind) + ' ' + typeName(j.typeCode, j.typeName) }),
          h('div', { cls: 'sub', text: t('card.qty', { v: j.qty }) + ' · ' + t('card.seq', { n: j.seq }) }), js.text ? h('span', { cls: 'st ' + js.cls, text: js.text }) : null,
          moneyLine(j),
          j.note ? h('div', { cls: 'note', text: t('card.note', { v: j.note }) }) : null, acts.length ? h('div', { cls: 'acts' }, acts) : null]));
      });
      w.appendChild(h('div', { cls: 'card', 'data-order': o.orderId }, kids));
    });
  }
  //  客戶看得到的錢（v0.3.0 §8）：合計、有站另行報價、已結帳；伺服器沒給 money 的身分（員工）什麼都不顯示
  function moneyLine(j) {
    var m = j.money; if (!m || j.status === 'CANCELLED') return null;
    var txt = t('money.total', { v: money(m.total) }) + (m.pending ? t('money.quotePendingHint') : '') + (m.confirmed ? ' · ' + t('money.confirmedShort') : '');
    return h('div', { cls: 'sub money', text: txt });
  }
  function viewDrawing(btn, key) {
    btn.disabled = true;
    rpc('getDrawing', { moldKey: key }, 60000).then(function (r) {
      btn.disabled = false;
      var body;
      if (/^image\/(jpeg|png)$/.test(r.type)) body = h('img', { cls: 'dwg', alt: '', src: 'data:' + r.type + ';base64,' + r.data });
      else {
        var url = '';
        try { var bin = atob(r.data), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' })); } catch (e) { url = ''; }
        body = h('div', {}, [url ? h('a', { href: url, download: r.name, target: '_blank', rel: 'noopener', text: r.name }) : null, h('p', { cls: 'sub', text: t('my.pdfHint') })]);
      }
      dialog(r.name, body, t('btn.gotIt'), null, true);
    }, function (e) { btn.disabled = false; toast(errText(e), true); });
  }
  //  附圖面：照片先縮到長邊 2000px、JPEG（約 1 MB 內）；PDF 原檔（2 MB 內）。伺服器照樣再檢查類型、大小、檔頭
  var B64_MAX = 2796000;
  function fileToPayload(f) {
    return new Promise(function (resolve, reject) {
      if (!f) return reject({ fileMsg: t('file.badType') });
      if (f.type === 'application/pdf') {
        if (f.size > 2 * 1024 * 1024) return reject({ fileMsg: t('file.tooBig') });
        var rd = new FileReader();
        rd.onload = function () { var d = String(rd.result || ''); resolve({ type: 'application/pdf', data: d.substring(d.indexOf(',') + 1) }); };
        rd.onerror = function () { reject({ fileMsg: t('file.badType') }); };
        return rd.readAsDataURL(f);
      }
      if (!/^image\//.test(f.type)) return reject({ fileMsg: t('file.badType') });
      var url = '';
      try { url = URL.createObjectURL(f); } catch (e0) { return reject({ fileMsg: t('file.badType') }); }
      var img = new Image();
      img.onload = function () {
        try {
          var w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height, k = Math.min(1, 2000 / Math.max(w0, h0, 1)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          var q = 0.82, d = cv.toDataURL('image/jpeg', q);
          while (d.length > 1400000 && q > 0.4) { q -= 0.12; d = cv.toDataURL('image/jpeg', q); }
          try { URL.revokeObjectURL(url); } catch (e1) {}
          var b64 = d.substring(d.indexOf(',') + 1);
          if (d.indexOf('data:image/jpeg;base64,') !== 0 || b64.length > B64_MAX) return reject({ fileMsg: t('file.tooBig') });
          resolve({ type: 'image/jpeg', data: b64 });
        } catch (e) { reject({ fileMsg: t('file.badType') }); }
      };
      img.onerror = function () { reject({ fileMsg: t('file.badType') }); };
      img.src = url;
    });
  }
  function upload(key, f, quiet) {
    return fileToPayload(f).then(function (p) { return rpc('uploadDrawing', { moldKey: key, file: p }, 120000, quiet); });
  }
  function pickAndUpload(key) {
    if (S.busy) return;
    var inp = h('input', { type: 'file', id: 'dwgFile', accept: 'image/*,application/pdf' });
    dialog(t('my.addDwg'), h('div', { cls: 'fld' }, [inp]), t('btn.ok'), function () {
      var f = inp.files && inp.files[0];
      if (!f) { toast(t('file.badType'), true); return false; }
      if (!fresh()) return true;
      S.busy = true;
      return upload(key, f).then(function () { S.busy = false; toast(t('toast.uploaded')); loadMyOrders(); return true; },
                                  function (e) { S.busy = false; toast(errText(e), true); return false; });
    });
  }
  function newDraft(mode) { return { mode: mode || 'EXISTING', moldNo: '', typeCode: '', reviseKind: 'SET', newMoldNo: '', od: '', thickness: '', qty: '1', look: null, file: null, lookMsg: '' }; }
  function seg(f, cur, pairs, onPick) {
    return h('div', { cls: 'seg', 'data-f': f }, pairs.map(function (p) { return h('button', { cls: cur === p[0] ? 'on' : '', 'data-val': p[0], text: p[1], onclick: function () { onPick(p[0]); } }); }));
  }
  function odSelect(D) {
    var s = h('select', { id: 'fOd' }, [h('option', { value: '', text: '—' })].concat((S.init.odList || []).map(function (d) { return h('option', { value: String(d), text: String(d), selected: String(D.od) === String(d) }); })));
    s.addEventListener('change', function () { D.od = s.value; });
    return s;
  }
  function renderOrderForm(w) {
    var D = S.draft || (S.draft = newDraft()), I = S.init;
    var f = h('div', { cls: 'card', id: 'draft' });
    f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.step1') }), seg('mode', D.mode, ['EXISTING', 'REVISE', 'NEW', 'STD'].map(function (m) { return [m, t('order.' + m)]; }), function (m) { S.draft = newDraft(m); render(); })]));
    if (D.mode !== 'STD') {
      var mn = h('input', { type: 'text', id: 'fMold', value: D.moldNo, maxlength: '40', autocapitalize: 'characters', autocomplete: 'off' });
      mn.addEventListener('input', function () { D.moldNo = mn.value; D.look = null; D.lookMsg = ''; });
      f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.moldNo') }), h('div', { cls: 'bar' }, [mn, h('button', { cls: 'btn sm', id: 'fLook', text: t('order.lookup'), onclick: function () {
        if (S.busy) return;
        rpc('lookupMold', { moldNo: D.moldNo }).then(function (r) { D.look = r; D.moldNo = r.moldNo; D.typeCode = ''; D.lookMsg = r.takenByOther ? t('order.takenByOther') : ''; render(); },
                                                     function (e) { D.look = null; D.lookMsg = errText(e); render(); });
      } })])]));
      if (D.lookMsg) f.appendChild(h('div', { cls: 'msg', id: 'lookMsg', text: D.lookMsg }));
      if (D.look && !D.look.takenByOther) {
        var types = D.mode === 'EXISTING' ? (D.look.found || []).map(function (x) { return { code: x.typeCode, name: x.typeName }; }) : (I.types || []).filter(function (x) { return x.forMold !== false; });
        if (D.mode === 'EXISTING' && !types.length) f.appendChild(h('div', { cls: 'msg', id: 'notFound', text: t('order.notFound') }));
        else f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.type') }), seg('typeCode', D.typeCode, types.map(function (x) { return [x.code, typeName(x.code, x.name)]; }), function (c) { D.typeCode = c; render(); })]));
        var hit = null; (D.look.found || []).forEach(function (x) { if (x.typeCode === D.typeCode) hit = x; });
        if (D.mode === 'EXISTING' && hit) {
          f.appendChild(h('div', { cls: 'sub', text: t('order.nextSeq', { n: hit.nextSeq }) }));
          if (hit.openJobs && hit.openJobs.length) f.appendChild(h('div', { cls: 'msg', text: t('order.openJobs', { ids: hit.openJobs.map(function (x) { return x.jobId; }).join('、') }) }));
        }
        if (D.mode === 'REVISE') {
          f.appendChild(seg('reviseKind', D.reviseKind, [['SET', t('order.set')], ['SINGLE', t('order.single')]], function (k) { D.reviseKind = k; render(); }));
          var nn = h('input', { type: 'text', id: 'fNewNo', value: D.newMoldNo, maxlength: '40', autocomplete: 'off' });
          nn.addEventListener('input', function () { D.newMoldNo = nn.value; });
          f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.newNo') }), nn]));
        }
        if (D.mode === 'REVISE' || D.mode === 'NEW') {
          var th = h('input', { type: 'text', id: 'fThick', value: D.thickness, maxlength: '20', inputmode: 'decimal', autocomplete: 'off' });
          th.addEventListener('input', function () { D.thickness = th.value; });
          f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.od') }), odSelect(D)]));
          f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.thick') }), th]));
        }
      } else if (!D.lookMsg) f.appendChild(h('div', { cls: 'sub', text: t('order.lookupFirst') }));
    } else {
      var stdT = (I.types || []).filter(function (x) { return (I.stdTypes || []).indexOf(x.code) >= 0; });
      f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.type') }), seg('typeCode', D.typeCode, stdT.map(function (x) { return [x.code, typeName(x.code, x.name)]; }), function (c) { D.typeCode = c; render(); })]));
      f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.od') }), odSelect(D)]));
    }
    var qty = h('input', { type: 'number', id: 'fQty', min: '1', max: '999', value: D.qty, inputmode: 'numeric' });
    qty.addEventListener('input', function () { D.qty = qty.value; });
    f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.qty') }), qty]));
    if (D.mode !== 'STD') {
      var fi = h('input', { type: 'file', id: 'fFile', accept: 'image/*,application/pdf' });
      fi.addEventListener('change', function () { D.file = (fi.files && fi.files[0]) || null; });
      f.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.drawing') }), fi]));
    }
    f.appendChild(h('div', { cls: 'acts' }, [h('button', { cls: 'btn', id: 'fAdd', text: t('order.add'), onclick: addDraft })]));
    w.appendChild(f);
    var items = h('div', { cls: 'card', id: 'items' }, [h('div', { cls: 'mo', text: t('order.items') })]);
    S.lines.forEach(function (L, i) {
      var what = (L.mode === 'STD' ? moldNm('車' + L.od, 'STD') : L.moldNo) + ' ' + typeName(L.typeCode, '') + ' × ' + L.qty + '（' + t('order.' + L.mode) + '）' + (L.file ? ' 📎' : (L.hadFile ? ' ' + t('order.refile') : ''));
      items.appendChild(h('div', { cls: 'bar', 'data-line': String(i) }, [h('div', { cls: 'note', style: 'flex:1', text: (i + 1) + '. ' + what }),
        h('button', { cls: 'btn sm', text: t('order.remove'), onclick: function () { S.lines.splice(i, 1); render(); } })]));
    });
    var note = h('input', { type: 'text', id: 'fNote', value: S.note, maxlength: '300', autocomplete: 'off' });
    note.addEventListener('input', function () { S.note = note.value; });
    items.appendChild(h('div', { cls: 'fld' }, [h('label', { text: t('order.note') }), note]));
    items.appendChild(h('div', { cls: 'acts' }, [h('button', { cls: 'btn p', id: 'fSubmit', text: S.busy ? t('order.sending') : t('order.submit'), disabled: !S.lines.length || S.busy, onclick: submitOrder })]));
    w.appendChild(items);
  }
  function addDraft() {
    var D = S.draft, maxN = Number(S.init.maxLines) || 20;
    if (S.lines.length >= maxN) return toast(t('order.maxLines', { n: maxN }), true);
    if (!/^\d{1,3}$/.test(String(D.qty).trim()) || Number(D.qty) < 1) return toast(t('order.badQty'), true);
    if (D.mode !== 'STD' && (!D.look || D.look.takenByOther)) return toast(t('order.lookupFirst'), true);
    if (!D.typeCode) return toast(t('order.pickType'), true);
    if (D.mode !== 'EXISTING' && !D.od) return toast(t('order.pickOd'), true);
    S.lines.push(D); S.draft = newDraft(D.mode); render();
  }
  function payloadLines() {
    return S.lines.map(function (L) {
      var qty = String(L.qty).trim();
      if (L.mode === 'STD') return { mode: 'STD', typeCode: L.typeCode, od: L.od, qty: qty };
      var x = { mode: L.mode, moldNo: L.moldNo, typeCode: L.typeCode, qty: qty };
      if (L.mode === 'NEW' || L.mode === 'REVISE') { x.od = L.od; x.thickness = L.thickness; }
      if (L.mode === 'REVISE') { x.reviseKind = L.reviseKind; if (String(L.newMoldNo || '').trim()) x.newMoldNo = L.newMoldNo; }
      return x;
    });
  }
  //  預覽；「可能重複下單」⇒ 問他，確定的話那幾項帶 allowDup 再預覽一次（取消 ⇒ null）
  function previewUntilOk(payload) {
    return rpc('previewOrder', { payload: payload }).catch(function (e) {
      var p = (e && e.errorCode === 'DUP_OPEN' && e.errorParams) ? e.errorParams : null;
      var ns = p ? (Array.isArray(p.lines) ? p.lines : [p.line]).map(Number).filter(function (n) { return n >= 1 && !!payload.lines[n - 1]; }) : [];
      if (!ns.length) throw e;
      return new Promise(function (resolve) {
        var msg = S.lang === 'zh' && e.message ? String(e.message) : t('order.dupLines', { lines: ns.join(', ') });
        dialog(t('order.dupTitle'), h('p', { cls: 'note', style: 'white-space:pre-line', text: msg }), t('order.dupOk'), function () {
          ns.forEach(function (n) { payload.lines[n - 1].allowDup = true; });
          resolve(previewUntilOk(payload)); return true;
        }, false, function () { resolve(null); });
      });
    });
  }
  function submitOrder() {
    if (S.busy) return;
    if (!S.lines.length) return toast(t('order.needItem'), true);
    if (!fresh()) return;
    S.busy = true;
    var sb = $('fSubmit'); if (sb) { sb.disabled = true; sb.textContent = t('order.sending'); }
    //  同一次送出的代號：網路斷掉再按一次不會重複建（內容改過 ⇒ 伺服器說 REQ_CHANGED）
    if (!S.reqId) S.reqId = (Math.random().toString(36).slice(2) + Date.now().toString(36) + 'abcdefgh').substring(0, 20);
    var sent = S.lines.slice(), payload = { reqId: S.reqId, note: String(S.note || '').trim(), lines: payloadLines() };
    previewUntilOk(payload).then(function (pv) {
      if (!pv) return null;
      if (pv.duplicate) return pv;   // 這個送出代號其實已經建好了（上次網路斷掉沒看到）⇒ 直接當成功
      var autos = (pv.lines || []).filter(function (x) { return x.autoNo && !x.reused; }).map(function (x) { return x.moldNo; });
      var body = h('div', {}, [h('ol', { cls: 'pv' }, (pv.lines || []).map(function (x) {
        var nm = x.mode === 'REVISE' ? t('order.pv.revise', { prev: x.prevMoldNo, no: x.moldNo }) : moldNm(x.moldNo, x.kind);
        var est = x.estimate !== undefined ? ' · ' + (x.quotePending ? t('money.quoteLater') : t('money.estimate', { v: money(x.estimate) })) : '';
        return h('li', { text: nm + ' ' + typeName(x.typeCode, x.typeName) + ' · ' + t('order.pv.seqQty', { n: x.seq, q: x.qty }) + est });
      })), pv.estimateTotal !== undefined ? h('div', { cls: 'sub money', text: t('money.estimateTotal', { v: money(pv.estimateTotal) }) + (pv.quotePending ? t('money.quotePendingHint') : '') }) : null,
      autos.length ? h('div', { cls: 'msg', text: t('order.pv.autoNo', { nos: autos.join('、') }) }) : null]);
      return new Promise(function (resolve) {
        dialog(t('order.confirmTitle'), body, t('order.confirmOk'), function () {
          if (!fresh()) { resolve(null); return true; }   // 確認框開著很久才按、身分證明快過期 ⇒ 先換新（填的內容會存起來、回來還原）
          //  帶預覽看到的：下單日、第幾次、改圖配的號 —— 跟伺服器這次算的不一樣就不建，請他重新確認
          payload.expectDate = pv.orderDate;
          (pv.lines || []).forEach(function (x, k) { var pl = payload.lines[k]; if (!pl) return; pl.expectSeq = x.seq; if (x.mode === 'REVISE') pl.expectNo = x.moldNo; });
          resolve(rpc('createOrder', { payload: payload }, 60000)); return true;
        }, false, function () { resolve(null); });
      });
    }).then(function (r) {
      if (!r) return null;
      S.reqId = ''; S.lines = []; S.note = ''; S.draft = newDraft();
      //  剛建好的那張先放到「我的單」最上面：等一下重抓列表失敗（例如身分證明剛好過期）也看得到它、可以在那裡補附圖面
      if (r.order && r.order.orderId) S.orders = [r.order].concat((S.orders || []).filter(function (o) { return o.orderId !== r.order.orderId; }));
      flush();   // 客戶下單了 ⇒ 背景請系統送「客戶下單了」、第一站到站通知
      //  有附圖面的項目：照順序存到剛建的那幾顆模具上（一張一張傳）
      var jobs = (r.order && r.order.jobs) || [], ups = [];
      sent.forEach(function (L, i) { if (L.file && jobs[i] && jobs[i].moldKey) ups.push({ key: jobs[i].moldKey, f: L.file }); });
      var bad = 0, n = 0;
      var chain = ups.reduce(function (p, u) { return p.then(function () { n++; toast(t('order.uploading', { i: n, n: ups.length }), false, 60000); return upload(u.key, u.f, true).catch(function () { bad++; }); }); }, Promise.resolve());
      return chain.then(function () {
        var oid = (r.order && r.order.orderId) || '';
        if (bad) { untoast(); dialog(t('toast.ordered', { id: oid }), h('p', { text: t('order.uploadFailed', { n: bad }) }), t('btn.gotIt'), null, true); }   // 「正在存圖面…」那條提示先收掉
        else toast(t('toast.ordered', { id: oid }));
        S.tab = 'myOrders';
        S.busy = false;
        return loadMyOrders(true);   // 背景的：身分證明剛好過期也不重新整理（不然上面那個「N 張圖面沒存成功」會被洗掉）
      });
    }).catch(function (e) {
      toast(errText(e), true);
      if (e && e.errorCode === 'REQ_CHANGED') S.reqId = '';
    }).then(function () { S.busy = false; render(); });
  }

  /* ---------- 開頁 ---------- */
  function render() {
    var a = $('app'); if (!a || !S.me) return;
    clear(a);
    var b = $('boot'); if (b) b.style.display = 'none';
    a.appendChild(header());
    var main = h('div', { id: 'main' });
    a.appendChild(main);
    if (S.me.isCustomer) renderCustomer(main); else renderStaff(main);
  }
  function readQuery() {
    var q = null;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var st = q.get('liff.state');
    if (st) { try { var q2 = new URLSearchParams(st.charAt(0) === '?' ? st.substring(1) : st); ['op', 'view'].forEach(function (k) { if (q2.get(k)) q.set(k, q2.get(k)); }); } catch (e2) {} }
    var op = String(q.get('op') || '');
    S.focus = OP_RE.test(op) ? op : '';            // 只拿來標亮；格式不對就當沒有
    var v = String(q.get('view') || '');   // 不用 v：LINE 後台的入口網址習慣加 ?v=N 清快取，合併之後會撞名（v0.2.0 審查）
    S.view = (v === 'progress' || v === 'mine') ? v : '';
  }
  function boot() {
    takeToken();
    return rpc('init', { op: S.focus }).then(function (r) {
      S.init = r; S.me = r.me; S.skew = (typeof r.serverMs === 'number') ? r.serverMs - Date.now() : 0;
      if (!storedLang() && (r.me.lang === 'en' || r.me.lang === 'th' || r.me.lang === 'zh')) S.lang = r.me.lang;
      //  記號不清：讓它自己過 60 秒（LINE 給的還是那一張快過期的，每按一次就重新整理一次 —— 審查 LOW-2）
      var renewed = renewedRecently(), dr = takeDraft(r.me), drFile = false;
      if (r.me.isCustomer) {
        S.orders = r.orders || []; S.tab = (S.view === 'mine' || !r.me.can.order) ? 'myOrders' : 'order';
        if (dr) {
          S.lines = dr.lines.filter(function (L) { return L && typeof L === 'object'; }); S.note = String(dr.note || ''); S.draft = (dr.draft && typeof dr.draft === 'object') ? dr.draft : null;
          if (typeof dr.reqId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(dr.reqId)) S.reqId = dr.reqId;   // 跟伺服器認的格式一樣
          drFile = S.lines.some(function (L) { return L.hadFile; }) || !!(S.draft && S.draft.hadFile);
          //  分頁不跟著草稿跳：網址已經記了換新前在哪個分頁（在「我的單」按附圖面才換的，就回「我的單」；草稿在下單分頁裡等著）
        }
      }
      else {
        S.todo = r.todo;
        var f = r.todo && r.todo.focus;
        S.tab = S.view === 'progress' ? 'progress' : (S.view === 'mine' ? 'mine' : ((f && isMineWip(f)) ? 'mine' : 'ready'));
      }
      //  開頁時身分證明剩不到 15 分鐘（LINE 給的是舊的）⇒ 還沒填任何東西之前先換新（60 秒內換過就不再換）
      if (!renewed && S.exp && S.exp * 1000 - srvNow() < FRESH_OPEN_MS && renew(S.focus, true)) return;
      render();
      if (!S.me.isCustomer && S.tab === 'progress') loadProgress();   // 放在開頁換新之後：要換新就不先白載一次看板（審查第三輪 LOW-2）
      var again = renewed && !renewedAtOpen();   // 按鈕觸發的換新 ⇒ 剛剛那一下沒送出，請他再按一次
      //  草稿在下單分頁；回來停在別的分頁（例如在「我的單」按附圖面才換新的）⇒ 告訴他草稿在哪裡
      if (dr && S.me.isCustomer) toast(t(drFile ? 'toast.draftBackFile' : 'toast.draftBack') + (S.tab !== 'order' ? t('toast.draftWhere', { tab: t('tab.order') }) : '') + (again ? '\n' + t('toast.refreshed') : ''), false, 6000);
      else if (again) toast(t('toast.refreshed'), false, 4000);
    }).catch(function (e) {
      var code = e && e.errorCode;
      if (code === 'LIFF_TOKEN_EXPIRED' || code === 'LIFF_TOKEN_INVALID') return fatal(errText(e));   // 已經自動重新登入過一次還是不行 ⇒ 請他從 LINE 重開
      fatal(errText(e), !!(e && (e.net || code === 'LINE_UNAVAILABLE' || code === 'PORTAL_UNAVAILABLE' || code === 'LOCK_TIMEOUT' || code === 'UNEXPECTED')));
    });
  }
  function start() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    if (!$('toast')) document.body.appendChild(h('div', { id: 'toast' }));
    S.lang = storedLang() || 'zh';
    if (!GAS || !LIFF_ID_RE.test(String(LIFF_ID || ''))) return fatal(t('err.config'));
    if (!window.liff || typeof liff.init !== 'function') return fatal(t('err.sdk'));
    var p;
    try { p = liff.init({ liffId: LIFF_ID }); } catch (e) { return fatal(t('err.liffInit')); }
    Promise.resolve(p).then(function () {
      readQuery();
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }   // 外部瀏覽器才會走到這裡
      return boot();
    }, function () { fatal(t('err.liffInit')); }).catch(function () { fatal(t('err.liffInit')); });
  }
  start();
})();
