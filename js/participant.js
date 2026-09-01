let currentEvent=null,currentEventCode='',currentAttempt=null,currentQuestions=[],postTimer=null,postSubmitting=false;let quizPlayerId=null,quizSessionId=null,quizPoll=null,quizChannel=null,lastQuizQuestionId=null,lastViolationAt=0,quizSecurityActive=false,quizLastState=null,clientQuizTimer=null;let pollPlayerId=null,pollSessionId=null,pollTimer=null,pollChannel=null,lastPollQuestionId=null;
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function msg(t){$('message').textContent=t;$('message').classList.remove('hidden')}function hideMsg(){$('message').classList.add('hidden')}function showOnly(id){['identityCard','posttestCard','quizLobby','quizPlay','quizReveal','quizFinished','pollLobby','pollPlay','pollResults','pollFinished','resultCard'].forEach(x=>$(x).classList.toggle('hidden',x!==id))}
const MODE_LABEL={QUIZ:'QUIZ REALTIME',POSTTEST:'POST-TEST + SERTIFIKAT',ASSESSMENT:'ASSESSMENT ONLY',CERTIFICATE:'CERTIFICATE ONLY',POLL:'INTERACTIVE POLL'};
async function init(){const p=new URLSearchParams(location.search);currentEventCode=(p.get('event')||APP_CONFIG.DEFAULT_EVENT_CODE||'').trim().toUpperCase();$('eventCode').textContent=currentEventCode;const {data,error}=await sb.rpc('get_event',{p_event_code:currentEventCode});if(error||!data){msg('Event tidak ditemukan / belum aktif.');return}currentEvent=data;$('eventName').textContent=data.event_name;$('eventMeta').textContent=[data.organizer,data.location,CertificateEngine.formatDateId(data.event_date)].filter(Boolean).join(' • ');$('modeBadge').textContent=MODE_LABEL[data.event_mode]||data.event_mode;if(data.event_mode==='QUIZ'&&await resumeQuiz())return;if(data.event_mode==='POLL'&&await resumePoll())return;if(['POSTTEST','ASSESSMENT'].includes(data.event_mode)&&await resumeTest())return;prepareIdentity()}
function prepareIdentity(){showOnly('identityCard');$('phone').closest('div').classList.toggle('hidden',['QUIZ','POLL'].includes(currentEvent.event_mode));if(currentEvent.event_mode==='QUIZ'){$('identityTitle').textContent='Masuk Quiz';$('identitySubmit').textContent=currentEvent.quiz_fullscreen_required?'Masuk Quiz & Aktifkan Fullscreen':'Masuk Quiz'}else if(currentEvent.event_mode==='POLL'){$('identityTitle').textContent='Bergabung ke Interactive Poll';$('identitySubmit').textContent='Join Poll'}else if(currentEvent.event_mode==='CERTIFICATE'){$('identityTitle').textContent='Data Sertifikat';$('identitySubmit').textContent='Generate Sertifikat'}else{$('identityTitle').textContent='Identitas Peserta';$('identitySubmit').textContent=currentEvent.event_mode==='ASSESSMENT'?'Mulai Assessment':'Mulai Post-Test'}}
$('identityForm').addEventListener('submit',async e=>{e.preventDefault();hideMsg();if(!$('participantNo').value.trim()||!$('name').value.trim()||!$('institution').value.trim())return msg('NIM/NIS, Nama, dan Institusi wajib diisi.');if(currentEvent.event_mode==='QUIZ')return joinQuiz();if(currentEvent.event_mode==='POLL')return joinPoll();if(currentEvent.event_mode==='CERTIFICATE')return issueCertificateOnly();return startTest()});
function testKey(){return `test_attempt_${currentEventCode}`}function answerKey(){return `test_answers_${currentAttempt}`}function collectAnswers(){const a={};for(const q of currentQuestions){const els=document.getElementsByName(`q_${q.id}`);a[q.id]=q.question_type==='SHORT'?(els[0]?.value.trim()||''):[...els].find(e=>e.checked)?.value||''}return a}function saveTest(){if(currentAttempt){localStorage.setItem(testKey(),currentAttempt);localStorage.setItem(answerKey(),JSON.stringify(collectAnswers()))}}
async function startTest(){const {data,error}=await sb.rpc('start_test_v21',{p_event_code:currentEventCode,p_participant_no:$('participantNo').value.trim(),p_name:$('name').value.trim(),p_institution:$('institution').value.trim(),p_email:$('email').value.trim(),p_phone:$('phone').value.trim()});if(error)return msg(error.message);currentAttempt=data.attempt_id;currentQuestions=data.questions||[];saveTest();showOnly('posttestCard');$('testModeLabel').textContent=currentEvent.event_mode==='ASSESSMENT'?'ASSESSMENT':'POST-TEST';$('testTitle').textContent=currentEvent.event_mode==='ASSESSMENT'?'Assessment':'Post-Test';$('submitBtn').textContent=currentEvent.event_mode==='ASSESSMENT'?'Submit Assessment':'Submit Post-Test';renderTestQuestions();const {data:r}=await sb.rpc('resume_test',{p_attempt_id:currentAttempt});startPostTimer(r?.remaining_seconds??((data.duration_minutes||0)*60))}
async function resumeTest(){const aid=localStorage.getItem(testKey());if(!aid)return false;const {data,error}=await sb.rpc('resume_test',{p_attempt_id:aid});if(error||!data||data.status==='submitted'){localStorage.removeItem(testKey());return false}currentAttempt=aid;currentQuestions=data.questions||[];showOnly('posttestCard');$('testModeLabel').textContent=currentEvent.event_mode==='ASSESSMENT'?'ASSESSMENT':'POST-TEST';$('testTitle').textContent=currentEvent.event_mode==='ASSESSMENT'?'Assessment':'Post-Test';renderTestQuestions();try{const saved=JSON.parse(localStorage.getItem(answerKey())||'{}');for(const q of currentQuestions){const els=document.getElementsByName(`q_${q.id}`);if(q.question_type==='SHORT'){if(els[0])els[0].value=saved[q.id]||''}else[...els].forEach(x=>x.checked=x.value===saved[q.id])}}catch{}updateProgress();startPostTimer(data.remaining_seconds);msg('Test dilanjutkan. Timer tidak direset.');return true}
function renderTestQuestions(){$('questions').innerHTML='';currentQuestions.forEach((q,i)=>{const d=document.createElement('div');d.className='question';let h=`<b>${i+1}. ${esc(q.question_text)}</b><div class="small muted">${esc(q.question_type)}</div>`;if(q.question_type==='SHORT')h+=`<input name="q_${q.id}" type="text" placeholder="Jawaban singkat" autocomplete="off">`;else{let opts=[...(q.options||[])];if(currentEvent.randomize_options)opts.sort(()=>Math.random()-.5);h+=opts.map(o=>`<label class="option"><input type="radio" name="q_${q.id}" value="${esc(o.key)}"> <b>${esc(o.key)}.</b> ${esc(o.text)}</label>`).join('')}d.innerHTML=h;$('questions').appendChild(d)});updateProgress()}
function updateProgress(){let n=0;for(const q of currentQuestions){const els=document.getElementsByName(`q_${q.id}`);if(q.question_type==='SHORT'?els[0]?.value.trim():[...els].some(e=>e.checked))n++}$('progressText').textContent=`${n} / ${currentQuestions.length}`;$('progressBar').style.width=`${currentQuestions.length?100*n/currentQuestions.length:0}%`;saveTest()}$('questions').addEventListener('change',updateProgress);$('questions').addEventListener('input',updateProgress);
function startPostTimer(sec){if(postTimer)clearInterval(postTimer);if(sec==null||sec<0||currentEvent.duration_minutes<=0){$('timer').textContent='∞';return}let left=Math.max(0,sec);const tick=()=>{$('timer').textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;if(left<=0){clearInterval(postTimer);postTimer=null;submitTest(true);return}left--};tick();postTimer=setInterval(tick,1000)}
async function submitTest(auto=false){if(postSubmitting)return;if(!auto&&!confirm('Yakin ingin submit test?'))return;postSubmitting=true;if(postTimer)clearInterval(postTimer);$('submitBtn').disabled=true;$('submitBtn').textContent=auto?'Waktu habis — mengirim…':'Mengirim…';const {data,error}=await sb.rpc('submit_test',{p_attempt_id:currentAttempt,p_answers:collectAnswers()});if(error){postSubmitting=false;$('submitBtn').disabled=false;$('submitBtn').textContent='Submit Test';return msg(error.message)}localStorage.removeItem(testKey());localStorage.removeItem(answerKey());showResult(data,currentEvent.event_mode==='POSTTEST')}$('submitBtn').onclick=()=>submitTest(false);
async function issueCertificateOnly(){const b=$('identitySubmit');b.disabled=true;b.textContent='Membuat sertifikat…';const {data,error}=await sb.rpc('issue_certificate_only_v21',{p_event_code:currentEventCode,p_participant_no:$('participantNo').value.trim(),p_name:$('name').value.trim(),p_institution:$('institution').value.trim(),p_email:$('email').value.trim(),p_phone:$('phone').value.trim()});b.disabled=false;if(error){b.textContent='Generate Sertifikat';return msg(error.message)}showResultCertificate(data,false)}
async function showResult(res,withCertificate){showOnly('resultCard');$('resultTitle').textContent=currentEvent.event_mode==='ASSESSMENT'?'Assessment Selesai':'Post-Test Selesai';$('scoreWrap').classList.remove('hidden');$('score').textContent=Math.round(res.score);$('resultStatus').textContent=res.passed?'LULUS':'SELESAI';$('resultStatus').className=res.passed?'ok':'muted';$('correctInfo').textContent=`Benar ${res.correct_count} dari ${res.total_questions}`;$('certificateWrap').classList.toggle('hidden',!withCertificate||!res.certificate_number);if(withCertificate&&res.certificate_number)await renderCertificateResult(res)}
async function showResultCertificate(res,showScore){showOnly('resultCard');$('resultTitle').textContent='Sertifikat Berhasil Dibuat';$('scoreWrap').classList.add('hidden');$('certificateWrap').classList.remove('hidden');await renderCertificateResult(res)}
function fillNarrative(t,res){return String(t||'').replaceAll('{PARTICIPANT_NO}',res.participant_no||'').replaceAll('{NAME}',res.participant_name||'').replaceAll('{INSTITUTION}',res.institution||'').replaceAll('{WORKSHOP}',res.workshop_title||'').replaceAll('{ORGANIZER}',res.organizer||'').replaceAll('{LOCATION}',res.location||'').replaceAll('{DATE}',CertificateEngine.formatDateId(res.event_date)).replaceAll('{CERTIFICATE_NO}',res.certificate_number||'')}
async function renderCertificateResult(res){const verify=new URL('verify.html',location.href);verify.searchParams.set('code',res.verification_code);const d={templateUrl:res.certificate_template_url||'assets/template_upj_blue.png',participantName:res.participant_name,workshopTitle:res.workshop_title,certificateTitle:res.certificate_title,recipientLabel:res.recipient_label,roleLabel:'Sebagai',participantRole:res.participant_role,narrative:fillNarrative(res.certificate_narrative,res),signerName:res.signer_name,signerPosition:res.signer_position,signatureUrl:res.signature_url,certificateNumber:res.certificate_number,verifyUrl:verify.href,layout:res.certificate_layout||undefined};await CertificateEngine.renderCertificate($('certificateCanvas'),d);$('downloadBtn').onclick=()=>CertificateEngine.downloadPdf($('certificateCanvas'),`${res.certificate_number}-${res.participant_name}.pdf`)}
function quizKey(){return `quiz_player_${currentEventCode}`}async function requestFullscreen(){if(!currentEvent.quiz_fullscreen_required)return true;if(document.fullscreenElement)return true;try{await document.documentElement.requestFullscreen();return true}catch{msg('Fullscreen tidak dapat diaktifkan. Quiz tetap berjalan; keluar fokus dapat dicatat.');return false}}
async function joinQuiz(){await requestFullscreen();const {data,error}=await sb.rpc('quiz_join_v21',{p_event_code:currentEventCode,p_participant_no:$('participantNo').value.trim(),p_name:$('name').value.trim(),p_institution:$('institution').value.trim(),p_email:$('email').value.trim()});if(error)return msg(error.message);quizPlayerId=data.player_id;quizSessionId=data.session_id;localStorage.setItem(quizKey(),JSON.stringify({player_id:quizPlayerId,session_id:quizSessionId}));$('quizPlayerName').textContent=$('name').value.trim();activateQuizSecurity();subscribeQuiz();startQuizPolling();refreshQuizState()}
async function resumeQuiz(){let s;try{s=JSON.parse(localStorage.getItem(quizKey())||'null')}catch{}if(!s?.player_id)return false;const {data,error}=await sb.rpc('quiz_get_player_state_v21',{p_player_id:s.player_id});if(error||!data||['finished','kicked'].includes(data.player_status)){localStorage.removeItem(quizKey());return false}quizPlayerId=s.player_id;quizSessionId=s.session_id;$('quizPlayerName').textContent=data.player_name||'';activateQuizSecurity();subscribeQuiz();startQuizPolling();renderQuizState(data);return true}
async function subscribeQuiz(){if(quizChannel)await sb.removeChannel(quizChannel);quizChannel=sb.channel('player-'+quizSessionId).on('postgres_changes',{event:'*',schema:'public',table:'quiz_sessions',filter:`id=eq.${quizSessionId}`},refreshQuizState).on('postgres_changes',{event:'*',schema:'public',table:'quiz_players',filter:`id=eq.${quizPlayerId}`},refreshQuizState).subscribe()}function startQuizPolling(){if(quizPoll)clearInterval(quizPoll);quizPoll=setInterval(refreshQuizState,1200)}async function refreshQuizState(){if(!quizPlayerId)return;const {data,error}=await sb.rpc('quiz_get_player_state_v21',{p_player_id:quizPlayerId});if(error||!data)return;quizLastState=data;renderQuizState(data)}
function renderQuizState(s){
  $('quizLobbyCount').textContent=s.player_count||0;
  $('quizScore').textContent=s.score||0;

  if(s.player_status==='kicked'){
    showOnly('quizFinished');
    $('finalRank').textContent='KICKED';
    $('finalScore').textContent='Dikeluarkan karena pelanggaran';
    return;
  }

  if(s.status==='lobby'){
    showOnly('quizLobby');
    return;
  }

  if(s.status==='question'){
    showOnly('quizPlay');
    const no=Number(s.current_question_no)||1;
    const total=Number(s.total_questions)||1;
    $('quizQuestionNo').textContent=`${no}/${total}`;
    setProgressWidth('quizQuestionProgress',no,total);

    const qt=s.question?.question_type||'PG';
    if($('quizQuestionType'))$('quizQuestionType').textContent=qt==='SHORT'?'Jawaban Singkat':qt==='TF'?'Benar / Salah':'Pilihan Ganda';
    if($('quizInstruction'))$('quizInstruction').textContent=QUIZ_HELP[qt]||'Silakan jawab pertanyaan.';
    $('quizQuestionText').textContent=s.question?.question_text||'';

    if(lastQuizQuestionId!==s.question?.id){
      lastQuizQuestionId=s.question?.id;
      renderQuizAnswerControl(s.question,s.has_answered);
    }else if(s.has_answered){
      lockQuizAnswer();
    }
    startClientQuizClock(s.question_ends_at);
    return;
  }

  if(clientQuizTimer)clearInterval(clientQuizTimer);

  if(s.status==='reveal'){
    showOnly('quizReveal');
    const correct=s.last_answer_correct===true;
    $('quizRevealIcon').textContent=correct?'✓':'✕';
    $('quizRevealTitle').textContent=s.has_answered?(correct?'Benar!':'Belum tepat'):'Waktu habis';
    $('quizPoints').textContent=`+${s.last_points||0}`;
    $('quizRevealScore').textContent=s.score||0;
    $('quizRank').textContent=s.rank?`#${s.rank}`:'-';
    $('quizMiniLeaderboard').innerHTML=(s.leaderboard||[]).slice(0,5).map((p,i)=>`<li><span>#${i+1} ${esc(p.name)}</span><b>${p.score}</b></li>`).join('');
    return;
  }

  if(s.status==='finished'){
    showOnly('quizFinished');
    $('finalRank').textContent=s.rank?`#${s.rank}`:'#-';
    $('finalScore').textContent=`${s.score||0} poin`;
    $('finalLeaderboard').innerHTML=(s.leaderboard||[]).slice(0,10).map((p,i)=>`<li><span>#${i+1} ${esc(p.name)}</span><b>${p.score}</b></li>`).join('');
    localStorage.removeItem(quizKey());
    deactivateQuizSecurity();
    if(quizPoll)clearInterval(quizPoll);
  }
}
function renderQuizAnswerControl(q,answered){
  $('quizAnswered').classList.toggle('hidden',!answered);

  if(q?.question_type==='SHORT'){
    $('quizOptions').innerHTML=`
      <div class="quiz-short-wrap">
        <label>Jawaban singkat</label>
        <input id="quizShortInput" class="quiz-short-input" type="text" autocomplete="off"
               placeholder="Ketik jawaban Anda…" ${answered?'disabled':''}>
        <button id="quizShortSubmit" class="quiz-short-submit" ${answered?'disabled':''}>Kirim Jawaban</button>
      </div>`;
    const inp=$('quizShortInput'),btn=$('quizShortSubmit');
    if(!answered){
      btn.disabled=true;
      inp.addEventListener('input',()=>btn.disabled=!inp.value.trim());
      btn.onclick=()=>{
        const v=inp.value.trim();
        if(!v)return msg('Jawaban belum diisi.');
        submitQuizAnswer(q.id,v);
      };
      inp.addEventListener('keydown',e=>{
        if(e.key==='Enter'){e.preventDefault();if(!btn.disabled)btn.click()}
      });
    }
    return;
  }

  let opts=[...(q?.options||[])];
  if(currentEvent.randomize_options)opts.sort(()=>Math.random()-.5);

  $('quizOptions').innerHTML=opts.map(o=>`
    <button class="quiz-option-btn" data-answer="${esc(o.key)}" ${answered?'disabled':''}>
      <b>${esc(o.key)}.</b>&nbsp; ${esc(o.text)}
    </button>`).join('');

  $('quizOptions').querySelectorAll('button').forEach(
    b=>b.onclick=()=>submitQuizAnswer(q.id,b.dataset.answer)
  );
}
function lockQuizAnswer(){$('quizAnswered').classList.remove('hidden');$('quizOptions').querySelectorAll('button,input').forEach(x=>x.disabled=true)}async function submitQuizAnswer(qid,ans){lockQuizAnswer();const {error}=await sb.rpc('quiz_submit_answer',{p_player_id:quizPlayerId,p_question_id:qid,p_answer:ans});if(error){msg(error.message);return}refreshQuizState()}
function startClientQuizClock(endIso){if(clientQuizTimer)clearInterval(clientQuizTimer);const end=new Date(endIso).getTime();const tick=()=>{const ms=Math.max(0,end-Date.now());$('quizClock').textContent=Math.ceil(ms/1000);if(ms<=0){clearInterval(clientQuizTimer);clientQuizTimer=null}};tick();clientQuizTimer=setInterval(tick,200)}
function activateQuizSecurity(){if(!currentEvent.quiz_security_enabled)return;quizSecurityActive=true;if(currentEvent.quiz_block_selection)document.body.classList.add('quiz-secure');document.addEventListener('copy',blockClipboard,true);document.addEventListener('cut',blockClipboard,true);document.addEventListener('paste',blockClipboard,true);document.addEventListener('contextmenu',blockContext,true);document.addEventListener('visibilitychange',onVisibility,true);document.addEventListener('fullscreenchange',onFullscreen,true)}function deactivateQuizSecurity(){quizSecurityActive=false;document.body.classList.remove('quiz-secure');document.removeEventListener('copy',blockClipboard,true);document.removeEventListener('cut',blockClipboard,true);document.removeEventListener('paste',blockClipboard,true);document.removeEventListener('contextmenu',blockContext,true);document.removeEventListener('visibilitychange',onVisibility,true);document.removeEventListener('fullscreenchange',onFullscreen,true)}function isShortInputTarget(t){return t?.id==='quizShortInput'}function blockClipboard(e){if(quizSecurityActive&&currentEvent.quiz_block_clipboard){e.preventDefault()}}function blockContext(e){if(quizSecurityActive&&currentEvent.quiz_block_right_click)e.preventDefault()}function onVisibility(){if(quizSecurityActive&&currentEvent.quiz_detect_tab_switch&&document.hidden)reportViolation('TAB_OR_APP_SWITCH')}function onFullscreen(){if(quizSecurityActive&&currentEvent.quiz_fullscreen_required&&!document.fullscreenElement)reportViolation('FULLSCREEN_EXIT')}async function reportViolation(type){const now=Date.now();if(now-lastViolationAt<1800)return;lastViolationAt=now;const {data,error}=await sb.rpc('quiz_report_violation',{p_player_id:quizPlayerId,p_violation_type:type,p_details:{url:location.href}});if(error)return;$('securityText').textContent=`Pelanggaran ${data.violations}/${data.max_violations}: ${type}${data.action_taken?` — ${data.action_taken}`:''}`;$('securityWarning').classList.remove('hidden');setTimeout(()=>$('securityWarning').classList.add('hidden'),4500);if(['KICK','AUTO_FINISH'].includes(data.action_taken))refreshQuizState();else if(currentEvent.quiz_fullscreen_required&&!document.fullscreenElement)setTimeout(requestFullscreen,250)}

