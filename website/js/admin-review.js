// ═══════════════════════════════════════════════════════
// FIRST LIGHT — DAILY REVIEW (private "how am I doing" dashboard)
//
// One at-a-glance surface: today's status, this week, streak & stake,
// sleep + body + activity trends, recent activities, misses. Reads
// everything through the admin-read edge proxy (service role) so it is
// immune to the RLS lockdown. Lives at the top of the Command Center.
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  var SUPA = (window.FL && FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url') || '';
  var KEY  = (window.FL && FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key') || '';
  var SYNC_URL = SUPA + '/functions/v1/firstlight-sync';
  var ADMIN_KEY = ['934c03a18ffe22cb', 'ccef763b4bf480d5', '3f0690177904ba2b', '1d9ebacd52b0eb5d'].join('');
  var STREAK_START = (window.FL && FL.STREAK_START) || '2026-06-20';
  var STAKE = 1500;

  // ENDURANCE menu thresholds (mirror the verdict judge)
  var RULE = {
    walk:  { types: ['Walk', 'Hike'], minMeters: 5000 },
    run:   { types: ['Run', 'TrailRun', 'VirtualRun'], minMeters: 5000 },
    cycle: { types: ['Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'VirtualRide', 'EMountainBikeRide'], minMeters: 10000 },
    swim:  { types: ['Swim'], minMeters: 1000 },
    hrSession: { types: ['Workout','WeightTraining','Yoga','Pilates','Crossfit','HighIntensityIntervalTraining','Rowing','RockClimbing','Elliptical','StairStepper','Tennis','Squash','Pickleball'], minSeconds: 1800 }
  };
  var TYPE_ICON = { Run:'🏃',TrailRun:'🏃',VirtualRun:'🏃',Walk:'🚶',Hike:'🥾',Ride:'🚴',VirtualRide:'🚴',Swim:'🏊',Workout:'💓',WeightTraining:'🏋',Yoga:'🧘',Crossfit:'🏋',Rowing:'🚣' };

  var state = { acts: [], health: [], slips: [], loaded: false };

  // ── helpers ──
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function parseLocal(d){ if(!d) return new Date(); return new Date(String(d).replace(/[+-]\d{2}:\d{2}$/,'').replace(/Z$/,'')); }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function dateStr(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function dayNum(ds){ return Math.floor((new Date(ds+'T00:00:00') - new Date(STREAK_START+'T00:00:00'))/86400000)+1; }
  function fmtDur(sec){ sec=Math.round(sec||0); var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60); return h>0?h+'h '+pad(m)+'m':m+'m'; }
  function num(v,d){ return (v==null||isNaN(v))?(d==null?'—':d):v; }

  function qualifies(type, meters, sec){
    var b=['walk','run','cycle','swim'];
    for(var i=0;i<b.length;i++){ var r=RULE[b[i]]; if(r.types.indexOf(type)!==-1 && meters>=r.minMeters) return b[i]; }
    if(RULE.hrSession.types.indexOf(type)!==-1 && sec>=RULE.hrSession.minSeconds) return 'hrSession';
    return null;
  }

  // ── data via admin-read proxy (service role — RLS-proof) ──
  function adminRead(body){
    return fetch(SYNC_URL + '?action=admin-read&admin_key=' + ADMIN_KEY, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY},
      body: JSON.stringify(body)
    }).then(function(r){return r.json();})
      .then(function(j){ return (j && Array.isArray(j.data)) ? j.data : []; })
      .catch(function(){ return []; });
  }

  function load(){
    return Promise.all([
      adminRead({ table:'strava_activities', select:'name,type,distance,moving_time,start_date_local,average_heartrate,calories,device_name', order:'start_date_local:desc', limit:120 }),
      adminRead({ table:'health_daily', select:'date,sleep_hours,weight_kg,resting_hr,steps,active_calories,vo2_max,workout_count,workouts_detail', order:'date:desc', limit:30 }),
      adminRead({ table:'slips', select:'date,reason,amount,penalty_status', order:'date:desc', limit:60 })
    ]).then(function(res){
      state.acts = res[0]||[]; state.health = res[1]||[]; state.slips = res[2]||[]; state.loaded = true;
    });
  }

  // ── aggregation ──
  function actsOn(ds){ return state.acts.filter(function(a){ return (a.start_date_local||'').slice(0,10)===ds; }); }
  function healthOn(ds){ return state.health.filter(function(h){ return h.date===ds; })[0] || null; }

  // active day = a qualifying activity that day (strava OR apple workout)
  function activeDay(ds){
    var a = actsOn(ds).some(function(x){ return qualifies(x.type, x.distance||0, x.moving_time||0); });
    if (a) return true;
    var h = healthOn(ds);
    if (h && Array.isArray(h.workouts_detail)) {
      return h.workouts_detail.some(function(w){
        var mapped = /run/i.test(w.type)?'Run':/walk/i.test(w.type)?'Walk':/cycl|bik/i.test(w.type)?'Ride':/swim/i.test(w.type)?'Swim':'Workout';
        var distM = Math.round(Number(w.distance_km||0)*1000);
        return !!qualifies(mapped, distM, Math.round(Number(w.duration_min||0)*60));
      });
    }
    return false;
  }

  function lastN(n){ var out=[]; for(var i=n-1;i>=0;i--){ out.push(dateStr(new Date(Date.now()-i*86400000))); } return out; }

  // ── UI ──
  var CSS = [
    '#p-review .rv-grid{display:grid;gap:14px}',
    '#p-review .rv-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}',
    '#p-review .rv-card{background:var(--bg2);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px}',
    '#p-review .rv-big{font:700 clamp(26px,5vw,38px) var(--font-mono);line-height:1;font-variant-numeric:tabular-nums}',
    '#p-review .rv-lbl{font:600 9px var(--font-mono);letter-spacing:2px;color:var(--text-muted);margin-top:6px}',
    '#p-review .rv-sub{font:500 11px var(--font-mono);color:var(--text-muted);margin-top:4px}',
    '#p-review .rv-bars{display:flex;align-items:flex-end;gap:4px;height:70px;margin-top:10px}',
    '#p-review .rv-bar{flex:1;min-width:4px;border-radius:3px 3px 0 0;background:var(--cyan);position:relative;transition:height .5s}',
    '#p-review .rv-bcap{font:600 8px var(--font-mono);color:var(--text-muted);text-align:center;margin-top:4px}',
    '#p-review .rv-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);flex-wrap:wrap}',
    '#p-review .rv-section{font:700 12px var(--font-mono);letter-spacing:3px;color:var(--text);margin:26px 0 12px;display:flex;align-items:center;gap:10px}',
    '#p-review .rv-section::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(0,212,255,0.15),transparent)}'
  ].join('\n');

  function bars(vals, labels, color, fmt, target){
    var max = Math.max.apply(null, vals.concat([target||0]).filter(function(v){return v>0;})) || 1;
    var b = vals.map(function(v,i){
      var h = v>0 ? Math.max(6, Math.round(v/max*100)) : 2;
      var c = (target && v>=target) ? 'var(--green)' : (v>0 ? color : 'rgba(255,255,255,0.1)');
      return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center">' +
        '<div style="font:600 8px var(--font-mono);color:var(--text-muted);margin-bottom:3px">'+(v>0?fmt(v):'')+'</div>' +
        '<div class="rv-bar" style="height:'+h+'%;background:'+c+';width:100%"></div>' +
        '<div class="rv-bcap">'+labels[i]+'</div></div>';
    }).join('');
    return '<div class="rv-bars" style="height:90px">'+b+'</div>';
  }

  function render(){
    var el = $('reviewRoot');
    if (!el) return;
    if (!state.loaded){ el.innerHTML = '<div style="padding:40px;text-align:center;font:500 13px var(--font-mono);color:var(--text-muted)">Loading your review…</div>'; return; }

    var td = today(), yd = dateStr(new Date(Date.now()-86400000));
    var day = dayNum(td);

    // TODAY
    var todayActs = actsOn(td);
    var todayWin = activeDay(td);
    var winAct = todayActs.filter(function(a){ return qualifies(a.type,a.distance||0,a.moving_time||0); })[0];
    var hToday = healthOn(td), hYest = healthOn(yd);
    var sleep = (hToday && hToday.sleep_hours) || (hYest && hYest.sleep_hours) || null;
    var weight = (state.health.filter(function(h){return h.weight_kg;})[0]||{}).weight_kg || null;
    var steps = (hToday && hToday.steps) || null;

    // THIS WEEK (last 7 days)
    var wk = lastN(7);
    var wkActive = wk.filter(activeDay).length;
    var wkKm = 0, wkActs = 0;
    wk.forEach(function(ds){ actsOn(ds).forEach(function(a){ wkKm += (a.distance||0)/1000; wkActs++; }); });
    var wkSleep = wk.map(function(ds){ var h=healthOn(ds); return h&&h.sleep_hours?Number(h.sleep_hours):0; }).filter(function(v){return v>0;});
    var wkSleepAvg = wkSleep.length ? (wkSleep.reduce(function(a,b){return a+b;},0)/wkSleep.length) : null;
    var wkSlips = state.slips.filter(function(s){ return wk.indexOf(s.date)!==-1; }).length;

    // STREAK & STAKE
    var totalSlips = state.slips.length;
    var owed = totalSlips * STAKE;

    // trends (14d)
    var t14 = lastN(14);
    var kmSeries = t14.map(function(ds){ return actsOn(ds).reduce(function(s,a){return s+(a.distance||0)/1000;},0); });
    var sleepSeries = t14.map(function(ds){ var h=healthOn(ds); return h&&h.sleep_hours?Number(h.sleep_hours):0; });
    var lab = t14.map(function(ds){ return ['S','M','T','W','T','F','S'][new Date(ds+'T00:00:00').getDay()]; });

    el.innerHTML =
      // TODAY hero
      '<div class="rv-card" style="border-color:'+(todayWin?'rgba(0,230,118,0.35)':'rgba(245,166,35,0.35)')+';background:'+(todayWin?'rgba(0,230,118,0.05)':'rgba(245,166,35,0.05)')+'">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">' +
          '<div>' +
            '<div style="font:700 11px var(--font-mono);letter-spacing:3px;color:'+(todayWin?'var(--green)':'var(--gold)')+'">'+(todayWin?'✓ DAY '+day+' SECURED':'○ DAY '+day+' — NOT SEALED YET')+'</div>' +
            '<div class="rv-sub">'+ (winAct ? esc(winAct.name||winAct.type)+' · '+((winAct.distance>=100)?(winAct.distance/1000).toFixed(2)+' km':Math.round((winAct.moving_time||0)/60)+' min') : (todayWin?'Apple workout logged':'Move before 11:59 PM · miss = ₹'+STAKE+' to Akshaya Patra')) +'</div>' +
          '</div>' +
          '<div style="font:700 44px var(--font-mono);color:var(--cyan);line-height:1">'+day+'<span style="font-size:12px;color:var(--text-muted);letter-spacing:2px"> DAY</span></div>' +
        '</div>' +
      '</div>' +

      // TODAY cards
      '<div class="rv-cards" style="margin-top:14px">' +
        card(sleep?Number(sleep).toFixed(1):'—', 'HRS SLEEP', sleep?(sleep>=6?'var(--green)':'var(--gold)'):'var(--text)', sleep? (sleep>=6?'on target':'below 6h') : 'no data') +
        card(steps?Math.round(steps/1000)+'k':'—','STEPS TODAY','var(--cyan)', steps?'':'no data') +
        card(weight?Number(weight).toFixed(1):'—','WEIGHT KG','var(--text)', weight?'latest':'no data') +
        card(wkActive+'/7','ACTIVE DAYS','var(--green)','this week') +
      '</div>' +

      // THIS WEEK
      '<div class="rv-section">THIS WEEK</div>' +
      '<div class="rv-cards">' +
        card(wkKm.toFixed(1),'KM TOTAL','var(--cyan)', wkActs+' activities') +
        card(wkSleepAvg?wkSleepAvg.toFixed(1):'—','AVG SLEEP','var(--gold)','7-night avg') +
        card(String(wkActive),'ACTIVE DAYS','var(--green)','of 7') +
        card(String(wkSlips),'MISSES','var(--'+(wkSlips?'red':'green')+')', wkSlips?'₹'+(wkSlips*STAKE):'clean week') +
      '</div>' +

      // STREAK & STAKE
      '<div class="rv-section">STREAK &amp; STAKE</div>' +
      '<div class="rv-cards">' +
        card(String(day),'CURRENT DAY','var(--cyan)','since '+STREAK_START) +
        card(String(totalSlips),'TOTAL MISSES','var(--'+(totalSlips?'gold':'green')+')','all-time') +
        card('₹'+owed.toLocaleString('en-IN'),'TO AKSHAYA PATRA','var(--gold)', totalSlips+' × ₹'+STAKE) +
      '</div>' +

      // ACTIVITY trend
      '<div class="rv-section">ACTIVITY — LAST 14 DAYS (KM)</div>' +
      '<div class="rv-card">' + bars(kmSeries, lab, 'var(--cyan)', function(v){return v>=1?v.toFixed(0):'';}, 5) + '</div>' +

      // SLEEP trend
      '<div class="rv-section">SLEEP — LAST 14 NIGHTS (HRS)</div>' +
      '<div class="rv-card">' + bars(sleepSeries, lab, 'var(--gold)', function(v){return v.toFixed(0);}, 6) + '</div>' +

      // RECENT ACTIVITIES
      '<div class="rv-section">RECENT ACTIVITIES</div>' +
      '<div class="rv-card">' + (state.acts.slice(0,8).map(function(a){
        var b = qualifies(a.type,a.distance||0,a.moving_time||0);
        return '<div class="rv-row">' +
          '<div style="font-size:18px">'+(TYPE_ICON[a.type]||'●')+'</div>' +
          '<div style="flex:1;min-width:150px"><div style="font:600 12px var(--font-mono);color:var(--text)">'+esc(a.name||a.type)+'</div>' +
            '<div style="font:500 10px var(--font-mono);color:var(--text-muted)">'+(a.start_date_local||'').slice(0,10)+' · '+(a.distance?(a.distance/1000).toFixed(2)+' km · ':'')+fmtDur(a.moving_time)+(a.average_heartrate?' · '+Math.round(a.average_heartrate)+' bpm':'')+'</div></div>' +
          (b?'<span style="font:700 9px var(--font-mono);color:var(--green)">✓</span>':'') +
        '</div>';
      }).join('') || '<div style="font:500 12px var(--font-mono);color:var(--text-muted);padding:8px 0">No activities in range.</div>') + '</div>' +

      '<div style="text-align:center;margin:22px 0 8px"><button class="btn btn-outline" id="rvRefresh" style="font:600 10px var(--font-mono);letter-spacing:2px;padding:10px 20px">↻ REFRESH</button></div>';

    var rb = $('rvRefresh');
    if (rb) rb.addEventListener('click', function(){ state.loaded=false; render(); load().then(render); });
  }

  function card(big, lbl, color, sub){
    return '<div class="rv-card"><div class="rv-big" style="color:'+color+'">'+big+'</div><div class="rv-lbl">'+lbl+'</div>'+(sub?'<div class="rv-sub">'+sub+'</div>':'')+'</div>';
  }

  function init(){
    var root = $('reviewRoot');
    if (!root) return;
    if (!root.dataset.styled){ var s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); root.dataset.styled='1'; }
    render();               // show loading / cached
    load().then(render);    // fetch + repaint
  }

  if (typeof window.switchPanel === 'function') {
    var _orig = window.switchPanel;
    window.switchPanel = function(name){ _orig(name); if (name==='review') init(); };
  }
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(function(){ if($('reviewRoot')) init(); }, 700); });
})();
