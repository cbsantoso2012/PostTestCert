(function(){
  const DEFAULT_LAYOUT={
    width:1755,height:1240,
    workshopTitle:{x:878,y:205,size:38,maxWidth:1100,weight:700},
    certificateTitle:{x:878,y:350,size:54,maxWidth:1150,weight:800},
    recipientLabel:{x:878,y:435,size:24,maxWidth:900,weight:500},
    participantName:{x:878,y:520,size:50,maxWidth:1250,weight:800},
    roleLabel:{x:878,y:620,size:22,maxWidth:900,weight:500},
    participantRole:{x:878,y:670,size:34,maxWidth:900,weight:800},
    narrative:{x:878,y:800,size:24,maxWidth:1250,lineHeight:34,weight:400},
    signerName:{x:878,y:1040,size:24,maxWidth:700,weight:700},
    signerPosition:{x:878,y:1080,size:20,maxWidth:700,weight:400},
    signature:{x:760,y:890,w:240,h:120},
    certificateNumber:{x:235,y:1095,size:15,maxWidth:460,weight:500},
    qr:{x:1330,y:930,w:125,h:125}
  };
  function fitFont(ctx,text,maxWidth,startSize,minSize=18,weight=700){let s=startSize;while(s>minSize){ctx.font=`${weight} ${s}px Arial`;if(ctx.measureText(text).width<=maxWidth)break;s-=2;}return s}
  function drawCentered(ctx,text,cfg){const size=fitFont(ctx,text,cfg.maxWidth,cfg.size,16,cfg.weight||400);ctx.font=`${cfg.weight||400} ${size}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#111';ctx.fillText(text,cfg.x,cfg.y)}
  function wrapText(ctx,text,x,y,maxWidth,lineHeight,weight,size){ctx.font=`${weight||400} ${size}px Arial`;ctx.textAlign='center';ctx.textBaseline='top';const words=(text||'').split(/\s+/);let line='',lines=[];for(const w of words){const test=line?line+' '+w:w;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w}else line=test}if(line)lines.push(line);lines.forEach((ln,i)=>ctx.fillText(ln,x,y+i*lineHeight));}
  async function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});}
  async function renderCertificate(canvas,data){
    const custom=data.layout||{};const layout={...DEFAULT_LAYOUT,...custom};for(const k of Object.keys(DEFAULT_LAYOUT)){if(typeof DEFAULT_LAYOUT[k]==='object'&&!Array.isArray(DEFAULT_LAYOUT[k]))layout[k]={...DEFAULT_LAYOUT[k],...(custom[k]||{})}}canvas.width=layout.width;canvas.height=layout.height;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    const bg=await loadImage(data.templateUrl||'assets/template_upj_blue.png');ctx.drawImage(bg,0,0,canvas.width,canvas.height);
    drawCentered(ctx,data.workshopTitle||'',layout.workshopTitle);drawCentered(ctx,data.certificateTitle||'SERTIFIKAT',layout.certificateTitle);drawCentered(ctx,data.recipientLabel||'Diberikan Kepada',layout.recipientLabel);drawCentered(ctx,(data.participantName||'').toUpperCase(),layout.participantName);drawCentered(ctx,data.roleLabel||'Sebagai',layout.roleLabel);drawCentered(ctx,data.participantRole||'PESERTA',layout.participantRole);
    wrapText(ctx,data.narrative||'',layout.narrative.x,layout.narrative.y,layout.narrative.maxWidth,layout.narrative.lineHeight,layout.narrative.weight,layout.narrative.size);
    if(data.signatureUrl){try{const sig=await loadImage(data.signatureUrl);ctx.drawImage(sig,layout.signature.x,layout.signature.y,layout.signature.w,layout.signature.h)}catch(e){console.warn(e)}}
    drawCentered(ctx,data.signerName||'',layout.signerName);drawCentered(ctx,data.signerPosition||'',layout.signerPosition);
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`${layout.certificateNumber.weight||400} ${layout.certificateNumber.size}px Arial`;ctx.fillText(`No. ${data.certificateNumber||'-'}`,layout.certificateNumber.x,layout.certificateNumber.y);
    if(data.verifyUrl){const tmp=document.createElement('div');tmp.style.position='fixed';tmp.style.left='-9999px';document.body.appendChild(tmp);new QRCode(tmp,{text:data.verifyUrl,width:layout.qr.w,height:layout.qr.h,correctLevel:QRCode.CorrectLevel.M});await new Promise(r=>setTimeout(r,100));const qimg=tmp.querySelector('img')||tmp.querySelector('canvas');if(qimg){if(qimg.tagName==='IMG'){const qi=await loadImage(qimg.src);ctx.drawImage(qi,layout.qr.x,layout.qr.y,layout.qr.w,layout.qr.h)}else ctx.drawImage(qimg,layout.qr.x,layout.qr.y,layout.qr.w,layout.qr.h)}tmp.remove();}
  }
  function downloadPdf(canvas,filename){const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});pdf.addImage(canvas.toDataURL('image/jpeg',.95),'JPEG',0,0,297,210);pdf.save(filename||'sertifikat.pdf')}
  window.CertificateEngine={DEFAULT_LAYOUT,renderCertificate,downloadPdf};
})();
