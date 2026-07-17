// ═══════════════════════════════════════════════════════
// FIRST LIGHT — MISSION DECK  (private "how am I doing" review)
//
// A flight-readiness board. One question, answered at a glance:
// "Is it safe to push today?" Built on real endurance science —
//   SLEEP (consistency-weighted) · RECOVERY (HRV + resting-HR trend)
//   · LOAD (acute:chronic workload ratio / ACWR).
// A composite READINESS score + a worst-of-three master light
// (LAUNCH READY / HOLD / SCRUB). Calm by design: rest is the
// green-light action, misses are "scrubs" (streak never resets),
// the stake reads as a contribution — no failure banners, no anxiety.
//
// Reads via the admin-read edge proxy (service role) → RLS-proof.
// Panel: p-review (#reviewRoot). Vanilla JS + canvas, zero deps.
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  var SUPA = (window.FL && FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url') || '';
  var KEY  = (window.FL && FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key') || '';
  var SYNC_URL = SUPA + '/functions/v1/firstlight-sync';
  var ADMIN_KEY = ['934c03a18ffe22cb', 'ccef763b4bf480d5', '3f0690177904ba2b', '1d9ebacd52b0eb5d'].join('');
  var STREAK_START = (window.FL && FL.STREAK_START) || '2026-06-20';
  var STAKE = 1500;
  var HR_MAX = 185; // default HRmax for zone-weighted load (no DOB on file)

  var COL = { bg:'#0A0C10', card:'#0E1117', sleep:'#70AEFF', recov:'#00E5A0', load:'#F5A623',
              cyan:'#00D4FF', alert:'#FF4444', txt:'#F4F4F2', t2:'rgba(244,244,242,0.55)', t3:'rgba(244,244,242,0.32)' };
  var STATUS_COL = { GO:'#00E5A0', CAUTION:'#F5A623', NOGO:'#FF4444' };
  var MONO = '"IBM Plex Mono", monospace';

  var RULE = {
    walk:{types:['Walk','Hike'],minM:5000}, run:{types:['Run','TrailRun','VirtualRun'],minM:5000},
    cycle:{types:['Ride','MountainBikeRide','GravelRide','EBikeRide','VirtualRide','EMountainBikeRide'],minM:10000},
    swim:{types:['Swim'],minM:1000},
    hr:{types:['Workout','WeightTraining','Yoga','Pilates','Crossfit','HighIntensityIntervalTraining','Rowing','RockClimbing','Elliptical','StairStepper','Tennis','Squash','Pickleball'],minS:1800}
  };
  var TYPE_ICON = { Run:'🏃',TrailRun:'🏃',VirtualRun:'🏃',Walk:'🚶',Hike:'🥾',Ride:'🚴',VirtualRide:'🚴',Swim:'🏊',Workout:'💓',WeightTraining:'🏋',Yoga:'🧘',Crossfit:'🏋',Rowing:'🚣' };

  var state = { acts:[], health:[], slips:[], derived:null, loaded:false, anim:null, reduce:false };

  // ── helpers ──
  function $(id){ return document.getElementById(id); }
  function pad(n){ return (n<10?'0':'')+n; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function parseLocal(d){ if(!d) return new Date(); return new Date(String(d).replace(/[+-]\d{2}:\d{2}$/,'').replace(/Z$/,'')); }
  function ds(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function today(){ return ds(new Date()); }
  function dayNum(x){ return Math.floor((new Date(x+'T00:00:00') - new Date(STREAK_START+'T00:00:00'))/86400000)+1; }
  function fmtDur(sec){ sec=Math.round(sec||0); var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60); return h>0?h+':'+pad(m)+':'+pad(sec%60):m+':'+pad(sec%60); }
  function mean(a){ return a.length? a.reduce(function(x,y){return x+y;},0)/a.length : null; }
  function stdev(a){ if(a.length<2) return null; var m=mean(a); return Math.sqrt(a.reduce(function(s,v){return s+(v-m)*(v-m);},0)/a.length); }
  function lastN(n){ var o=[]; for(var i=n-1;i>=0;i--) o.push(ds(new Date(Date.now()-i*86400000))); return o; }

  function qualifies(type,meters,sec){
    var b=['walk','run','cycle','swim'];
    for(var i=0;i<b.length;i++){ var r=RULE[b[i]]; if(r.types.indexOf(type)!==-1&&meters>=r.minM) return b[i]; }
    if(RULE.hr.types.indexOf(type)!==-1&&sec>=RULE.hr.minS) return 'hr';
    return null;
  }
  function statusFrom(score,go,caution){ if(score==null) return null; return score>=go?'GO':(score>=caution?'CAUTION':'NOGO'); }

  // ── data ──
  function adminRead(body){
    return fetch(SYNC_URL+'?action=admin-read&admin_key='+ADMIN_KEY,{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(j){return (j&&Array.isArray(j.data))?j.data:[];}).catch(function(){return [];});
  }
  function load(){
    return Promise.all([
      adminRead({table:'strava_activities',select:'name,type,distance,moving_time,start_date_local,average_heartrate,calories,device_name',order:'start_date_local:desc',limit:150}),
      adminRead({table:'health_daily',select:'date,sleep_hours,sleep_score,sleep_deep_min,sleep_rem_min,bedtime,wake_time,hrv_avg,resting_hr,vo2_max,weight_kg,steps,active_calories',order:'date:desc',limit:35}),
      adminRead({table:'slips',select:'date,reason,amount,penalty_status',order:'date:desc',limit:80})
    ]).then(function(r){ state.acts=r[0]||[]; state.health=r[1]||[]; state.slips=r[2]||[]; state.loaded=true; state.derived=derive(); });
  }
  // allow test/preview injection
  window.__missionDeckIngest = function(acts,health,slips){ state.acts=acts||[]; state.health=health||[]; state.slips=slips||[]; state.loaded=true; state.derived=derive(); render(); };

  // ── the science ──
  function midpoint(bedtime, hours){
    if(!bedtime||!hours) return null;
    var p=String(bedtime).split(':'); if(p.length<2) return null;
    var h=parseInt(p[0],10)+parseInt(p[1],10)/60;
    if(h<12) h+=24;                 // after-midnight bedtime → continue the night axis
    return h + hours/2;
  }
  function dayLoad(a){
    var min=(a.moving_time||0)/60; if(min<=0) return 0;
    var f;
    if(a.average_heartrate){ var pct=a.average_heartrate/HR_MAX;
      f = pct<0.60?0.6 : pct<0.70?0.8 : pct<0.80?1.0 : pct<0.90?1.3 : 1.6;
    } else if(a.calories&&min){ f = clamp((a.calories/min)/8,0.6,1.6); } else { f=1.0; }
    return min*f;
  }
  function acwrScoreFrom(acwr){
    if(acwr==null) return null;
    if(acwr>=0.8&&acwr<=1.3) return Math.round(100 - Math.abs(acwr-1.0)*40);          // 100 at 1.0
    if(acwr>1.3&&acwr<=1.5) return Math.round(40 + (1.5-acwr)/0.2*20);                 // 60→40
    if(acwr<0.8&&acwr>=0.5) return Math.round(40 + (acwr-0.5)/0.3*20);                 // 40→60 (undertrained but not risky)
    return 15;                                                                          // >1.5 danger or <0.5 detrained
  }

  function derive(){
    var H = state.health.slice();                       // desc
    var todayH = H[0] || null;                           // most-recent health row
    var dataDate = todayH ? todayH.date : null;

    // 30-day baselines
    var hrv30 = H.slice(0,30).map(function(d){return d.hrv_avg;}).filter(function(v){return v!=null;});
    var rhr30 = H.slice(0,30).map(function(d){return d.resting_hr;}).filter(function(v){return v!=null;});

    // ── SLEEP ──
    var sleep=null, sleepParts={};
    if(todayH && todayH.sleep_hours!=null){
      var hoursScore = clamp(todayH.sleep_hours/6,0,1);
      var mids = H.slice(0,14).map(function(d){return midpoint(d.bedtime,d.sleep_hours);}).filter(function(v){return v!=null;});
      var sd = stdev(mids);
      var consistency = sd!=null ? 100 - Math.min(60, sd*60) : null;
      var quality = todayH.sleep_score!=null ? todayH.sleep_score/100
                   : (todayH.sleep_deep_min!=null&&todayH.sleep_rem_min!=null&&todayH.sleep_hours) ? clamp((todayH.sleep_deep_min+todayH.sleep_rem_min)/(todayH.sleep_hours*60),0,1) : null;
      var w=0,s=0;
      if(consistency!=null){ s+=0.45*(consistency/100); w+=0.45; }
      s+=0.35*hoursScore; w+=0.35;
      if(quality!=null){ s+=0.20*quality; w+=0.20; }
      sleep = Math.round(100*s/w);
      sleepParts={ hours:todayH.sleep_hours, consistency:consistency!=null?Math.round(consistency):null, score:todayH.sleep_score };
    }

    // ── RECOVERY (HRV up good, RHR down good) ──
    var recov=null, recovParts={};
    if(todayH && (todayH.hrv_avg!=null || todayH.resting_hr!=null)){
      var hM=mean(hrv30), hS=stdev(hrv30), rM=mean(rhr30), rS=stdev(rhr30);
      var signals=[];
      if(todayH.hrv_avg!=null&&hM!=null&&hS){ signals.push(clamp((todayH.hrv_avg-hM)/hS,-2,2)); }
      if(todayH.resting_hr!=null&&rM!=null&&rS){ signals.push(clamp((rM-todayH.resting_hr)/rS,-2,2)); }
      if(signals.length){ var mult=signals.length===1?44:22; recov=Math.round(clamp(50+signals.reduce(function(a,z){return a+mult*z;},0),0,100)); }
      else if(todayH.hrv_avg!=null||todayH.resting_hr!=null){ recov=null; } // baseline not ready
      recovParts={ hrv:todayH.hrv_avg, rhr:todayH.resting_hr, hrvBase:hM?Math.round(hM):null, rhrBase:rM?Math.round(rM):null };
    }

    // ── LOAD / ACWR ──
    var byDay={}; state.acts.forEach(function(a){ var d=(a.start_date_local||'').slice(0,10); if(d) byDay[d]=(byDay[d]||0)+dayLoad(a); });
    var acute=0, chronic=0, daysWithData=0;
    var d28=lastN(28);
    d28.forEach(function(dd,i){ var l=byDay[dd]||0; if(l>0) daysWithData++; chronic+=l; if(i>=21) acute+=l; }); // last 7 of the 28 = acute
    chronic = chronic/4;
    var histDays = Object.keys(byDay).filter(function(k){return k>=lastN(28)[0];}).length;
    var acwr = (chronic>0 && histDays>=6) ? acute/chronic : null;
    var loadScore = acwrScoreFrom(acwr);
    var loadParts={ acwr:acwr, calibrating:acwr==null };

    // ── COMPOSITE ──
    var comps=[]; if(sleep!=null)comps.push({v:sleep,w:0.34}); if(recov!=null)comps.push({v:recov,w:0.34}); if(loadScore!=null)comps.push({v:loadScore,w:0.32});
    var readiness=null;
    if(comps.length){ var tw=comps.reduce(function(a,c){return a+c.w;},0); readiness=Math.round(comps.reduce(function(a,c){return a+c.v*c.w;},0)/tw); }

    var sleepSt=statusFrom(sleep,75,55), recovSt=statusFrom(recov,70,50);
    var loadSt = acwr==null?null : (acwr>=0.8&&acwr<=1.3)?'GO' : (acwr>1.5)?'NOGO' : 'CAUTION';
    var stlist=[sleepSt,recovSt,loadSt].filter(Boolean);
    var master = stlist.indexOf('NOGO')>=0?'SCRUB' : stlist.indexOf('CAUTION')>=0?'HOLD' : stlist.length?'LAUNCH READY':'CALIBRATING';
    var masterStatus = master==='SCRUB'?'NOGO':master==='HOLD'?'CAUTION':master==='LAUNCH READY'?'GO':null;

    return {
      dataDate:dataDate, readiness:readiness, master:master, masterStatus:masterStatus,
      sleep:sleep, recov:recov, loadScore:loadScore, acwr:acwr,
      sleepSt:sleepSt, recovSt:recovSt, loadSt:loadSt,
      sleepParts:sleepParts, recovParts:recovParts, loadParts:loadParts,
      verdict:verdict(master, sleepSt, recovSt, loadSt, acwr)
    };
  }

  function verdict(master, sSt, rSt, lSt, acwr){
    if(master==='CALIBRATING') return 'Calibrating — log a few days to read.';
    if(lSt==='NOGO') return 'High load. Rest is the win today.';
    if(rSt==='NOGO') return 'Under-recovered — go easy, protect the streak.';
    if(sSt==='NOGO') return 'Short sleep. Keep it gentle today.';
    if(master==='HOLD'){
      if(lSt==='CAUTION'&&acwr!=null&&acwr<0.8) return 'Build gradually — room to add a little.';
      return 'Ease in — you\'re carrying some load.';
    }
    return 'Recovered. Green to push today.';
  }

  // ═══════════════════════ RENDER ═══════════════════════
  var CSS = [
    '#p-review{--sleep:#70AEFF;--recov:#00E5A0;--load:#F5A623}',
    '#reviewRoot{max-width:1120px;margin:0 auto}',
    '#reviewRoot .md-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:2px 2px 14px;border-bottom:1px solid rgba(255,255,255,0.06)}',
    '#reviewRoot .md-bar .l{font:700 12px '+MONO+';letter-spacing:3px;color:var(--text)}',
    '#reviewRoot .md-clock{font:700 12px '+MONO+';letter-spacing:2px;color:#00D4FF;font-variant-numeric:tabular-nums}',
    '#reviewRoot .md-tag{font:700 9px '+MONO+';letter-spacing:1.5px;padding:3px 8px;border-radius:5px;border:1px solid rgba(245,166,35,0.3);color:#F5A623}',
    '#reviewRoot .md-core-wrap{position:relative;display:flex;flex-direction:column;align-items:center;padding:26px 0 6px;overflow:hidden}',
    '#reviewRoot .md-wash{position:absolute;inset:-20% 0 0;z-index:0;transition:opacity 1.2s ease;pointer-events:none}',
    '#reviewRoot canvas.md-core{position:relative;z-index:1;width:min(72vw,300px);height:min(72vw,300px)}',
    '#reviewRoot .md-verdict{position:relative;z-index:1;font:400 clamp(15px,3.4vw,19px) Inter,sans-serif;text-align:center;margin:2px 16px 0;letter-spacing:0.2px}',
    '#reviewRoot .md-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}',
    '#reviewRoot .md-tile{background:#0E1117;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:15px 15px 12px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;min-height:44px;transition:border-color .2s,transform .12s}',
    '#reviewRoot .md-tile:active{transform:scale(0.985)}',
    '#reviewRoot .md-tile .top{display:flex;align-items:center;justify-content:space-between}',
    '#reviewRoot .md-tile .lbl{font:700 9px '+MONO+';letter-spacing:2px;color:var(--text-muted,rgba(244,244,242,0.55))}',
    '#reviewRoot .md-dot{width:8px;height:8px;border-radius:50%}',
    '#reviewRoot .md-val{font:300 30px '+MONO+';color:var(--text);margin-top:9px;line-height:1;font-variant-numeric:tabular-nums}',
    '#reviewRoot .md-val small{font-size:13px;color:rgba(244,244,242,0.5);font-weight:400;margin-left:3px}',
    '#reviewRoot .md-delta{font:600 10px '+MONO+';margin-top:6px;letter-spacing:0.5px}',
    '#reviewRoot .md-spark{width:100%;height:34px;display:block;margin-top:8px}',
    '#reviewRoot .md-env{width:100%;height:26px;display:block;margin-top:8px}',
    '#reviewRoot .md-drawer{overflow:hidden;max-height:0;transition:max-height .35s ease;font:400 12px Inter,sans-serif;color:rgba(244,244,242,0.7);line-height:1.55}',
    '#reviewRoot .md-tile.open .md-drawer{max-height:120px;margin-top:10px}',
    '#reviewRoot .md-burn{margin-top:22px;background:#0E1117;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:0;overflow:hidden;display:flex;align-items:stretch}',
    '#reviewRoot .md-burn .artery{width:3px;flex-shrink:0}',
    '#reviewRoot .md-burn .body{padding:14px 16px;flex:1;display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
    '#reviewRoot .md-stamp{font:700 10px '+MONO+';letter-spacing:2px;padding:4px 9px;border-radius:6px}',
    '#reviewRoot .md-ledger{margin:20px 2px 8px;text-align:center}',
    '#reviewRoot .md-ledger .m{font:600 12px '+MONO+';letter-spacing:1px;color:rgba(244,244,242,0.5)}',
    '#reviewRoot .md-ledger .s{font:400 11px Inter,sans-serif;color:rgba(244,244,242,0.32);margin-top:3px}',
    '#reviewRoot .md-refresh{display:block;margin:22px auto 6px;font:600 10px '+MONO+';letter-spacing:2px;padding:10px 22px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,0.15);color:var(--text);cursor:pointer;min-height:44px}',
    '@media(max-width:379px){#reviewRoot .md-grid{grid-template-columns:1fr}}',
    '@media(min-width:1024px){#reviewRoot{display:grid;grid-template-columns:360px 1fr;gap:30px;align-items:start}',
      '#reviewRoot .md-bar{grid-column:1/-1}',
      '#reviewRoot .md-core-wrap{position:sticky;top:10px}',
      '#reviewRoot canvas.md-core{width:340px;height:340px}',
      '#reviewRoot .md-grid{grid-template-columns:1fr 1fr;margin-top:0}',
      '#reviewRoot .md-burn,#reviewRoot .md-ledger,#reviewRoot .md-refresh{grid-column:1/-1}}'
  ].join('\n');

  function statusColor(st){ return st?STATUS_COL[st]:'rgba(244,244,242,0.4)'; }

  function sparkline(canvas, values, color, target){
    if(!canvas) return; var dpr=Math.min(window.devicePixelRatio||1,2);
    var w=canvas.clientWidth||220, h=canvas.clientHeight||34; canvas.width=w*dpr; canvas.height=h*dpr;
    var ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
    var vals=values.filter(function(v){return v!=null;}); if(!vals.length) return;
    var max=Math.max.apply(null,vals.concat(target?[target]:[])), min=Math.min.apply(null,vals);
    if(max===min){max+=1;min-=1;}
    var n=values.length, pad=3;
    function X(i){ return pad+(i/(n-1||1))*(w-pad*2); }
    function Y(v){ return h-pad-((v-min)/(max-min))*(h-pad*2); }
    ctx.beginPath(); var started=false, lastX=0,lastY=0;
    for(var i=0;i<n;i++){ if(values[i]==null) continue; var x=X(i),y=Y(values[i]); if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y); lastX=x;lastY=y; }
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.shadowColor=color; ctx.shadowBlur=6; ctx.stroke();
    ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(lastX,lastY,2.6,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();
  }

  function envelope(canvas, acwr){
    if(!canvas) return; var dpr=Math.min(window.devicePixelRatio||1,2);
    var w=canvas.clientWidth||220,h=canvas.clientHeight||26; canvas.width=w*dpr;canvas.height=h*dpr;
    var ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
    var lo=0.4, hi=1.8, barY=h/2-5, barH=10, r=5;
    function X(v){ return ((clamp(v,lo,hi)-lo)/(hi-lo))*w; }
    // base track
    ctx.fillStyle='rgba(255,255,255,0.06)'; roundRect(ctx,0,barY,w,barH,r); ctx.fill();
    // amber shoulders
    ctx.fillStyle='rgba(245,166,35,0.28)'; ctx.fillRect(X(0.5),barY,X(0.8)-X(0.5),barH); ctx.fillRect(X(1.3),barY,X(1.5)-X(1.3),barH);
    // red danger
    ctx.fillStyle='rgba(255,68,68,0.30)'; ctx.fillRect(X(1.5),barY,w-X(1.5),barH);
    // green envelope
    ctx.fillStyle='rgba(0,229,160,0.42)'; ctx.fillRect(X(0.8),barY,X(1.3)-X(0.8),barH);
    if(acwr!=null){ var nx=X(acwr); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.shadowColor='#fff'; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.moveTo(nx,barY-4); ctx.lineTo(nx,barY+barH+4); ctx.stroke(); ctx.shadowBlur=0; }
  }
  function roundRect(ctx,x,y,w,h,r){ ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath(); }

  // ── the Readiness Core (animated) ──
  function startCore(canvas, d){
    if(state.anim){ cancelAnimationFrame(state.anim); state.anim=null; }
    var dpr=Math.min(window.devicePixelRatio||1,2);
    var segs=[ {v:d.sleep, c:COL.sleep}, {v:d.recov, c:COL.recov}, {v:d.loadScore, c:COL.load} ];
    var accent = d.masterStatus?STATUS_COL[d.masterStatus]:COL.cyan;
    var t0=performance.now(), BOOT=1500;
    function frame(now){
      var cw=canvas.clientWidth||280, ch=canvas.clientHeight||280;
      if(canvas.width!==cw*dpr){ canvas.width=cw*dpr; canvas.height=ch*dpr; }
      var ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,cw,ch);
      var cx=cw/2, cy=ch/2, R=Math.min(cw,ch)/2-18;
      var el = state.reduce?BOOT:(now-t0); var prog=clamp(el/BOOT,0,1);
      // inner altimeter ticks
      ctx.save(); ctx.translate(cx,cy);
      for(var i=0;i<60;i++){ var a=i/60*Math.PI*2; var r1=R-20,r2=R-(i%5===0?27:24);
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*r1,Math.sin(a)*r1); ctx.lineTo(Math.cos(a)*r2,Math.sin(a)*r2);
        ctx.strokeStyle='rgba(244,244,242,'+(i%5===0?0.14:0.06)+')'; ctx.lineWidth=1; ctx.stroke(); }
      ctx.restore();
      // three arcs
      var gap=4*Math.PI/180, segSpan=(Math.PI*2/3)-gap, start=-Math.PI/2;
      for(var s=0;s<3;s++){
        var seg=segs[s], a0=start+s*(Math.PI*2/3);
        // base
        ctx.beginPath(); ctx.arc(cx,cy,R,a0,a0+segSpan); ctx.lineWidth=12; ctx.lineCap='round';
        ctx.strokeStyle='rgba('+hexToRgb(seg.c)+',0.14)'; ctx.stroke();
        if(seg.v==null) continue;
        // staggered boot fill
        var segStart=s/3, segEnd=(s+1)/3, local=clamp((prog-segStart)/(segEnd-segStart),0,1);
        var ease=1-Math.pow(1-local,3);
        var fillFrac=(seg.v/100)*ease;
        if(fillFrac>0){ ctx.beginPath(); ctx.arc(cx,cy,R,a0,a0+segSpan*fillFrac); ctx.lineWidth=12; ctx.lineCap='round';
          ctx.strokeStyle=seg.c; ctx.shadowColor=seg.c; ctx.shadowBlur=18; ctx.stroke(); ctx.shadowBlur=0;
          var la=a0+segSpan*fillFrac; ctx.beginPath(); ctx.arc(cx+Math.cos(la)*R,cy+Math.sin(la)*R,2.5,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); }
      }
      // center: label + number + master word
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=COL.t3; ctx.font='700 10px '+MONO;
      ctx.fillText('R E A D I N E S S', cx, cy-R*0.42);
      var shown = d.readiness==null?null:Math.round(d.readiness*(state.reduce?1:easeOut(prog)));
      ctx.fillStyle=accent; ctx.font='300 '+Math.round(R*0.52)+'px '+MONO;
      // subtle breathing glow once booted
      var breathe = (prog>=1 && !state.reduce) ? (14+6*Math.sin(now/1000*Math.PI)) : 0;
      ctx.shadowColor=accent; ctx.shadowBlur=breathe;
      ctx.fillText(d.readiness==null?'—':String(shown), cx, cy+2);
      ctx.shadowBlur=0;
      if(prog>0.85){ ctx.globalAlpha=clamp((prog-0.85)/0.15,0,1);
        ctx.fillStyle=accent; ctx.font='700 13px '+MONO; ctx.fillText(d.master, cx, cy+R*0.40); ctx.globalAlpha=1; }
      if(prog<1 || (!state.reduce)) state.anim=requestAnimationFrame(frame); else state.anim=null;
    }
    state.anim=requestAnimationFrame(frame);
  }
  function easeOut(t){ return 1-Math.pow(1-t,3); }
  function hexToRgb(h){ h=h.replace('#',''); return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)].join(','); }

  // ── build tiles ──
  function tile(key,label,sub,valHtml,delta,deltaColor,accentVar,statusSt,evidence){
    return '<div class="md-tile" data-tile="'+key+'" style="border-color:rgba('+hexToRgb(accentVar)+',0.16)">'+
      '<div class="top"><div class="lbl">'+label+(sub?' <span style="color:rgba(244,244,242,0.3)">'+sub+'</span>':'')+'</div>'+
        '<div class="md-dot" style="background:'+statusColor(statusSt)+';box-shadow:0 0 7px '+statusColor(statusSt)+'"></div></div>'+
      '<div class="md-val">'+valHtml+'</div>'+
      (delta?'<div class="md-delta" style="color:'+deltaColor+'">'+delta+'</div>':'')+
      '<canvas class="md-spark" data-spark="'+key+'"></canvas>'+
      (key==='load'?'<canvas class="md-env" data-env="1"></canvas>':'')+
      '<div class="md-drawer">'+evidence+'</div></div>';
  }

  function render(){
    var el=$('reviewRoot'); if(!el) return;
    if(!state.loaded){ el.innerHTML='<div style="padding:60px;text-align:center;font:500 12px '+MONO+';color:rgba(244,244,242,0.4);letter-spacing:2px">▸ BOOTING MISSION DECK…</div>'; return; }
    var d=state.derived, td=today(), day=dayNum(td);
    var now=new Date(); var clock=pad(now.getHours())+':'+pad(now.getMinutes());
    var scrubs=state.slips.length;
    var accent=d.masterStatus?STATUS_COL[d.masterStatus]:COL.cyan;

    // latest activity
    var burn=state.acts[0]||null;
    var burnB=burn?qualifies(burn.type,burn.distance||0,burn.moving_time||0):null;
    var sportAccent = burnB==='run'?'#FC4C02':burnB==='cycle'?'#93C5FD':burnB==='swim'?COL.sleep:burnB==='walk'?'#C89B7B':COL.recov;

    // sparkline series (chronological)
    var H14=state.health.slice(0,14).reverse();
    var sleepSeries=H14.map(function(x){return x.sleep_hours;});
    var hrvSeries=H14.map(function(x){return x.hrv_avg;});
    var rhrSeries=H14.map(function(x){return x.resting_hr;});
    var wtSeries=state.health.slice(0,20).reverse().map(function(x){return x.weight_kg;});
    var byDay={}; state.acts.forEach(function(a){var k=(a.start_date_local||'').slice(0,10);if(k)byDay[k]=(byDay[k]||0)+(a.distance||0)/1000;});
    var kmSeries=lastN(14).map(function(k){return byDay[k]||0;});

    // deltas
    function dz(cur,base,inv){ if(cur==null||base==null) return ['','']; var diff=cur-base; var good=inv?diff<0:diff>0; var arrow=diff>0?'▲':diff<0?'▼':'·';
      return [arrow+Math.abs(Math.round(diff*(inv?1:10))/(inv?1:10)), good?COL.recov:(diff===0?COL.t3:COL.load)]; }

    var sp=d.sleepParts||{}, rp=d.recovParts||{}, lp=d.loadParts||{};
    var latestWt=(state.health.filter(function(x){return x.weight_kg;})[0]||{}).weight_kg;
    var latestVo2=(state.health.filter(function(x){return x.vo2_max;})[0]||{}).vo2_max;
    var todayH=state.health[0]||{};

    var html=
      '<div class="md-bar"><div><div class="l">◆ MISSION DECK</div>'+
        '<div class="md-clock" style="margin-top:4px">T+'+day+'d · '+clock+'</div></div>'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
          (scrubs?'<span class="md-tag">⚑ '+scrubs+' SCRUB'+(scrubs>1?'S':'')+'</span>':'<span class="md-tag" style="color:'+COL.recov+';border-color:rgba(0,229,160,0.3)">✓ CLEAN</span>')+
          (d.dataDate&&d.dataDate!==td?'<span class="md-tag" style="color:'+COL.t2+';border-color:rgba(255,255,255,0.1)">DATA '+d.dataDate.slice(5)+'</span>':'')+
        '</div></div>'+

      '<div class="md-core-wrap"><div class="md-wash" style="background:radial-gradient(circle at 50% 40%,rgba('+hexToRgb(accent)+',0.10),transparent 62%)"></div>'+
        '<canvas class="md-core" id="mdCore"></canvas>'+
        '<div class="md-verdict" style="color:'+accent+'">'+esc(d.verdict)+'</div></div>'+

      '<div class="md-grid">'+
        tile('sleep','SLEEP','· '+(sp.consistency!=null?sp.consistency+'% consist':'rhythm'),
             (d.sleep!=null?d.sleep:'—')+'<small>/100</small>', sp.hours!=null?sp.hours.toFixed(1)+'h':'', COL.t2, COL.sleep, d.sleepSt,
             sleepEvidence(d,sp))+
        tile('recov','RECOVERY','· HRV·RHR',
             (d.recov!=null?d.recov:'—')+'<small>/100</small>', dz(rp.hrv,rp.hrvBase,false)[0]+(rp.hrv?'ms':''), dz(rp.hrv,rp.hrvBase,false)[1], COL.recov, d.recovSt,
             recovEvidence(d,rp))+
        tile('load','LOAD','· ACWR',
             (d.acwr!=null?d.acwr.toFixed(2):'CALIB'), '', COL.t2, COL.load, d.loadSt,
             loadEvidence(d))+
        tile('fuel','FUEL','· today',
             (burn&&burn.calories?Math.round(burn.calories):(todayH.active_calories?Math.round(todayH.active_calories):'—'))+'<small>kcal</small>', burn?esc(burn.type):'', COL.t2, COL.load, burn?'GO':null,
             'Energy out today. Fuel to match your training, not to punish it.')+
        tile('frame','FRAME','· body',
             (latestWt?latestWt.toFixed(1):'—')+'<small>kg</small>', latestVo2?'VO₂ '+latestVo2.toFixed(0):'', COL.t2, COL.recov, latestWt?'GO':null,
             latestVo2?('VO₂max '+latestVo2.toFixed(0)+' — your aerobic engine. Rises with consistent easy volume.'):'Weight & VO₂max trend — the slow-moving truth.')+
        tile('streak','STREAK','· alive',
             day+'<small>days</small>', scrubs?scrubs+' scrubs':'unbroken', scrubs?COL.load:COL.recov, COL.cyan, 'GO',
             'Day '+day+'. A miss is a scrub, not a reset — the line holds. Consistency is the whole game.')+
      '</div>'+

      (burn?('<div class="md-burn"><div class="artery" style="background:'+sportAccent+'"></div><div class="body">'+
        '<span class="md-stamp" style="background:rgba('+hexToRgb(burnB?COL.recov:COL.load)+',0.12);color:'+(burnB?COL.recov:COL.load)+'">'+(burnB?'WIN':'LOGGED')+'</span>'+
        '<span style="font-size:20px">'+(TYPE_ICON[burn.type]||'●')+'</span>'+
        '<div style="font:600 13px '+MONO+';color:var(--text)">'+esc(burn.name||burn.type)+'</div>'+
        '<div style="font:500 11px '+MONO+';color:rgba(244,244,242,0.5)">'+(burn.distance?(burn.distance/1000).toFixed(2)+' km · ':'')+fmtDur(burn.moving_time)+(burn.average_heartrate?' · '+Math.round(burn.average_heartrate)+' bpm':'')+(burn.calories?' · '+Math.round(burn.calories)+' kcal':'')+'</div>'+
        '<div style="font:500 10px '+MONO+';color:rgba(244,244,242,0.32);width:100%">'+(burn.start_date_local||'').slice(0,10)+'</div>'+
      '</div></div>'):'')+

      '<div class="md-ledger"><div class="m">♥ CONTRIBUTED ₹'+(scrubs*STAKE).toLocaleString('en-IN')+' · '+scrubs+' scrub'+(scrubs===1?'':'s')+'</div>'+
        '<div class="s">'+(scrubs?('fuel spent — '+Math.floor(scrubs*STAKE/1500)+' child-term'+(Math.floor(scrubs*STAKE/1500)===1?'':'s')+' funded · Akshaya Patra'):'no misses yet — every rupee still in your court')+'</div></div>'+

      '<button class="md-refresh" id="mdRefresh">↻ REFRESH</button>';

    el.innerHTML=html;

    // draw
    startCore($('mdCore'), d);
    sparkline(el.querySelector('[data-spark="sleep"]'), sleepSeries, COL.sleep, 6);
    sparkline(el.querySelector('[data-spark="recov"]'), hrvSeries, COL.recov);
    sparkline(el.querySelector('[data-spark="load"]'), kmSeries, COL.load);
    envelope(el.querySelector('[data-env="1"]'), d.acwr);
    sparkline(el.querySelector('[data-spark="fuel"]'), kmSeries, COL.load);
    sparkline(el.querySelector('[data-spark="frame"]'), wtSeries, COL.recov);
    sparkline(el.querySelector('[data-spark="streak"]'), kmSeries.map(function(v,i){return i+1;}), COL.cyan);

    // interactions
    el.querySelectorAll('.md-tile').forEach(function(t){ t.addEventListener('click',function(){ t.classList.toggle('open'); }); });
    var rb=$('mdRefresh'); if(rb) rb.addEventListener('click',function(){ state.loaded=false; render(); load().then(render); });
  }

  function sleepEvidence(d,sp){
    if(d.sleep==null) return 'No sleep data yet. Consistency of bed/wake time is the strongest lever — more than raw hours.';
    var c=sp.consistency;
    var parts='Sleep '+d.sleep+'/100. ';
    if(c!=null) parts+='Timing consistency '+c+'% (weighted highest — a steady schedule beats occasional long nights). ';
    if(sp.hours!=null) parts+='Last night '+sp.hours.toFixed(1)+'h vs 6h target.';
    return parts;
  }
  function recovEvidence(d,rp){
    if(d.recov==null) return 'Recovery reads your HRV and resting-HR against your own 30-day baseline. A few more days builds it.';
    var parts=[]; if(rp.hrv!=null&&rp.hrvBase!=null) parts.push('HRV '+rp.hrv+'ms vs '+rp.hrvBase+' baseline');
    if(rp.rhr!=null&&rp.rhrBase!=null) parts.push('resting HR '+rp.rhr+' vs '+rp.rhrBase);
    return 'Recovery '+d.recov+'/100 — '+parts.join(' · ')+'. Higher HRV and lower resting HR mean you\'re absorbing training well.';
  }
  function loadEvidence(d){
    if(d.acwr==null) return 'Training load (acute:chronic ratio) needs ~2 weeks of history to calibrate. Keep logging.';
    var z=d.acwr, tag=z>=0.8&&z<=1.3?'inside the 0.8–1.3 sweet spot — load is honest':z>1.5?'above 1.5 — elevated injury/overtraining risk, ease back':z>1.3?'1.3–1.5 — monitor, don\'t add more yet':'below 0.8 — room to build gradually';
    return 'ACWR '+z.toFixed(2)+' — '+tag+'. This is the ratio of your last 7 days of load to your 28-day average.';
  }

  // ── init / lifecycle ──
  function init(){
    var root=$('reviewRoot'); if(!root) return;
    state.reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!root.dataset.styled){ var s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); root.dataset.styled='1'; }
    render();
    load().then(render);
  }
  document.addEventListener('visibilitychange', function(){ if(document.hidden && state.anim){ cancelAnimationFrame(state.anim); state.anim=null; }
    else if(!document.hidden && state.derived && $('mdCore')){ startCore($('mdCore'), state.derived); } });

  if(typeof window.switchPanel==='function'){ var _o=window.switchPanel; window.switchPanel=function(n){ _o(n); if(n==='review') init(); }; }
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(function(){ if($('reviewRoot')) init(); }, 700); });
})();
