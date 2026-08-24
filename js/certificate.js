(function(){
  const DEFAULT_LAYOUT={
    width:1755,height:1240,
    workshopTitle:{x:878,y:155,size:28,maxWidth:980,weight:700,color:'#17325c'},
    certificateTitle:{x:878,y:275,size:42,maxWidth:1050,weight:800,color:'#17325c'},
    recipientLabel:{x:878,y:355,size:20,maxWidth:800,weight:500,color:'#333'},
    participantName:{x:878,y:435,size:44,maxWidth:1050,weight:700,color:'#102a55'},
    roleLabel:{x:878,y:515,size:18,maxWidth:700,weight:500,color:'#444'},
    participantRole:{x:878,y:560,size:28,maxWidth:700,weight:800,color:'#17325c'},
    narrative:{x:878,y:660,size:20,maxWidth:1060,lineHeight:30,weight:400,color:'#222',maxLines:3},
    signature:{x:670,y:805,w:220,h:110},
    signerName:{x:780,y:955,size:22,maxWidth:560,weight:700,color:'#17325c'},
    signerPosition:{x:780,y:995,size:18,maxWidth:560,weight:500,color:'#333'},
    qr:{x:1270,y:845,w:110,h:110},
    qrLabel:{x:1325,y:975,size:14,maxWidth:280,weight:500,color:'#555'},
    certificateNumber:{x:878,y:1090,size:14,maxWidth:800,weight:500,color:'#555'}
  };

  function fitFont(ctx,text,maxWidth,startSize,minSize=16,weight=700){
    let s=startSize;
    while(s>minSize){
      ctx.font=`${weight} ${s}px Arial`;
      if(ctx.measureText(text).width<=maxWidth) break;
      s-=2;
    }
    return s;
  }

  function drawCentered(ctx,text,cfg){
    if(!text) return;
    const size=fitFont(ctx,String(text),cfg.maxWidth,cfg.size,16,cfg.weight||400);
    ctx.font=`${cfg.weight||400} ${size}px Arial`;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillStyle=cfg.color||'#111';
    ctx.fillText(String(text),cfg.x,cfg.y);
  }

  function wrapText(ctx,text,x,y,maxWidth,lineHeight,weight,size,color='#222',maxLines=3){
    ctx.font=`${weight||400} ${size}px Arial`;
    ctx.textAlign='center';
    ctx.textBaseline='top';
    ctx.fillStyle=color;
    const words=(text||'').split(/\s+/);
    let line='',lines=[];
    for(const w of words){
      const test=line?line+' '+w:w;
      if(ctx.measureText(test).width>maxWidth && line){
        lines.push(line); line=w;
      }else line=test;
    }
    if(line) lines.push(line);
    if(lines.length>maxLines){
      lines=lines.slice(0,maxLines);
      let last=lines[maxLines-1];
      while(ctx.measureText(last+'…').width>maxWidth && last.length>0) last=last.slice(0,-1);
      lines[maxLines-1]=last.replace(/\s+\S*$/,'')+'…';
    }
    lines.forEach((ln,i)=>ctx.fillText(ln,x,y+i*lineHeight));
  }

  function formatDateId(dateStr){
    if(!dateStr) return '';
    const d=new Date(dateStr+'T00:00:00');
    if(Number.isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric'}).format(d);
  }

  async function loadImage(src){
    return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
  }

  async function renderCertificate(canvas,data){
    const custom=data.layout||{};
    const layout={...DEFAULT_LAYOUT,...custom};
    for(const k of Object.keys(DEFAULT_LAYOUT)){
      if(typeof DEFAULT_LAYOUT[k]==='object'&&!Array.isArray(DEFAULT_LAYOUT[k])) layout[k]={...DEFAULT_LAYOUT[k],...(custom[k]||{})};
    }
    canvas.width=layout.width;canvas.height=layout.height;
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    const bg=await loadImage(data.templateUrl||'assets/template_upj_blue.png');ctx.drawImage(bg,0,0,canvas.width,canvas.height);

    drawCentered(ctx,data.workshopTitle||'',layout.workshopTitle);
    drawCentered(ctx,data.certificateTitle||'SERTIFIKAT PENGHARGAAN',layout.certificateTitle);
    drawCentered(ctx,data.recipientLabel||'Diberikan Kepada',layout.recipientLabel);
    drawCentered(ctx,(data.participantName||'').toUpperCase(),layout.participantName);
    drawCentered(ctx,data.roleLabel||'Sebagai',layout.roleLabel);
    drawCentered(ctx,data.participantRole||'PESERTA',layout.participantRole);
    wrapText(ctx,data.narrative||'',layout.narrative.x,layout.narrative.y,layout.narrative.maxWidth,layout.narrative.lineHeight,layout.narrative.weight,layout.narrative.size,layout.narrative.color,layout.narrative.maxLines||3);

    if(data.signatureUrl){
      try{
        const sig=await loadImage(data.signatureUrl);
        const ratio=Math.min(layout.signature.w/sig.width,layout.signature.h/sig.height);
        const w=sig.width*ratio,h=sig.height*ratio;
        ctx.drawImage(sig,layout.signature.x+(layout.signature.w-w)/2,layout.signature.y+(layout.signature.h-h)/2,w,h);
      }catch(e){console.warn('Signature load failed',e)}
    }

    drawCentered(ctx,data.signerName||'',layout.signerName);
    drawCentered(ctx,data.signerPosition||'',layout.signerPosition);

    if(data.verifyUrl){
      const tmp=document.createElement('div');tmp.style.position='fixed';tmp.style.left='-9999px';document.body.appendChild(tmp);
      new QRCode(tmp,{text:data.verifyUrl,width:layout.qr.w,height:layout.qr.h,correctLevel:QRCode.CorrectLevel.M});
      await new Promise(r=>setTimeout(r,120));
      const qimg=tmp.querySelector('img')||tmp.querySelector('canvas');
      if(qimg){if(qimg.tagName==='IMG'){const qi=await loadImage(qimg.src);ctx.drawImage(qi,layout.qr.x,layout.qr.y,layout.qr.w,layout.qr.h)}else ctx.drawImage(qimg,layout.qr.x,layout.qr.y,layout.qr.w,layout.qr.h)}
      tmp.remove();
      drawCentered(ctx,'Scan untuk verifikasi sertifikat',layout.qrLabel);
    }

    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${layout.certificateNumber.weight||400} ${layout.certificateNumber.size}px Arial`;ctx.fillStyle=layout.certificateNumber.color||'#555';
    ctx.fillText(`No. Sertifikat: ${data.certificateNumber||'-'}`,layout.certificateNumber.x,layout.certificateNumber.y);
  }

  function pdfBlob(canvas){const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});pdf.addImage(canvas.toDataURL('image/jpeg',.96),'JPEG',0,0,297,210);return pdf.output('blob')}
  function downloadPdf(canvas,filename){const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});pdf.addImage(canvas.toDataURL('image/jpeg',.96),'JPEG',0,0,297,210);pdf.save(filename||'sertifikat.pdf')}
  window.CertificateEngine={DEFAULT_LAYOUT,renderCertificate,downloadPdf,pdfBlob,formatDateId};
})();
