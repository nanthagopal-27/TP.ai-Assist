/** White + grey styling for in-page widgets (lives inside each widget's shadow root). */
export const WIDGET_CSS = `
*{box-sizing:border-box;font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",Arial,sans-serif}
.wrap{position:relative;color:#212121;font-size:13px;line-height:1.4}
/* hover toolbar: Move / Edit / Remove */
.bar{position:absolute;top:5px;right:5px;display:none;align-items:center;gap:1px;background:#2b2b2b;border-radius:7px;padding:2px;z-index:3;box-shadow:0 2px 8px rgba(0,0,0,.28)}
.wrap:hover>.bar,.wrap:focus-within>.bar{display:flex}
.wrap.small>.bar{top:auto;bottom:100%;right:0;margin-bottom:0}
.tb{all:unset;cursor:pointer;color:#fff;font:600 11px/1 "Segoe UI",Arial,sans-serif;padding:5px 7px;border-radius:5px;white-space:nowrap}
.tb:hover{background:#4d4d4d}
.tb.mv{cursor:grab}
/* shared card */
.cmp{background:#fff;border:1px solid #d9d9d9;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);padding:11px 12px;display:grid;gap:8px}
.lbl{display:block;font-weight:600;font-size:12.5px;color:#424242;margin:0 0 4px;padding-right:0}
.req{color:#8c3b3b;margin-left:2px}
.help{font-size:11px;color:#757575;margin-top:3px}
.err{font-size:11.5px;color:#8c3b3b;margin-top:3px}
.dim{font-size:12px;color:#757575}
input[type=text],input[type=email],textarea,select{display:block;width:100%;border:1px solid #cfcfcf;border-radius:8px;padding:7px 9px;font-size:13px;line-height:1.35;color:#212121;background:#fff;outline:none;max-width:none}
textarea{resize:none;min-height:34px;max-height:140px;overflow:auto}
input[type=text]:focus,input[type=email]:focus,textarea:focus,select:focus{border-color:#616161;box-shadow:0 0 0 3px rgba(97,97,97,.14)}
.invalid{border-color:#8c3b3b!important}
.field{display:block}
.radios{display:grid;gap:4px}
label.chk{display:flex;align-items:center;gap:6px;font-size:12.5px;color:#303030;cursor:pointer}
input[type=checkbox],input[type=radio]{accent-color:#424242;margin:0;width:15px;height:15px}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.row select{width:auto;max-width:150px;padding:5px 6px;font-size:12px}
.run,.link{all:unset;box-sizing:border-box;cursor:pointer;background:#424242;color:#fff;font:600 12.5px/1 "Segoe UI",Arial,sans-serif;padding:9px 14px;border-radius:8px;white-space:nowrap;text-align:center}
.run{margin-left:auto}
.run.full{margin:0;display:block;width:100%}
.run:hover,.link:hover{background:#212121}
.run[disabled]{opacity:.55;cursor:default}
.btn-cmp{display:inline-block}
.ext{opacity:.7;margin-left:5px}
.mini{all:unset;cursor:pointer;font-size:11px;color:#424242;padding:3px 8px;border-radius:5px;border:1px solid #d0d0d0;background:#fff}
.mini:hover{background:#eee}
.ibtn{all:unset;cursor:pointer;width:30px;height:30px;line-height:30px;text-align:center;border:1px solid #cfcfcf;border-radius:8px;color:#424242;font-size:15px;flex:none}
.ibtn:hover{background:#eee}
/* form */
.form-title{font-weight:700;font-size:14px;color:#212121;margin-bottom:2px}
.form .field{margin-bottom:2px}
.ok{display:flex;align-items:center;gap:8px;font-weight:600;color:#3f5a41}
.tick{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#4d6b4f;color:#fff;font-size:12px}
.sumtbl{border-collapse:collapse;width:100%}
.sumtbl td{border-top:1px solid #e6e6e6;padding:4px 4px;font-size:12.5px;vertical-align:top;word-break:break-word}
.sumtbl td:first-child{color:#616161;font-weight:600;width:38%}
/* weather */
.wx-head{display:flex;gap:6px}
.wx-now{display:flex;align-items:center;gap:12px}
.wx-icon{font-size:38px;line-height:1}
.wx-temp{font-size:32px;font-weight:300;line-height:1;color:#212121}
.wx-sum{font-size:12.5px;color:#616161;margin-top:2px}
.wx-place{font-size:11.5px;color:#757575;margin-top:-2px}
.wx-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.wx-stat,.wx-day{background:#f5f5f5;border-radius:8px;padding:6px 4px;text-align:center}
.k{font-size:10.5px;color:#757575}
.v{font-size:12.5px;font-weight:600;color:#212121}
.wx-days{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.wx-dicon{font-size:20px;margin:2px 0}
/* AI card */
.card{background:#fff;border:1px solid #d4d4d4;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden;width:100%}
.hd{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f5f5f5;border-bottom:1px solid #e0e0e0;user-select:none}
.hd.drag{cursor:move}
.brand{font-weight:800;font-size:12px;color:#212121;letter-spacing:.2px}
.brand span{color:#9e9e9e}
.hd-sub{font-size:11px;color:#757575}
.bd{padding:8px;display:grid;gap:8px}
.out{border:1px dashed #bdbdbd;border-radius:8px;padding:8px 10px;background:#fafafa;max-height:320px;overflow:auto;word-break:break-word}
.out.empty{color:#9e9e9e;font-size:12px}
.out h4{margin:0 0 4px;font-size:13px;font-weight:700}
.out p{margin:0 0 6px}
.out ul{margin:0 0 6px;padding-left:18px}
.out code{background:#eee;padding:0 3px;border-radius:3px;font-size:12px}
.out table{border-collapse:collapse;width:100%;margin:4px 0 6px}
.out td{border-top:1px solid #e6e6e6;padding:3px 4px;vertical-align:top;font-size:12.5px}
.out td:first-child{color:#616161;font-weight:600;width:34%}
.out .err{color:#8c3b3b;margin:0}
.out .dim{color:#757575;margin:0}
.note{font-size:12px;color:#4d6b4f;margin:2px 0 4px;display:flex;align-items:center;gap:6px}
.note.bad{color:#8a6d3b}
.meta{font-size:10.5px;color:#9e9e9e;margin-top:6px;display:flex;justify-content:space-between;align-items:center}
/* ID extractor widget */
.idfilterrow{display:flex;align-items:center;justify-content:flex-end;gap:6px}
.idfilter{width:auto;max-width:120px;padding:4px 6px;font-size:11.5px;border-radius:6px;border:1px solid #d0d0d0;background:#fff;color:#424242}
/* label (left, grows/truncates) and the Scan trigger (right, fixed size, never grows) are two
 * separate elements in a space-between row - widening the card only stretches the gap. */
.idrunrow{display:flex;align-items:center;justify-content:space-between;gap:10px}
.idrun-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:12.5px;font-weight:600;color:#212121;
  display:flex;align-items:center;gap:6px}
.idtag{opacity:.65;font-weight:700;flex:none}
.idscan{all:unset;box-sizing:border-box;cursor:pointer;flex:none;display:inline-flex;align-items:center;gap:5px;
  background:#2b2b2b;color:#fff;font:700 11px/1 "Segoe UI",Arial,sans-serif;padding:6px 11px;border-radius:999px;white-space:nowrap}
.idscan:hover{background:#1a1a1a}
.idscan[disabled]{cursor:default}
.idscan.loading{background:linear-gradient(90deg,#6a5cff,#8b7bff)}
.idspinner{display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid rgba(255,255,255,.4);
  border-top-color:#fff;animation:idspin .7s linear infinite;flex:none}
@keyframes idspin{to{transform:rotate(360deg)}}
/* idle empty state */
.idempty{margin-top:8px;border:1px dashed #d8d8d8;border-radius:10px;padding:22px 14px;text-align:center;background:#fafafa}
.idempty-ico{font-size:20px;opacity:.55;margin-bottom:6px}
.idempty-title{font-weight:700;font-size:13px;color:#212121}
.idempty-sub{font-size:11.5px;color:#757575;margin-top:4px;line-height:1.4}
/* scanning state */
.idprogress-wrap{margin-top:8px;display:grid;gap:8px}
.idprogress{height:4px;border-radius:999px;background:#e6e6e6;overflow:hidden}
.idprogress-fill{height:100%;width:0;background:linear-gradient(90deg,#6a5cff,#8b7bff);transition:width .25s linear}
.idprogress-sub{font-size:11px;color:#757575}
.idskeleton{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.idskel-block{height:24px;border-radius:999px;background:linear-gradient(90deg,#ececec,#f6f6f6,#ececec);background-size:200% 100%;animation:idshimmer 1.3s infinite}
@keyframes idshimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
/* results */
.idlist{margin-top:2px}
.idcount{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;font-weight:700;color:#424242;margin-bottom:6px}
.idlegend{display:flex;flex-wrap:wrap;gap:10px;font-size:10.5px;color:#616161;margin-bottom:8px}
.idlegend-item{display:inline-flex;align-items:center;gap:4px}
.idgroup{margin-top:10px}
.idgroup:first-of-type{margin-top:0}
.idgroup-head{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.4px;color:#757575;margin-bottom:5px}
.idgroup-count{background:#eee;border-radius:999px;padding:1px 7px;font-size:10px;color:#757575;font-weight:700}
.idchips{display:flex;flex-wrap:wrap;gap:6px;max-height:220px;overflow:auto}
.idchip{display:inline-flex;align-items:center;gap:5px;background:#eef3f2;color:#1f4d44;border:1px solid #cfe3de;
  border-radius:999px;padding:5px 10px;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer}
.idchip:hover{filter:brightness(.97)}
.idchip.copied{outline:2px solid #4caf50;outline-offset:1px}
.idchip-tag{opacity:.7;font-weight:500;border-left:1px solid currentColor;padding-left:6px;margin-left:1px}
.iddot{width:7px;height:7px;border-radius:50%;flex:none;background:#9e9e9e}
.iddot.sev-critical{background:#b3261e}
.iddot.sev-high{background:#c15b0f}
.iddot.sev-medium{background:#a68c1a}
.iddot.sev-low{background:#2e7d4f}
.iddot.sev-unspecified{background:#9e9e9e}
.idfoot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px;color:#9e9e9e;margin-top:8px}
/* hover card: just the important details for one id */
.idtip{background:#fff;color:#212121;border-radius:12px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.16);
  border:1px solid #ececec;border-left:4px solid #9e9e9e;font-size:12px;z-index:5;display:grid;gap:9px}
.idtip.sev-critical{border-left-color:#b3261e}
.idtip.sev-high{border-left-color:#c15b0f}
.idtip.sev-medium{border-left-color:#a68c1a}
.idtip.sev-low{border-left-color:#2e7d4f}
.idtip-arrow{position:absolute;top:-6px;left:16px;width:11px;height:11px;background:#fff;border-left:1px solid #ececec;
  border-top:1px solid #ececec;transform:rotate(45deg)}
.idtip-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.idtip-id{font-weight:700;font-size:14px}
.idtip-status{display:inline-flex;align-items:center;gap:5px;background:#ece9fb;color:#4a3fae;border-radius:999px;
  padding:3px 9px;font-size:10.5px;font-weight:700;white-space:nowrap}
.idtip-status .iddot{background:#6a5cff}
.idtip-tags{display:flex;flex-wrap:wrap;gap:6px}
.idtip-tag{display:inline-flex;align-items:center;gap:4px;background:#f2f2f2;color:#616161;border-radius:999px;
  padding:3px 8px;font-size:10.5px;font-weight:600;white-space:nowrap}
.idtip-tag.sev-critical{background:#fbe9e7;color:#8c1d18}
.idtip-tag.sev-high{background:#fdf0e3;color:#9a5b14}
.idtip-tag.sev-medium{background:#fbf6dd;color:#7a6a16}
.idtip-tag.sev-low{background:#e9f5ed;color:#2e6b45}
.idtip-tag.sev-unspecified{background:#f1f1f1;color:#616161}
.idtip-sum{margin:0;color:#424242;line-height:1.45}
.idtip-sum b{color:#212121}
.idtip-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}
.idtip-copy{all:unset;box-sizing:border-box;cursor:pointer;background:#212121;color:#fff;font:700 11px/1 "Segoe UI",Arial,sans-serif;
  padding:7px 12px;border-radius:999px;white-space:nowrap}
.idtip-copy:hover{background:#000}
.idtip-key{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:#9e9e9e;white-space:nowrap}
.idtip-key kbd{font:700 10px/1 "Segoe UI",Arial,sans-serif;border:1px solid #dcdcdc;border-radius:4px;padding:2px 5px;
  background:#f7f7f7;color:#616161}
.idchip.sev-critical{background:#fbe9e7;color:#8c1d18;border-color:#f3c3bd}
.idchip.sev-high{background:#fdf0e3;color:#9a5b14;border-color:#f3d7b3}
.idchip.sev-medium{background:#fbf6dd;color:#7a6a16;border-color:#ece0a3}
.idchip.sev-low{background:#e9f5ed;color:#2e6b45;border-color:#c3e4cf}
.idchip.sev-unspecified{background:#f1f1f1;color:#616161;border-color:#dcdcdc}
/* OCR widget */
.ocr-view{border:1px dashed #bdbdbd;border-radius:8px;background:#fafafa;min-height:84px;display:grid;place-items:center;padding:8px;overflow:auto;max-height:260px}
.ocr-empty{text-align:center;color:#757575;font-size:12px}
.ocr-ico{font-size:22px;color:#9e9e9e;margin-bottom:2px}
.ocr-img{max-width:100%;max-height:220px;border:1px solid #e0e0e0;border-radius:4px;background:#fff;display:block;margin:0 auto}
.ocr-dim{font-size:10.5px;color:#9e9e9e;text-align:center;margin-top:4px}
.ocr-outwrap{display:grid;gap:6px}
.ocr-out{width:100%;box-sizing:border-box;border:1px solid #bdbdbd;border-radius:8px;padding:8px 10px;font:12.5px/1.45 "Segoe UI",Arial,sans-serif;color:#212121;background:#fff;resize:vertical;min-height:70px}
.ghost-btn{all:unset;box-sizing:border-box;cursor:pointer;color:#212121;font:600 12.5px/1 "Segoe UI",Arial,sans-serif;padding:9px 12px;border-radius:8px;border:1px solid #bdbdbd;background:#fff;white-space:nowrap}
.ghost-btn:hover{background:#eee}
.ghost-btn[disabled]{opacity:.5;cursor:default}
/* Action (e-mail) button + dialog */
.link.act .mi{margin-right:6px;font-size:13px}
.link.act.outline{background:#fff;color:#212121;border:1.5px solid #212121}
.link.act.outline:hover{background:#f0f0f0}
.link.act.red{background:#b3261e}
.link.act.red:hover{background:#8c1d18}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.42);display:grid;place-items:center;z-index:2147483647;padding:12px}
.dlg{width:min(420px,100%);max-height:calc(100vh - 24px);overflow:auto;background:#fff;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.4);color:#212121;font-size:13px}
.dlg-head{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;padding:14px 16px;border-bottom:1px solid #e6e6e6;background:#fafafa}
.dlg-body{padding:14px 16px;display:grid;gap:12px}
.dlg-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #e6e6e6;background:#fafafa}
.mail-det summary{cursor:pointer;font-size:12px;color:#616161;font-weight:600}
.mail-pre{margin:8px 0 0;white-space:pre-wrap;word-break:break-word;background:#f5f5f5;border-radius:8px;padding:10px;font:11.5px/1.5 Consolas,monospace;max-height:200px;overflow:auto}
.mail-err{background:#f7ecec;color:#7a2f2f;border-radius:8px;padding:8px 10px;font-size:12px}
.dlg-done{text-align:center;padding:22px 16px}
.dlg-done .big{width:44px;height:44px;border-radius:50%;margin:0 auto 10px;display:grid;place-items:center;font-size:22px;color:#fff}
.dlg-done .big.ok{background:#3b7a4b}
.dlg-done .big.warn{background:#a37a1f}
.done-t{font-weight:700;font-size:15px}
.done-s{font-size:12px;color:#757575;margin-top:4px}
/* user-resizable widgets */
.rz{position:absolute;right:1px;bottom:1px;width:16px;height:16px;cursor:nwse-resize;display:none;z-index:4;touch-action:none;
  background:linear-gradient(135deg,transparent 0,transparent 52%,#757575 52%,#757575 60%,transparent 60%,transparent 72%,#757575 72%,#757575 80%,transparent 80%)}
.wrap:hover>.rz,.wrap.resizing>.rz{display:block}
.wrap.sized{height:100%}
.wrap.sized>:not(.bar):not(.rz){height:100%;box-sizing:border-box;overflow:auto}
.wrap.sized .btn-cmp{display:flex}
.wrap.sized .btn-cmp .link{flex:1;display:flex;align-items:center;justify-content:center}
.wrap.sized .card{display:flex;flex-direction:column}
.wrap.sized .card .bd{flex:1;min-height:0;overflow:auto}
.wrap.resizing{user-select:none}
`;

