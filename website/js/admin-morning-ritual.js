// ═══════════════════════════════════════════════════════
// FIRST LIGHT — MORNING RITUAL (Chapter 03 daily post composer)
//
// The Chapter 3 covenant: RUN ≥5km, started before 6:00 AM.
// This composes the daily Instagram post the moment your run syncs:
//   ① your live selfie   ② the route you actually ran (GPS)   ③ the stats
// You add the selfie that morning and publish live (no pre-scheduling).
// Data: today's run from strava_activities (route polyline) or Apple Health
// (workouts_detail route), read via the admin-read proxy. Publishes a
// 3-card carousel to Instagram through the ig-proxy edge action.
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  var SUPA = (window.FL && FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url') || '';
  var KEY  = (window.FL && FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key') || '';
  var SYNC_URL = SUPA + '/functions/v1/firstlight-sync';
  var ADMIN_KEY = ['934c03a18ffe22cb', 'ccef763b4bf480d5', '3f0690177904ba2b', '1d9ebacd52b0eb5d'].join('');
  var IG_ACCOUNT = '17841466893616231';
  var CH3_START = '2026-07-19';
  var CUTOFF_HOUR = 6, MIN_KM = 5;
  var MONO = '"IBM Plex Mono", monospace';
  var GOLD = '#F5A623', GREEN = '#00E676', RED = '#FF5252', CYAN = '#00D4FF';

  var state = { run: null, apple: null, selfie: null, loaded: false };

  function $(id){ return document.getElementById(id); }
  function pad(n){ return (n<10?'0':'')+n; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function parseLocal(d){ if(!d) return new Date(); return new Date(String(d).replace(/[+-]\d{2}:\d{2}$/,'').replace(/Z$/,'')); }
  function ds(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function today(){ return ds(new Date()); }
  function ch3Day(dateStr){ return Math.max(1, Math.floor((new Date((dateStr||today())+'T00:00:00') - new Date(CH3_START+'T00:00:00'))/86400000)+1); }
  function fmtClock(d){ var h=d.getHours(),m=d.getMinutes(),ap=h>=12?'PM':'AM',h12=h%12||12; return h12+':'+pad(m)+' '+ap; }
  function fmtDur(sec){ sec=Math.round(sec||0); var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; return h>0?h+':'+pad(m)+':'+pad(s):m+':'+pad(s); }
  function fmtDateLong(d){ var days=['SUN','MON','TUE','WED','THU','FRI','SAT'],mo=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']; return days[d.getDay()]+' · '+pad(d.getDate())+' '+mo[d.getMonth()]+' '+d.getFullYear(); }
  function pace(meters,sec){ if(!meters||!sec) return '—'; var p=sec/(meters/1000); return Math.floor(p/60)+':'+pad(Math.round(p%60)); }

  // ── Google encoded-polyline decoder → [[lat,lng],...] ──
  function decodePolyline(str, precision){
    if(!str) return []; var idx=0,lat=0,lng=0,coords=[],shift,result,byte,factor=Math.pow(10,precision||5);
    while(idx<str.length){
      shift=0;result=0; do{ byte=str.charCodeAt(idx++)-63; result|=(byte&0x1f)<<shift; shift+=5; }while(byte>=0x20);
      lat += ((result&1)?~(result>>1):(result>>1));
      shift=0;result=0; do{ byte=str.charCodeAt(idx++)-63; result|=(byte&0x1f)<<shift; shift+=5; }while(byte>=0x20);
      lng += ((result&1)?~(result>>1):(result>>1));
      coords.push([lat/factor, lng/factor]);
    }
    return coords;
  }

  // route points from Strava polyline OR Apple workouts_detail route
  function routePoints(){
    if(state.run && state.run.summary_polyline){ var p=decodePolyline(state.run.summary_polyline); if(p.length>1) return p; }
    if(state.apple && Array.isArray(state.apple.workouts_detail)){
      for(var i=0;i<state.apple.workouts_detail.length;i++){ var w=state.apple.workouts_detail[i];
        var r=w.route||w.gps||w.points; if(Array.isArray(r)&&r.length>1){
          return r.map(function(pt){ return [ +(pt.lat!=null?pt.lat:pt.latitude), +(pt.lng!=null?pt.lng:(pt.lon!=null?pt.lon:pt.longitude)) ]; })
                  .filter(function(x){ return !isNaN(x[0])&&!isNaN(x[1]); });
        } }
    }
    return [];
  }

  // ── data ──
  function adminRead(body){
    return fetch(SYNC_URL+'?action=admin-read&admin_key='+ADMIN_KEY,{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(j){return (j&&Array.isArray(j.data))?j.data:[];}).catch(function(){return [];});
  }
  function load(){
    var td=today();
    return Promise.all([
      adminRead({table:'strava_activities',select:'id,name,type,distance,moving_time,elapsed_time,start_date_local,average_heartrate,max_heartrate,calories,total_elevation_gain,summary_polyline',order:'start_date_local:desc',limit:20}),
      adminRead({table:'health_daily',select:'date,workouts_detail',order:'date:desc',limit:3})
    ]).then(function(r){
      var runs=(r[0]||[]).filter(function(a){ return ['Run','TrailRun','VirtualRun'].indexOf(a.type)!==-1 && (a.start_date_local||'').slice(0,10)===td; });
      state.run = runs[0] || (r[0]||[]).filter(function(a){return ['Run','TrailRun','VirtualRun'].indexOf(a.type)!==-1;})[0] || null; // fallback: latest run for preview
      state.apple = (r[1]||[]).filter(function(h){return h.date===td;})[0] || (r[1]||[])[0] || null;
      state.loaded=true;
    });
  }
  window.__morningRitualIngest = function(run, apple){ state.run=run; state.apple=apple; state.loaded=true; render(); };

  function runQualifies(){
    var a=state.run; if(!a) return { ok:false, why:'No run yet' };
    if(a.distance < MIN_KM*1000) return { ok:false, why:(a.distance/1000).toFixed(2)+'km — need 5km' };
    var hr=parseLocal(a.start_date_local).getHours();
    if(hr>=CUTOFF_HOUR) return { ok:false, why:'started '+fmtClock(parseLocal(a.start_date_local))+' — need before 6 AM' };
    return { ok:true, why:'5km+ before first light' };
  }

  // ═══════════════════ CARD RENDERERS (1080×1080) ═══════════════════
  function grain(ctx,W,H){ for(var i=0;i<1500;i++){ ctx.fillStyle='rgba(255,255,255,'+(Math.random()*0.045)+')'; ctx.fillRect(Math.random()*W,Math.random()*H,1.2,1.2);} }
  function brandHeader(ctx,W,day){
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillStyle=GOLD; ctx.font='700 30px '+MONO; ctx.fillText('◆ FIRST LIGHT', 64, 60);
    ctx.textAlign='right'; ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='600 20px '+MONO;
    ctx.fillText('CHAPTER 03 · DAY '+day, W-64, 66);
    ctx.textAlign='left';
  }

  function renderSelfie(canvas){
    var W=1080,H=1080,ctx=canvas.getContext('2d'); canvas.width=W;canvas.height=H;
    var a=state.run, day=ch3Day(a?(a.start_date_local||'').slice(0,10):today());
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    if(state.selfie){
      var img=state.selfie, s=Math.max(W/img.width,H/img.height), w=img.width*s, h=img.height*s;
      ctx.drawImage(img,(W-w)/2,(H-h)/2,w,h);
      var g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'rgba(0,0,0,0.55)'); g.addColorStop(0.4,'rgba(0,0,0,0.05)'); g.addColorStop(0.72,'rgba(0,0,0,0.35)'); g.addColorStop(1,'rgba(0,0,0,0.9)');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    } else {
      ctx.fillStyle='#0A0C10'; ctx.fillRect(0,0,W,H);
      ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='600 26px '+MONO;
      ctx.fillText('◎  ADD YOUR SELFIE', W/2, H/2-16);
      ctx.font='400 16px '+MONO; ctx.fillText('taken this morning, after the run', W/2, H/2+22); ctx.textAlign='left';
    }
    brandHeader(ctx,W,day);
    // bottom block
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    ctx.fillStyle=GOLD; ctx.font='600 22px '+MONO; ctx.fillText('5K BEFORE FIRST LIGHT', 64, H-190);
    ctx.fillStyle='#fff'; ctx.font='700 150px '+MONO; ctx.fillText('DAY '+day, 60, H-70);
    ctx.textAlign='right'; ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.font='600 22px '+MONO;
    ctx.fillText(a?fmtDateLong(parseLocal(a.start_date_local)):fmtDateLong(new Date()), W-64, H-150);
    ctx.fillStyle=CYAN; ctx.fillText('firstlight.live', W-64, H-70); ctx.textAlign='left';
    if(state.selfie) grain(ctx,W,H);
  }

  function renderRoute(canvas){
    var W=1080,H=1080,ctx=canvas.getContext('2d'); canvas.width=W;canvas.height=H;
    var a=state.run, day=ch3Day(a?(a.start_date_local||'').slice(0,10):today());
    ctx.fillStyle='#07090D'; ctx.fillRect(0,0,W,H);
    // faint grid
    ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=1;
    for(var gx=0;gx<=W;gx+=60){ ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke(); }
    for(var gy=0;gy<=H;gy+=60){ ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke(); }
    brandHeader(ctx,W,day);

    var pts=routePoints();
    var boxT=180, boxB=H-240, boxL=90, boxR=W-90;
    if(pts.length>1){
      var lats=pts.map(function(p){return p[0];}), lngs=pts.map(function(p){return p[1];});
      var minLa=Math.min.apply(null,lats),maxLa=Math.max.apply(null,lats),minLo=Math.min.apply(null,lngs),maxLo=Math.max.apply(null,lngs);
      var spanLa=(maxLa-minLa)||1e-6, spanLo=(maxLo-minLo)||1e-6;
      var latCorr=Math.cos((minLa+maxLa)/2*Math.PI/180); spanLo*=latCorr;
      var bw=boxR-boxL, bh=boxB-boxT, sc=Math.min(bw/spanLo, bh/spanLa)*0.9;
      var ox=(boxL+boxR)/2, oy=(boxT+boxB)/2, cLa=(minLa+maxLa)/2, cLo=(minLo+maxLo)/2;
      function X(lo){ return ox + (lo-cLo)*latCorr*sc; }
      function Y(la){ return oy - (la-cLa)*sc; }
      // glow underlay
      ctx.lineJoin='round'; ctx.lineCap='round';
      ctx.beginPath(); pts.forEach(function(p,i){ var x=X(p[1]),y=Y(p[0]); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
      ctx.strokeStyle='rgba(245,166,35,0.25)'; ctx.lineWidth=22; ctx.shadowColor=GOLD; ctx.shadowBlur=30; ctx.stroke();
      ctx.strokeStyle=GOLD; ctx.lineWidth=7; ctx.shadowBlur=14; ctx.stroke(); ctx.shadowBlur=0;
      // start / end
      var sP=pts[0], eP=pts[pts.length-1];
      ctx.fillStyle=GREEN; ctx.beginPath(); ctx.arc(X(sP[1]),Y(sP[0]),13,0,7); ctx.fill();
      ctx.fillStyle=RED; ctx.beginPath(); ctx.arc(X(eP[1]),Y(eP[0]),13,0,7); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='700 13px '+MONO; ctx.textAlign='center';
      ctx.fillText('START', X(sP[1]), Y(sP[0])-22); ctx.fillText('FINISH', X(eP[1]), Y(eP[0])-22); ctx.textAlign='left';
    } else {
      ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,0.28)'; ctx.font='600 24px '+MONO;
      ctx.fillText('NO GPS ROUTE FOR THIS RUN', W/2, H/2);
      ctx.font='400 15px '+MONO; ctx.fillText('enable "Include Route Data" in Health Auto Export', W/2, H/2+34); ctx.textAlign='left';
    }
    // footer label
    ctx.fillStyle=GOLD; ctx.font='600 22px '+MONO; ctx.fillText('THE PATH', 64, H-150);
    ctx.fillStyle='#fff'; ctx.font='700 92px '+MONO; ctx.fillText(a?(a.distance/1000).toFixed(2)+' KM':'—', 60, H-64);
    ctx.textAlign='right'; ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='600 20px '+MONO;
    ctx.fillText('BENGALURU', W-64, H-64); ctx.textAlign='left';
  }

  function renderStats(canvas){
    var W=1080,H=1080,ctx=canvas.getContext('2d'); canvas.width=W;canvas.height=H;
    var a=state.run, day=ch3Day(a?(a.start_date_local||'').slice(0,10):today());
    ctx.fillStyle='#0A0C10'; ctx.fillRect(0,0,W,H);
    brandHeader(ctx,W,day);
    ctx.fillStyle=GOLD; ctx.font='600 24px '+MONO; ctx.fillText('RUN · BEFORE 6 AM', 64, 210);
    // hero distance
    ctx.fillStyle='#fff'; ctx.font='700 205px '+MONO; ctx.fillText(a?(a.distance/1000).toFixed(2):'—', 56, 412);
    ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='600 34px '+MONO; ctx.fillText('KILOMETRES', 66, 466);
    // stat grid
    var stats=[
      { l:'PACE', v:a?pace(a.distance,a.moving_time)+' /km':'—' },
      { l:'TIME', v:a?fmtDur(a.moving_time):'—' },
      { l:'AVG HR', v:a&&a.average_heartrate?Math.round(a.average_heartrate)+' bpm':'—' },
      { l:'CALORIES', v:a&&a.calories?Math.round(a.calories)+' kcal':'—' },
      { l:'ELEV GAIN', v:a&&a.total_elevation_gain?Math.round(a.total_elevation_gain)+' m':'—' },
      { l:'STARTED', v:a?fmtClock(parseLocal(a.start_date_local)):'—' }
    ];
    var cols=2, cw=(W-128)/cols, y0=558, rh=148;
    stats.forEach(function(s,i){ var cx=64+(i%cols)*cw, cy=y0+Math.floor(i/cols)*rh;
      ctx.strokeStyle='rgba(245,166,35,0.14)'; ctx.lineWidth=1; roundRect(ctx,cx,cy,cw-24,rh-20,12); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.font='700 46px '+MONO; ctx.textAlign='left'; ctx.fillText(s.v, cx+22, cy+70);
      ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='600 18px '+MONO; ctx.fillText(s.l, cx+22, cy+108);
    });
    // footer
    ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='600 20px '+MONO;
    ctx.fillText(a?fmtDateLong(parseLocal(a.start_date_local)):fmtDateLong(new Date()), 64, H-64);
    ctx.textAlign='right'; ctx.fillStyle=CYAN; ctx.fillText('firstlight.live', W-64, H-64); ctx.textAlign='left';
    grain(ctx,W,H);
  }
  function roundRect(ctx,x,y,w,h,r){ ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath(); }

  function drawAll(){
    if($('mrSelfie')) renderSelfie($('mrSelfie'));
    if($('mrRoute')) renderRoute($('mrRoute'));
    if($('mrStats')) renderStats($('mrStats'));
  }

  // ═══════════════════ IG CAROUSEL PUBLISH ═══════════════════
  function uploadCanvas(canvas, filename){
    return new Promise(function(resolve,reject){
      var b64=canvas.toDataURL('image/jpeg',0.95).split(',')[1], bin=atob(b64), arr=new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
      fetch(SUPA+'/storage/v1/object/media/instagram/'+filename,{method:'POST',
        headers:{'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'image/jpeg','x-upsert':'true'},body:arr})
        .then(function(r){ if(!r.ok) throw new Error('upload '+r.status); resolve(SUPA+'/storage/v1/object/public/media/instagram/'+filename); }).catch(reject);
    });
  }
  function igProxy(endpoint,params){
    return fetch(SYNC_URL+'?action=ig-proxy&admin_key='+ADMIN_KEY,{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},body:JSON.stringify({endpoint:endpoint,params:params})})
      .then(function(r){return r.json();});
  }
  function publishCarousel(status){
    var stamp=Date.now();
    var cards=[['selfie',$('mrSelfie')],['route',$('mrRoute')],['stats',$('mrStats')]];
    status.textContent='Uploading 3 cards…';
    return Promise.all(cards.map(function(c){ return uploadCanvas(c[1],'ch3_'+c[0]+'_'+stamp+'.jpg'); }))
      .then(function(urls){
        status.textContent='Creating carousel items…';
        return Promise.all(urls.map(function(u){ return igProxy(IG_ACCOUNT+'/media',{image_url:u,is_carousel_item:true}).then(function(r){ if(!r||!r.id) throw new Error('item failed: '+JSON.stringify(r)); return r.id; }); }));
      })
      .then(function(ids){
        status.textContent='Assembling carousel…';
        return igProxy(IG_ACCOUNT+'/media',{media_type:'CAROUSEL',children:ids.join(','),caption:$('mrCaption').value});
      })
      .then(function(c){ if(!c||!c.id) throw new Error('carousel failed: '+JSON.stringify(c));
        status.textContent='Publishing…';
        return new Promise(function(res){ setTimeout(function(){res(c.id);},6000); });
      })
      .then(function(cid){ return igProxy(IG_ACCOUNT+'/media_publish',{creation_id:cid}); })
      .then(function(p){ if(!p||!p.id) throw new Error('publish failed: '+JSON.stringify(p)); return p.id; });
  }

  // ═══════════════════ UI ═══════════════════
  var CSS=[
    '#p-morning-ritual .mr-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}',
    '#p-morning-ritual canvas.mr-card{width:100%;height:auto;border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:block;background:#000}',
    '#p-morning-ritual .mr-cap{font:600 9px '+MONO+';letter-spacing:2px;color:var(--text-muted);text-align:center;margin-top:6px}',
    '#p-morning-ritual .mr-btn{font:700 11px '+MONO+';letter-spacing:2px;min-height:44px;padding:12px 18px;border-radius:8px;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '#p-morning-ritual .mr-btn.pri{background:linear-gradient(135deg,#F5A623,#D48B00);color:#100c02}',
    '#p-morning-ritual .mr-btn.ghost{background:transparent;border:1px solid rgba(255,255,255,0.18);color:var(--text)}',
    '@media(max-width:720px){#p-morning-ritual .mr-cards{grid-template-columns:1fr}}'
  ].join('\n');

  function render(){
    var el=$('morningRitualRoot'); if(!el) return;
    if(!el.dataset.styled){ var s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); el.dataset.styled='1'; }
    if(!state.loaded){ el.innerHTML='<div style="padding:40px;text-align:center;font:500 12px '+MONO+';color:var(--text-muted)">Loading today\'s run…</div>'; return; }
    var q=runQualifies(), a=state.run, day=ch3Day(a?(a.start_date_local||'').slice(0,10):today());
    var cap = 'Day '+day+'. 5K before first light.\n'+(a?(a.distance/1000).toFixed(2)+' km · '+pace(a.distance,a.moving_time)+'/km':'')+'\n\nfirstlight.live\n.\n.\n#running #5amclub #firstlight #discipline #marathontraining';

    el.innerHTML=
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-bottom:8px">'+
        '<div><div class="cc-panel-title">MORNING RITUAL</div><div class="cc-panel-sub">Chapter 03 · 5K before first light — selfie · route · stats</div></div>'+
        '<div style="text-align:right"><div style="font:700 13px '+MONO+';letter-spacing:1px;color:'+(q.ok?GREEN:GOLD)+'">'+(q.ok?'✓ QUALIFIES':'○ '+esc(q.why))+'</div>'+
          '<div style="font:600 9px '+MONO+';letter-spacing:2px;color:var(--text-muted)">DAY '+day+' · RUN BEFORE 6 AM</div></div>'+
      '</div>'+
      '<div class="as-field" style="margin:14px 0"><label style="font:600 10px '+MONO+';color:var(--text-muted);letter-spacing:1px;display:block;margin-bottom:6px">YOUR SELFIE — taken this morning (stays on device until you publish)</label>'+
        '<input id="mrSelfieInput" type="file" accept="image/*"></div>'+
      '<div class="mr-cards">'+
        '<div><canvas id="mrSelfie" class="mr-card" width="1080" height="1080"></canvas><div class="mr-cap">① SELFIE</div></div>'+
        '<div><canvas id="mrRoute" class="mr-card" width="1080" height="1080"></canvas><div class="mr-cap">② THE PATH</div></div>'+
        '<div><canvas id="mrStats" class="mr-card" width="1080" height="1080"></canvas><div class="mr-cap">③ THE STATS</div></div>'+
      '</div>'+
      '<div style="margin-top:16px"><label style="font:600 10px '+MONO+';color:var(--text-muted);letter-spacing:1px;display:block;margin-bottom:6px">CAPTION</label>'+
        '<textarea id="mrCaption" rows="6" style="width:100%;padding:12px;background:var(--bg2);border:1px solid rgba(0,212,255,0.12);border-radius:8px;color:var(--text);font:500 12px '+MONO+';resize:vertical">'+esc(cap)+'</textarea></div>'+
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'+
        '<button class="mr-btn ghost" id="mrDl">⬇ DOWNLOAD ALL 3</button>'+
        '<button class="mr-btn ghost" id="mrCopy">COPY CAPTION</button>'+
        '<button class="mr-btn pri" id="mrPub" style="min-width:200px">PUBLISH CAROUSEL → IG</button>'+
        '<button class="mr-btn ghost" id="mrRefresh">↻ RELOAD RUN</button>'+
      '</div>'+
      '<div id="mrStatus" style="margin-top:12px;font:500 12px '+MONO+';color:var(--text-muted);word-break:break-word"></div>';

    drawAll();

    $('mrSelfieInput').addEventListener('change', function(){ var f=this.files&&this.files[0]; if(!f){state.selfie=null;drawAll();return;}
      var rd=new FileReader(); rd.onload=function(e){ var img=new Image(); img.onload=function(){ state.selfie=img; renderSelfie($('mrSelfie')); }; img.src=e.target.result; }; rd.readAsDataURL(f); });
    $('mrDl').addEventListener('click', function(){ [['mrSelfie','selfie'],['mrRoute','route'],['mrStats','stats']].forEach(function(c){ var l=document.createElement('a'); l.download='ch3-day'+day+'-'+c[1]+'.jpg'; l.href=$(c[0]).toDataURL('image/jpeg',0.95); l.click(); }); });
    $('mrCopy').addEventListener('click', function(){ var b=this; navigator.clipboard.writeText($('mrCaption').value).then(function(){ b.textContent='COPIED ✓'; setTimeout(function(){b.textContent='COPY CAPTION';},1500); }); });
    $('mrRefresh').addEventListener('click', function(){ state.loaded=false; render(); load().then(render); });
    $('mrPub').addEventListener('click', function(){ var btn=this, status=$('mrStatus');
      if(!state.selfie && !confirm('No selfie added — publish route + stats only?')) return;
      if(!confirm('Publish this 3-card carousel to @firstlightlive now?')) return;
      btn.disabled=true; btn.textContent='PUBLISHING…';
      publishCarousel(status).then(function(id){ status.innerHTML='<span style="color:'+GREEN+'">Published ✓ media '+id+'</span>'; btn.textContent='PUBLISHED ✓'; setTimeout(function(){btn.textContent='PUBLISH CAROUSEL → IG';btn.disabled=false;},3000); })
        .catch(function(err){ status.innerHTML='<span style="color:'+RED+'">'+esc(err.message)+'</span>'; btn.textContent='PUBLISH CAROUSEL → IG'; btn.disabled=false; }); });
  }

  function init(){ var r=$('morningRitualRoot'); if(!r) return; render(); load().then(render); }
  if(typeof window.switchPanel==='function'){ var _o=window.switchPanel; window.switchPanel=function(n){ _o(n); if(n==='morning-ritual') init(); }; }
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(function(){ if($('morningRitualRoot')) init(); }, 750); });
})();