// INTERACTIVE POLL / MENTIMETER MODE V2.2
const POLL_TYPE_LABEL={MCQ:'Multiple Choice',WORD_CLOUD:'Word Cloud',SCALE:'Rating / Scale',OPEN_TEXT:'Open Response'};
const POLL_HELP={
  MCQ:'Pilih satu opsi yang paling sesuai, lalu respons akan langsung dikirim.',
  WORD_CLOUD:'Ketik satu kata atau frasa singkat, lalu tekan Kirim Respons.',
  SCALE:'Pilih nilai yang paling sesuai dengan pendapat Anda.',
  OPEN_TEXT:'Tulis respons singkat dan jelas, lalu tekan Kirim Respons.'
};
const QUIZ_HELP={
  PG:'Pilih satu jawaban. Setelah dipilih, jawaban langsung terkunci.',
  TF:'Pilih satu jawaban. Setelah dipilih, jawaban langsung terkunci.',
  SHORT:'Ketik jawaban singkat lalu tekan Kirim Jawaban.'
};
function setProgressWidth(id,no,total){
  const el=$(id);if(!el)return;
  const pct=total?Math.max(0,Math.min(100,(Number(no)||0)*100/Number(total))):0;
  el.style.width=`${pct}%`;
}
function pollKey(){return `poll_player_${currentEventCode}`}
async function joinPoll(){const {data,error}=await sb.rpc('poll_join_v22',{p_event_code:currentEventCode,p_participant_no:$('participantNo').value.trim(),p_name:$('name').value.trim(),p_institution:$('institution').value.trim(),p_email:$('email').value.trim()});if(error)return msg(error.message);pollPlayerId=data.player_id;pollSessionId=data.session_id;localStorage.setItem(pollKey(),JSON.stringify({player_id:pollPlayerId,session_id:pollSessionId}));$('pollParticipantName').textContent=$('name').value.trim();subscribePoll();startPollPolling();refreshPollState()}
async function resumePoll(){let st;try{st=JSON.parse(localStorage.getItem(pollKey())||'null')}catch{}if(!st?.player_id)return false;const {data,error}=await sb.rpc('poll_get_player_state_v22',{p_player_id:st.player_id});if(error||!data||data.status==='finished'){localStorage.removeItem(pollKey());return false}pollPlayerId=st.player_id;pollSessionId=st.session_id;$('pollParticipantName').textContent=data.player_name||'';subscribePoll();startPollPolling();renderPollState(data);return true}
async function subscribePoll(){if(pollChannel)await sb.removeChannel(pollChannel);if(!pollSessionId)return;pollChannel=sb.channel('poll-player-'+pollSessionId).on('postgres_changes',{event:'*',schema:'public',table:'poll_sessions',filter:`id=eq.${pollSessionId}`},refreshPollState).on('postgres_changes',{event:'*',schema:'public',table:'poll_responses',filter:`participant_id=eq.${pollPlayerId}`},refreshPollState).subscribe()}
function startPollPolling(){if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(refreshPollState,1300)}
async function refreshPollState(){if(!pollPlayerId)return;const {data,error}=await sb.rpc('poll_get_player_state_v22',{p_player_id:pollPlayerId});if(error||!data)return;renderPollState(data)}
function renderPollState(s){
  $('pollLobbyCount').textContent=s.player_count||0;

  if(s.status==='lobby'){
    showOnly('pollLobby');
    return;
  }

  if(s.status==='question'){
    showOnly('pollPlay');
    const no=Number(s.current_question_no)||1;
    const total=Number(s.total_questions)||1;
    $('pollQuestionNo').textContent=`${no}/${total}`;
    setProgressWidth('pollQuestionProgress',no,total);

    const qt=s.question?.question_type||'MCQ';
    $('pollTypeBadge').textContent=POLL_TYPE_LABEL[qt]||'POLL';
    if($('pollInstruction'))$('pollInstruction').textContent=POLL_HELP[qt]||'Silakan berikan respons Anda.';
    $('pollQuestionText').textContent=s.question?.question_text||'';

    if(lastPollQuestionId!==s.question?.id){
      lastPollQuestionId=s.question?.id;
      renderPollAnswer(s.question,s.has_responded);
    }else if(s.has_responded){
      lockPollAnswer();
    }
    return;
  }

  if(s.status==='results'){
    showOnly('pollResults');
    $('pollResultQuestion').textContent=s.question?.question_text||'Hasil';
    renderPollParticipantResults(s);
    return;
  }

  if(s.status==='finished'){
    showOnly('pollFinished');
    localStorage.removeItem(pollKey());
    if(pollTimer)clearInterval(pollTimer);
  }
}
function renderPollAnswer(q,answered){
  $('pollAnswered').classList.toggle('hidden',!answered);
  const area=$('pollAnswerArea');

  if(q.question_type==='MCQ'){
    area.innerHTML=`<div class="poll-choice-grid">${
      (q.options||[]).map(o=>`
        <button class="poll-choice" data-answer="${esc(o)}" ${answered?'disabled':''}>${esc(o)}</button>
      `).join('')
    }</div>`;
    area.querySelectorAll('button').forEach(
      b=>b.onclick=()=>submitPollResponse(q.id,b.dataset.answer,null)
    );
    return;
  }

  if(q.question_type==='SCALE'){
    const nums=[];
    for(let i=q.scale_min;i<=q.scale_max;i++)nums.push(i);
    area.innerHTML=`<div class="poll-scale">${
      nums.map(n=>`<button data-value="${n}" ${answered?'disabled':''}>${n}</button>`).join('')
    }</div>`;
    area.querySelectorAll('button').forEach(
      b=>b.onclick=()=>submitPollResponse(q.id,String(b.dataset.value),Number(b.dataset.value))
    );
    return;
  }

  if(q.question_type==='WORD_CLOUD'){
    area.innerHTML=`
      <div class="poll-text-box">
        <label>Satu kata / frasa singkat</label>
        <input id="pollTextInput" type="text" maxlength="80" autocomplete="off"
               placeholder="Contoh: semangat" ${answered?'disabled':''}>
        <button id="pollTextSubmit" class="poll-submit" ${answered?'disabled':''}>Kirim Respons</button>
      </div>`;
    if(!answered){
      const inp=$('pollTextInput'),btn=$('pollTextSubmit');
      btn.disabled=true;
      inp.addEventListener('input',()=>btn.disabled=!inp.value.trim());
      btn.onclick=()=>{
        const v=inp.value.trim();
        if(!v)return msg('Respons belum diisi.');
        submitPollResponse(q.id,v,null);
      };
      inp.onkeydown=e=>{
        if(e.key==='Enter'){e.preventDefault();if(!btn.disabled)btn.click()}
      };
    }
    return;
  }

  area.innerHTML=`
    <div class="poll-text-box">
      <label>Tulis respons Anda</label>
      <textarea id="pollOpenInput" maxlength="500"
                placeholder="Tulis respons singkat dan jelas…" ${answered?'disabled':''}></textarea>
      <button id="pollOpenSubmit" class="poll-submit" ${answered?'disabled':''}>Kirim Respons</button>
    </div>`;
  if(!answered){
    const inp=$('pollOpenInput'),btn=$('pollOpenSubmit');
    btn.disabled=true;
    inp.addEventListener('input',()=>btn.disabled=!inp.value.trim());
    btn.onclick=()=>{
      const v=inp.value.trim();
      if(!v)return msg('Respons belum diisi.');
      submitPollResponse(q.id,v,null);
    };
  }
}
function lockPollAnswer(){$('pollAnswered').classList.remove('hidden');$('pollAnswerArea').querySelectorAll('button,input,textarea').forEach(x=>x.disabled=true)}
async function submitPollResponse(qid,text,numeric){lockPollAnswer();const {error}=await sb.rpc('poll_submit_response_v22',{p_player_id:pollPlayerId,p_question_id:qid,p_response_text:text,p_response_numeric:numeric});if(error){msg(error.message);return}refreshPollState()}
function renderPollParticipantResults(s){const target=$('pollParticipantResults'),r=s.results||{},q=s.question||{};if(q.question_type==='MCQ'){const total=Math.max(1,s.response_count||0);target.innerHTML=Object.entries(r.distribution||{}).map(([label,count])=>`<div class="poll-bar"><b>${esc(label)}</b><div class="poll-bar-track"><div class="poll-bar-fill" style="width:${Math.round(count*100/total)}%"></div></div><span>${count}</span></div>`).join('');return}if(q.question_type==='SCALE'){target.innerHTML=`<div class="poll-scale-summary"><span>Rata-rata</span><b>${Number(r.average||0).toFixed(2)}</b><small>${r.count||0} respons</small></div>`;return}if(q.question_type==='WORD_CLOUD'){const words=r.words||[],max=Math.max(1,...words.map(x=>Number(x.count)||1));target.innerHTML=`<div class="poll-word-cloud">${words.map(x=>`<span class="poll-word" style="font-size:${16+Math.round(32*(x.count/max))}px">${esc(x.word)}</span>`).join('')}</div>`;return}target.innerHTML=`<div class="poll-response-list">${(r.responses||[]).map(x=>`<div class="poll-response-card">${esc(x)}</div>`).join('')}</div>`}

init();

