(function(){
'use strict';
const btn=document.getElementById('mediaHealthBtn');
const output=document.getElementById('mediaHealthResult');
if(!btn||!output)return;
btn.addEventListener('click',async()=>{
 btn.disabled=true;output.textContent='正在唯讀檢查 Cloudflare D1 與 R2…';
 try{
   const response=await fetch('/studio/api/admin/media/health',{credentials:'same-origin',headers:{accept:'application/json'}});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body.error||('檢查失敗：HTTP '+response.status));
   const h=body.health||{};
   const summary='資料庫圖片紀錄 '+h.media_records+' 筆（公開 '+h.public_records+' 筆）；抽查 '+h.checked+' 筆，R2 找不到 '+h.r2_missing_in_sample+' 筆、讀取發生錯誤 '+h.r2_errors_in_sample+' 筆。';
   output.textContent=summary+(h.r2_missing_in_sample>0?' 圖片紀錄仍在，部分原圖無法從 R2 讀到；請先核對 bucket 設定和備份，避免刪除重建。':h.media_records===0?' 資料庫目前沒有圖片紀錄；請核對 production D1 綁定及既有資料庫，勿立即重建。':' 若圖片仍無法顯示，下一步應檢查公開連結、權限與瀏覽器的載入錯誤。');
 }catch(err){output.textContent='無法完成檢查：'+(err?.message||String(err))+'。請確認登入權限或後端連線。'}
 finally{btn.disabled=false}
});
})();