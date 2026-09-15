(function(){
  "use strict";
  if(!CB.initAppHeader()) return;
  var profile=CB.storage.getProfile();
  var classLabel=CB.util.classLabelForProfile(profile);
  var titleEl=document.getElementById('timetable-title'), subtitle=document.getElementById('timetable-subtitle');
  var body=document.getElementById('timetable-body'), empty=document.getElementById('timetable-empty');
  var crPanel=document.getElementById('timetable-cr-panel'), editBody=document.getElementById('timetable-edit-body');
  var rows=[]; var uploadedFile=null;
  var days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function subjectTone(subject){var n=0;String(subject||'').split('').forEach(function(c){n+=c.charCodeAt(0);});return 'subject-tone-'+(n%6);}
  function renderTable(entries){
    body.innerHTML='';
    if(!entries.length){empty.hidden=false;return;}
    empty.hidden=true;
    var grouped={};
    days.forEach(function(d){grouped[d]=[];});
    (entries||[]).forEach(function(e){
      var day=days.indexOf(e.day)>=0?e.day:'Other';
      if(!grouped[day]) grouped[day]=[];
      grouped[day].push(e);
    });
    var orderedDays=days.filter(function(d){return grouped[d]&&grouped[d].length;});
    orderedDays.forEach(function(day, dayIndex){
      grouped[day].sort(function(a,b){return String(a.start||'').localeCompare(String(b.start||''));});
      var col=document.createElement('section');
      col.className='timetable-day-column';
      col.style.setProperty('--day-rot', ((dayIndex%3)-1)*0.35+'deg');
      var dayShort=day.slice(0,3).toUpperCase();
      col.innerHTML='<div class="timetable-day-tab"><span>'+esc(dayShort)+'</span><strong>'+esc(day)+'</strong><i>✦</i></div><div class="timetable-day-stack"></div>';
      var stack=col.querySelector('.timetable-day-stack');
      grouped[day].forEach(function(e,i){
        var card=document.createElement('article');
        var tone=subjectTone(e.subject);
        card.className='timetable-class-card '+tone;
        card.style.setProperty('--card-rot', ((i%3)-1)*0.45+'deg');
        var startTime=String(e.start||'').slice(0,5), endTime=String(e.end||'').slice(0,5);
        card.innerHTML='<div class="timetable-class-time"><span>'+esc(startTime)+'</span><b>—</b><span>'+esc(endTime)+'</span></div>'+
          '<h3>'+esc(e.subject||'Untitled class')+'</h3>'+
          '<div class="timetable-class-meta">'+(e.faculty?'<span>♡ '+esc(e.faculty)+'</span>':'')+(e.room?'<span>⌂ '+esc(e.room)+'</span>':'')+'</div>';
        stack.appendChild(card);
      });
      body.appendChild(col);
    });
  }
  function renderEditor(){
    editBody.innerHTML='';
    rows.forEach(function(r,i){
      var tr=document.createElement('tr');
      tr.innerHTML='<td><select data-k="day"><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option></select></td><td><input type="time" data-k="start"></td><td><input type="time" data-k="end"></td><td><input data-k="subject" placeholder="Subject"></td><td><input data-k="faculty" placeholder="Optional"></td><td><input data-k="room" placeholder="Optional"></td><td><button class="timetable-delete-row" type="button" aria-label="Remove row">×</button></td>';
      ['day','start','end','subject','faculty','room'].forEach(function(k){var el=tr.querySelector('[data-k="'+k+'"]');el.value=r[k]||'';el.addEventListener('input',function(){r[k]=this.value;});el.addEventListener('change',function(){r[k]=this.value;});});
      tr.querySelector('.timetable-delete-row').addEventListener('click',function(){rows.splice(i,1);renderEditor();}); editBody.appendChild(tr);
    });
  }
  function setRows(entries){rows=(entries||[]).map(function(e){return {day:e.day||'Monday',start:e.start||'',end:e.end||'',subject:e.subject||'',faculty:e.faculty||'',room:e.room||''};});renderEditor();}
  function loadPublished(){
    CB.api.getTimetable().then(function(res){
      var t=res&&res.timetable;
      if(t){titleEl.textContent=t.title||classLabel;subtitle.textContent='Published for '+(t.audience||classLabel)+'.';document.getElementById('timetable-updated').textContent=t.updated_at?'Updated '+String(t.updated_at).slice(0,10):'AI cleaned · CR approved';renderTable(t.entries||[]);setRows(t.entries||[]);}
      else {var demo=CB.data.timetable;if(CB.util.audienceMatches(demo.audience,profile)){titleEl.textContent=demo.title;subtitle.textContent='A demo timetable for your community — ready to be replaced by your CR.';document.getElementById('timetable-updated').textContent='Demo board';renderTable(demo.entries);setRows(demo.entries);}else{renderTable([]);setRows([]);}}
    }).catch(function(){var demo=CB.data.timetable; if(CB.util.audienceMatches(demo.audience,profile)){titleEl.textContent=demo.title;document.getElementById('timetable-updated').textContent='Demo board';renderTable(demo.entries);setRows(demo.entries);}else renderTable([]);});
  }
  if(profile.role==='Class Representative'){crPanel.hidden=false;var audience=document.getElementById('timetable-audience'); audience.innerHTML='<option value="__CLASS__">My class — '+classLabel+'</option><option value="__YEAR_BRANCH__">'+profile.year+' · '+profile.branch+' · All Sections</option><option value="__BRANCH__">'+profile.branch+' · All Years</option><option value="All Students">All Students</option>';
    var input=document.getElementById('timetable-image'), aiBtn=document.getElementById('timetable-ai-btn'), status=document.getElementById('timetable-ai-status');
    input.addEventListener('change',function(){uploadedFile=this.files[0]||null;document.getElementById('timetable-file-name').textContent=uploadedFile?uploadedFile.name:'';aiBtn.disabled=!uploadedFile;});
    aiBtn.addEventListener('click',function(){if(!uploadedFile)return;aiBtn.disabled=true;status.textContent='AI is reading the timetable…';CB.api.parseTimetable(uploadedFile).then(function(res){var parsed=res&&res.parsed&&res.parsed.entries; if(parsed&&parsed.length){setRows(parsed);status.textContent=res.ai_used?'AI draft ready — review every row before publishing.':'Could not use AI; add the rows manually.';}else{setRows([]);status.textContent='No readable rows found. You can add them manually.';}aiBtn.disabled=false;}).catch(function(){status.textContent='Could not read the image. You can add rows manually.';aiBtn.disabled=false;});});
    document.getElementById('timetable-add-row').addEventListener('click',function(){rows.push({day:'Monday',start:'09:00',end:'10:00',subject:'',faculty:'',room:''});renderEditor();});
    document.getElementById('timetable-publish').addEventListener('click',function(){var clean=rows.filter(function(r){return r.subject&&r.start&&r.end;});if(!clean.length){CB.util.toast('Add at least one class row first');return;}var val=audience.value;var target=val==='__CLASS__'?classLabel:val==='__YEAR_BRANCH__'?profile.year+' · '+profile.branch+' · All Sections':val==='__BRANCH__'?profile.branch+' · All Years':val;var btn=this;btn.disabled=true;CB.api.publishTimetable({title:target,audience:target,entries:clean,source_image_name:uploadedFile?uploadedFile.name:null,status:'published'}).then(function(res){btn.disabled=false;if(res&&res.success){CB.util.toast('Timetable published to '+target+' ✦');titleEl.textContent=target;subtitle.textContent='Published for '+target+'.';renderTable(clean);}else CB.util.toast((res&&res.error)||'Could not publish timetable');});});
  }
  loadPublished();
})();
