// ============================================================
// MM/M2 Selector UI Hotfix v067B
// Purpose: repair D. FCN 遴選系統 card layout without touching M2/M8 engines.
// ============================================================
(function(){
  if (window.__M2_SELECTOR_UI_HOTFIX_V067B__) return;
  window.__M2_SELECTOR_UI_HOTFIX_V067B__ = true;

  function injectCss(){
    if (document.getElementById('m2-selector-ui-hotfix-v067b')) return;
    const style=document.createElement('style');
    style.id='m2-selector-ui-hotfix-v067b';
    style.textContent=`
#marketWorkspaceContent .dsel{display:grid!important;gap:14px!important;width:100%!important;max-width:100%!important;}
#marketWorkspaceContent .dsel *{box-sizing:border-box!important;}
#marketWorkspaceContent .dsel-banner{border:1px solid #dbeafe!important;background:#f8fbff!important;border-radius:16px!important;padding:14px!important;line-height:1.65!important;font-size:14px!important;}
#marketWorkspaceContent .dslot{border:1px solid #e5e7eb!important;border-radius:18px!important;padding:14px!important;background:#fff!important;box-shadow:0 2px 8px rgba(15,23,42,.04)!important;width:100%!important;max-width:100%!important;overflow:hidden!important;}
#marketWorkspaceContent .dslot-head{display:flex!important;justify-content:space-between!important;gap:12px!important;align-items:flex-start!important;margin-bottom:12px!important;}
#marketWorkspaceContent .dslot-title{font-size:17px!important;font-weight:950!important;line-height:1.35!important;}
#marketWorkspaceContent .dslot-sub{font-size:13px!important;color:#64748b!important;margin-top:4px!important;line-height:1.45!important;}
#marketWorkspaceContent .dslot-status{font-weight:950!important;color:#0f766e!important;background:#ecfdf5!important;border:1px solid #bbf7d0!important;border-radius:999px!important;padding:6px 10px!important;white-space:nowrap!important;font-size:12px!important;}
#marketWorkspaceContent .dcards{display:flex!important;flex-wrap:nowrap!important;gap:12px!important;overflow-x:auto!important;overflow-y:hidden!important;padding:4px 2px 10px!important;width:100%!important;max-width:100%!important;}
#marketWorkspaceContent .dcard{display:block!important;flex:0 0 310px!important;width:310px!important;max-width:310px!important;min-width:310px!important;border:1px solid #e5e7eb!important;border-radius:18px!important;background:#fff!important;padding:12px!important;box-shadow:0 2px 8px rgba(15,23,42,.05)!important;overflow:hidden!important;white-space:normal!important;}
#marketWorkspaceContent .dcard.selected{outline:3px solid #bbf7d0!important;border-color:#22c55e!important;}
#marketWorkspaceContent .dcard-a{border-left:6px solid #16a34a!important;}
#marketWorkspaceContent .dcard-b{border-left:6px solid #2563eb!important;}
#marketWorkspaceContent .dcard-c{border-left:6px solid #f59e0b!important;}
#marketWorkspaceContent .dcard-top{display:flex!important;justify-content:space-between!important;gap:8px!important;align-items:flex-start!important;}
#marketWorkspaceContent .dcard-title{display:flex!important;gap:6px!important;align-items:center!important;font-weight:950!important;font-size:13px!important;line-height:1.35!important;min-width:0!important;white-space:normal!important;}
#marketWorkspaceContent .dcard-title input{flex:0 0 auto!important;margin:0!important;}
#marketWorkspaceContent .dcard-amt{display:flex!important;align-items:center!important;gap:4px!important;font-size:12px!important;color:#334155!important;white-space:nowrap!important;}
#marketWorkspaceContent .dcard-amt input{width:58px!important;min-width:58px!important;border:1px solid #cbd5e1!important;border-radius:8px!important;padding:5px!important;text-align:right!important;font-weight:900!important;background:#fff!important;color:#111!important;}
#marketWorkspaceContent .chips{display:flex!important;gap:5px!important;flex-wrap:wrap!important;margin:8px 0!important;}
#marketWorkspaceContent .chip{display:inline-block!important;border-radius:999px!important;background:#f1f5f9!important;color:#334155!important;padding:3px 7px!important;font-size:11px!important;font-weight:900!important;line-height:1.25!important;white-space:nowrap!important;}
#marketWorkspaceContent .chip.good{background:#dcfce7!important;color:#166534!important;}
#marketWorkspaceContent .chip.warn{background:#fef3c7!important;color:#92400e!important;}
#marketWorkspaceContent .chip.bad{background:#fee2e2!important;color:#991b1b!important;}
#marketWorkspaceContent .dterms,#marketWorkspaceContent .dfair,#marketWorkspaceContent .dwhy{font-size:13px!important;line-height:1.55!important;color:#334155!important;margin-top:7px!important;word-break:break-word!important;white-space:normal!important;}
#marketWorkspaceContent .dterms b{font-size:16px!important;}
#marketWorkspaceContent .dfair{border-top:1px dashed #e5e7eb!important;padding-top:7px!important;}
#marketWorkspaceContent .dwhy{background:#f8fafc!important;border:1px solid #e5e7eb!important;border-radius:12px!important;padding:8px!important;}
#marketWorkspaceContent .blueprint{border:1px solid #d8dde6!important;border-radius:18px!important;background:linear-gradient(135deg,#fff,#f8fafc)!important;padding:14px!important;}
#marketWorkspaceContent .bp-grid{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:10px!important;margin-top:10px!important;}
#marketWorkspaceContent .bp-card{border:1px solid #e5e7eb!important;border-radius:14px!important;background:#fff!important;padding:10px!important;}
#marketWorkspaceContent .bp-card label{display:block!important;font-size:12px!important;color:#64748b!important;font-weight:900!important;}
#marketWorkspaceContent .bp-card b{font-size:20px!important;}
#marketWorkspaceContent .bp-list{margin-top:10px!important;display:grid!important;gap:8px!important;}
#marketWorkspaceContent .bp-row{border:1px solid #e5e7eb!important;background:#fff!important;border-radius:12px!important;padding:9px!important;font-size:13px!important;line-height:1.55!important;white-space:normal!important;}
#marketWorkspaceContent .dsel details{border:1px solid #e5e7eb!important;border-radius:16px!important;background:#fff!important;padding:12px!important;}
#marketWorkspaceContent .dsel summary{font-weight:950!important;cursor:pointer!important;}
@media(max-width:900px){#marketWorkspaceContent .bp-grid{grid-template-columns:1fr!important;}#marketWorkspaceContent .dslot-head{display:block!important;}#marketWorkspaceContent .dslot-status{display:inline-block!important;margin-top:8px!important;}#marketWorkspaceContent .dcard{flex-basis:285px!important;width:285px!important;max-width:285px!important;min-width:285px!important;}}
`;
    document.head.appendChild(style);
  }

  function repairSelector(){
    injectCss();
    const root=document.getElementById('marketWorkspaceContent');
    if(!root) return;
    root.querySelectorAll('.dcard').forEach(card=>{
      if(!card.classList.contains('dcard-ui-fixed')) card.classList.add('dcard-ui-fixed');
    });
  }

  document.addEventListener('DOMContentLoaded', repairSelector);
  document.addEventListener('click',()=>setTimeout(repairSelector,80),true);
  const mo=new MutationObserver(repairSelector);
  mo.observe(document.documentElement,{childList:true,subtree:true});
})();