/** Styles for the click-to-place overlay. */
export const PICKER_CSS = `
.box{position:fixed;border:2px solid #424242;background:rgba(66,66,66,.08);border-radius:3px;pointer-events:none;display:none}
.ins{position:fixed;height:3px;background:#212121;border-radius:2px;pointer-events:none;display:none}
.lbl{position:fixed;background:#212121;color:#fff;font:600 11px/1 "Segoe UI",Arial,sans-serif;padding:4px 7px;border-radius:5px;
  pointer-events:none;display:none;white-space:nowrap}
.banner{position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#fff;border:1px solid #bdbdbd;color:#212121;
  font:600 12.5px/1 "Segoe UI",Arial,sans-serif;padding:9px 16px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.18);pointer-events:none;white-space:nowrap}
`;

/** On-page widget builder toolbar + properties card (added after WIDGET_CSS in the same shadow root). */
export const TOOLBAR_CSS = `
.tbar{display:flex;align-items:center;gap:8px;background:#1f1f1f;color:#f2f2f2;border-radius:999px;padding:5px 8px 5px 12px;
  box-shadow:0 6px 22px rgba(0,0,0,.35);max-width:calc(100vw - 16px);border:1px solid #3a3a3a}
.tbrand{display:flex;align-items:center;gap:7px;font:700 12px/1 "Segoe UI",Arial,sans-serif;white-space:nowrap;padding-right:8px;border-right:1px solid #444;cursor:grab;touch-action:none}
.tbrand.dragging{cursor:grabbing}
.tbar.min .tbrand{border-right:none;padding-right:0}
.tbar.min .chips,.tbar.min .xbtn{display:none}
.tlogo{width:20px;height:20px;display:block;border-radius:50%;background:#fff;padding:3px;box-sizing:border-box;pointer-events:none;-webkit-user-drag:none}
.dot{width:8px;height:8px;border-radius:50%;background:#e0e0e0}
.chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;min-width:0;padding:1px}
.chips::-webkit-scrollbar{display:none}
.chip{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:6px;background:#303030;color:#f2f2f2;
  font:600 12px/1 "Segoe UI",Arial,sans-serif;padding:7px 12px;border-radius:999px;white-space:nowrap;border:1px solid #454545;flex:none}
.chip:hover{background:#464646}
.chip.on{background:#fff;color:#212121;border-color:#fff}
.chip .g{font-size:12px;opacity:.85}
.xbtn{all:unset;cursor:pointer;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;color:#d0d0d0;font-size:16px;flex:none}
.xbtn:hover{background:#464646;color:#fff}
.xbtn.dark{color:#616161}
.xbtn.dark:hover{background:#eee;color:#212121}
.panel{width:372px;max-width:calc(100vw - 16px);max-height:calc(100vh - 90px);margin-top:8px;background:#fff;border:1px solid #cfcfcf;border-radius:14px;
  box-shadow:0 10px 32px rgba(0,0,0,.28);overflow:hidden;display:flex;flex-direction:column;color:#212121;font-size:13px}
.phead{display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid #e6e6e6;background:#fafafa;flex:none}
.pg{width:30px;height:30px;border-radius:8px;background:#2b2b2b;color:#fff;display:grid;place-items:center;font-size:14px;flex:none}
.pt{flex:1;font-weight:700;font-size:14px;line-height:1.2}
.ps{font-weight:400;font-size:11.5px;color:#757575;margin-top:2px}
.pbody{padding:12px;display:grid;gap:10px;overflow-y:auto;min-height:0;flex:1}
.pfoot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-top:1px solid #e6e6e6;background:#fafafa;flex:none}
.perr{margin:0 12px 10px;padding:8px 10px;border-radius:8px;background:#f7ecec;color:#7a2f2f;font-size:12px;flex:none}
.fg{display:grid;gap:4px}
.fl{font-weight:600;font-size:12px;color:#424242}
.fh{font-size:11px;color:#757575}
.sec{font-size:10.5px;font-weight:700;letter-spacing:.8px;color:#757575;text-transform:uppercase;margin-top:2px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.rowb{display:flex;gap:6px;align-items:center}
.rowb select{flex:1;width:auto}
.info{font-size:12.5px;color:#505050;background:#f5f5f5;border-radius:8px;padding:10px}
.primary{all:unset;box-sizing:border-box;cursor:pointer;background:#2b2b2b;color:#fff;font:600 12.5px/1 "Segoe UI",Arial,sans-serif;padding:10px 16px;border-radius:8px}
.primary:hover{background:#000}
.ghost{all:unset;box-sizing:border-box;cursor:pointer;color:#424242;font:600 12.5px/1 "Segoe UI",Arial,sans-serif;padding:10px 14px;border-radius:8px;border:1px solid #cfcfcf;background:#fff}
.ghost:hover{background:#eee}
.seg{display:flex;border:1px solid #cfcfcf;border-radius:8px;overflow:hidden}
.seg button{all:unset;cursor:pointer;padding:8px 12px;font:600 12px/1 "Segoe UI",Arial,sans-serif;color:#424242;background:#fff}
.seg button.on{background:#2b2b2b;color:#fff}
.mini.big{padding:7px 10px;font-size:12px;white-space:nowrap}
.flist{display:grid;gap:8px}
.fcard{border:1px solid #d9d9d9;border-radius:10px;background:#f8f8f8;padding:9px;display:grid;gap:8px}
.fchead{display:flex;align-items:center;gap:6px}
.fchead select{flex:1;width:auto}
.fcn{font-weight:700;color:#616161;font-size:12px}
.ico{all:unset;cursor:pointer;width:26px;height:26px;line-height:26px;text-align:center;border-radius:6px;color:#424242;font-size:13px;border:1px solid #d0d0d0;background:#fff;flex:none}
.ico:hover{background:#eee}
`;
