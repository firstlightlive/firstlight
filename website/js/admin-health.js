/* ═══════════════════════════════════════════════════════
   FIRST LIGHT — Apple Health Analytics V3
   Sub-tabs: Sleep · Heart · Activity · Year · Insights
   New: Sleep Score trend, Sleep Debt chart, SpO2,
        Exercise Minutes, Health × Fortress Correlation
   Data: Health Auto Export → Supabase health_daily
   ═══════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var _healthData = [];
  var _viewRange  = 30;
  var _loaded     = false;
  var _activeTab  = 'sleep';

  // ── Premium Color Palette ──────────────────────────────
  var C = {
    sleep:'#70AEFF', sleepDeep:'#1a3a8a', sleepRem:'#5C8FD6', sleepCore:'#3A6BC5', sleepAwake:'#FF5252',
    hr:'#FF5252', hrv:'#00E676', vo2:'#F5A623', steps:'#00D4FF', cal:'#FC4C02',
    exercise:'#E040FB', spo2:'#26C6DA', wake:'#FFD54F', bedtime:'#7C4DFF',
    good:'#00E676', warn:'#F5A623', bad:'#FF5252', fortress:'#FF4444',
    grid:'rgba(255,255,255,0.05)', text:'rgba(255,255,255,0.45)', textBright:'rgba(255,255,255,0.9)',
    cardBg:'rgba(255,255,255,0.03)', cardBorder:'rgba(255,255,255,0.07)'
  };

  // ── Helpers ────────────────────────────────────────────
  function fmt(n, d)      { return n != null ? parseFloat(n).toFixed(d || 0) : '—'; }
  function avg(arr)       { if (!arr.length) return 0; return arr.reduce(function(s,v){return s+v;},0)/arr.length; }
  function median(arr)    { if (!arr.length) return 0; var s=arr.slice().sort(function(a,b){return a-b;}); var m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }
  function stddev(arr)    { if (arr.length<2) return 0; var m=avg(arr); return Math.sqrt(arr.reduce(function(s,v){return s+Math.pow(v-m,2);},0)/arr.length); }
  function timeToMin(t)   { if (!t) return null; var p=t.split(':'); return parseInt(p[0])*60+parseInt(p[1]); }
  function minToTime(m)   { if (m==null) return '—'; var h=Math.floor(m/60)%24; return String(h).padStart(2,'0')+':'+String(Math.round(m%60)).padStart(2,'0'); }
  function shortDate(d)   { var p=d.split('-'); return parseInt(p[2])+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1]; }
  function monthName(m)   { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]; }
  function scoreColor(s)  { return s>=70?C.good:s>=40?C.warn:C.bad; }
  function trendIcon(curr,prev) { if(!prev||!curr) return ''; return curr>prev?'<span style="color:'+C.good+'">&#9650;</span>':curr<prev?'<span style="color:'+C.bad+'">&#9660;</span>':'<span style="color:'+C.warn+'">&#9472;</span>'; }
  function changePct(curr,prev) { if(!prev) return ''; var p=((curr-prev)/prev*100).toFixed(1); return (p>0?'+':'')+p+'%'; }
  function spo2Val(d)     { return d.spo2 || d.blood_oxygen || d.oxygen_saturation || null; }

  // ── Canvas Helpers ─────────────────────────────────────
  function getCtx(id, w, h) {
    var el = document.getElementById(id);
    if (!el) return null;
    el.width = w || el.parentElement.offsetWidth || 600;
    el.height = h || 200;
    var ctx = el.getContext('2d');
    ctx.clearRect(0, 0, el.width, el.height);
    return ctx;
  }

  function drawGradientLine(ctx, points, color, w, h, minV, maxV, options) {
    if (points.length < 2) return;
    var opt = options || {};
    var pad = { t:15, b:opt.labels?28:15, l:opt.yAxis?40:8, r:8 };
    var cw = w-pad.l-pad.r, ch = h-pad.t-pad.b;
    var range = maxV-minV || 1;
    function xPos(i) { return pad.l+(i/(points.length-1))*cw; }
    function yPos(v) { return pad.t+ch-((v-minV)/range)*ch; }
    if (opt.gridLines) {
      ctx.strokeStyle=C.grid; ctx.lineWidth=0.5;
      for (var g=0;g<=4;g++) {
        var gy=pad.t+(g/4)*ch;
        ctx.beginPath(); ctx.moveTo(pad.l,gy); ctx.lineTo(w-pad.r,gy); ctx.stroke();
        if (opt.yAxis) { ctx.fillStyle=C.text; ctx.font='9px "IBM Plex Mono",monospace'; ctx.textAlign='right'; ctx.fillText(fmt(maxV-(g/4)*range,opt.decimals||0),pad.l-4,gy+3); }
      }
    }
    ctx.shadowColor=color; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=2.5; ctx.lineJoin='round';
    for (var i=0;i<points.length;i++) { if(i===0) ctx.moveTo(xPos(i),yPos(points[i])); else ctx.lineTo(xPos(i),yPos(points[i])); }
    ctx.stroke(); ctx.shadowBlur=0;
    ctx.lineTo(xPos(points.length-1),pad.t+ch); ctx.lineTo(xPos(0),pad.t+ch); ctx.closePath();
    var r2=parseInt(color.slice(1,3),16), g2=parseInt(color.slice(3,5),16), b2=parseInt(color.slice(5,7),16);
    var grad=ctx.createLinearGradient(0,pad.t,0,pad.t+ch);
    grad.addColorStop(0,'rgba('+r2+','+g2+','+b2+',0.28)'); grad.addColorStop(1,'rgba('+r2+','+g2+','+b2+',0.02)');
    ctx.fillStyle=grad; ctx.fill();
    var lastX=xPos(points.length-1), lastY=yPos(points[points.length-1]);
    ctx.shadowColor=color; ctx.shadowBlur=14;
    ctx.beginPath(); ctx.arc(lastX,lastY,4,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); ctx.shadowBlur=0;
    if (opt.showAvg) {
      var a=avg(points), ay=yPos(a);
      ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(pad.l,ay); ctx.lineTo(w-pad.r,ay); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle=C.text; ctx.font='8px "IBM Plex Mono"'; ctx.textAlign='right';
      ctx.fillText('avg '+fmt(a,opt.decimals||0),w-pad.r,ay-4);
    }
    if (opt.thresholds) {
      opt.thresholds.forEach(function(thr) {
        var ty=yPos(thr.value);
        ctx.strokeStyle=thr.color||'rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.setLineDash([3,5]);
        ctx.beginPath(); ctx.moveTo(pad.l,ty); ctx.lineTo(w-pad.r,ty); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle=thr.color||C.text; ctx.font='8px "IBM Plex Mono"'; ctx.textAlign='left';
        ctx.fillText(thr.label,pad.l+4,ty-4);
      });
    }
    if (opt.labels && opt.labels.length) {
      ctx.fillStyle=C.text; ctx.font='8px "IBM Plex Mono"'; ctx.textAlign='center';
      var step=Math.max(1,Math.floor(opt.labels.length/8));
      for (var li=0;li<opt.labels.length;li+=step) ctx.fillText(opt.labels[li],xPos(li),h-4);
    }
  }

  function drawSegmentLine(ctx, points, colorFn, w, h, minV, maxV, options) {
    // Same as gradient line but each point colored individually
    if (points.length < 2) return;
    var opt = options || {};
    var pad = { t:15, b:opt.labels?28:15, l:opt.yAxis?40:8, r:8 };
    var cw = w-pad.l-pad.r, ch = h-pad.t-pad.b;
    var range = maxV-minV || 1;
    function xPos(i) { return pad.l+(i/(points.length-1))*cw; }
    function yPos(v) { return pad.t+ch-((v-minV)/range)*ch; }
    if (opt.gridLines) {
      ctx.strokeStyle=C.grid; ctx.lineWidth=0.5;
      for (var g=0;g<=4;g++) {
        var gy=pad.t+(g/4)*ch; ctx.beginPath(); ctx.moveTo(pad.l,gy); ctx.lineTo(w-pad.r,gy); ctx.stroke();
        if (opt.yAxis) { ctx.fillStyle=C.text; ctx.font='9px "IBM Plex Mono"'; ctx.textAlign='right'; ctx.fillText(fmt(maxV-(g/4)*range,opt.decimals||0),pad.l-4,gy+3); }
      }
    }
    if (opt.thresholds) {
      opt.thresholds.forEach(function(thr) {
        var ty=yPos(thr.value);
        ctx.strokeStyle=thr.color||'rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.setLineDash([3,5]);
        ctx.beginPath(); ctx.moveTo(pad.l,ty); ctx.lineTo(w-pad.r,ty); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle=thr.color||C.text; ctx.font='8px "IBM Plex Mono"'; ctx.textAlign='left';
        ctx.fillText(thr.label,pad.l+4,ty-4);
      });
    }
    for (var i=0;i<points.length-1;i++) {
      var col=colorFn(points[i]);
      ctx.shadowColor=col; ctx.shadowBlur=6;
      ctx.beginPath(); ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.lineJoin='round';
      ctx.moveTo(xPos(i),yPos(points[i])); ctx.lineTo(xPos(i+1),yPos(points[i+1])); ctx.stroke();
    }
    ctx.shadowBlur=0;
    for (var i=0;i<points.length;i++) {
      var col=colorFn(points[i]);
      if (i%Math.max(1,Math.floor(points.length/20))===0||i===points.length-1) {
        ctx.shadowColor=col; ctx.shadowBlur=8;
        ctx.beginPath(); ctx.arc(xPos(i),yPos(points[i]),3,0,Math.PI*2); ctx.fillStyle=col; ctx.fill(); ctx.shadowBlur=0;
      }
    }
    if (opt.labels && opt.labels.length) {
      ctx.fillStyle=C.text; ctx.font='8px "IBM Plex Mono"'; ctx.textAlign='center';
      var step=Math.max(1,Math.floor(opt.labels.length/8));
      for (var li=0;li<opt.labels.length;li+=step) ctx.fillText(opt.labels[li],xPos(li),h-4);
    }
  }

  function drawGradientBars(ctx, values, color, w, h, maxV, options) {
    var opt=options||{};
    var pad={t:15,b:opt.labels?28:15,l:8,r:8};
    var cw=w-pad.l-pad.r, ch=h-pad.t-pad.b;
    var bw=Math.max(3,(cw/values.length)-2);
    var gap=(cw-bw*values.length)/(values.length+1);
    var r2,g2,b2;
    if (color.startsWith('#')) { r2=parseInt(color.slice(1,3),16); g2=parseInt(color.slice(3,5),16); b2=parseInt(color.slice(5,7),16); }
    else { r2=100; g2=180; b2=255; }
    for (var i=0;i<values.length;i++) {
      var bh=maxV>0?(values[i]/maxV)*ch:0;
      var x=pad.l+gap+i*(bw+gap), y=pad.t+ch-bh;
      var barColor=typeof opt.colorFn==='function'?opt.colorFn(values[i]):color;
      if (barColor.startsWith('#')) { r2=parseInt(barColor.slice(1,3),16); g2=parseInt(barColor.slice(3,5),16); b2=parseInt(barColor.slice(5,7),16); }
      var barGrad=ctx.createLinearGradient(x,y,x,pad.t+ch);
      barGrad.addColorStop(0,'rgba('+r2+','+g2+','+b2+',0.9)'); barGrad.addColorStop(1,'rgba('+r2+','+g2+','+b2+',0.3)');
      ctx.fillStyle=barGrad;
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(x,y,bw,Math.max(1,bh),[3,3,0,0]); }
      else { ctx.moveTo(x+2,y);ctx.lineTo(x+bw-2,y);ctx.quadraticCurveTo(x+bw,y,x+bw,y+2);ctx.lineTo(x+bw,y+bh);ctx.lineTo(x,y+bh);ctx.lineTo(x,y+2);ctx.quadraticCurveTo(x,y,x+2,y); }
      ctx.fill();
      if (opt.labels && opt.labels[i] && values.length<=35) {
        ctx.fillStyle=C.text; ctx.font='8px "IBM Plex Mono"'; ctx.textAlign='center';
        if (i%Math.max(1,Math.floor(values.length/10))===0) ctx.fillText(opt.labels[i],x+bw/2,h-4);
      }
    }
    if (opt.targets) {
      opt.targets.forEach(function(tgt) {
        var ty=pad.t+ch-(tgt.value/maxV)*ch;
        ctx.strokeStyle=tgt.color||'rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(pad.l,ty); ctx.lineTo(w-pad.r,ty); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle=tgt.color||C.text; ctx.font='8px "IBM Plex Mono"'; ctx.textAlign='left';
        ctx.fillText(tgt.label,pad.l+2,ty-4);
      });
    }
  }

  function drawHeatmap(containerId, data, colorFn, labelFn) {
    var el=document.getElementById(containerId); if (!el) return;
    var size=13,gap=2,cols=52,rows=7;
    var w=cols*(size+gap)+40, h=rows*(size+gap)+30;
    var html='<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><svg width="'+w+'" height="'+h+'">';
    var days=['','M','','W','','F',''];
    for (var d=0;d<7;d++) html+='<text x="0" y="'+(25+d*(size+gap)+size/2)+'" fill="'+C.text+'" font-size="9" font-family="IBM Plex Mono" dominant-baseline="middle">'+days[d]+'</text>';
    var today=new Date(); var startDate=new Date(today);
    startDate.setDate(startDate.getDate()-(cols*7-1)); startDate.setDate(startDate.getDate()-startDate.getDay());
    var dateMap={}; for (var i=0;i<data.length;i++) dateMap[data[i].date]=data[i];
    var monthLabels={}, cur=new Date(startDate);
    for (var c=0;c<cols;c++) {
      for (var r=0;r<rows;r++) {
        var ds=cur.toISOString().substring(0,10); var val=dateMap[ds];
        var clr=val?colorFn(val):'rgba(255,255,255,0.03)';
        var x=30+c*(size+gap), y=20+r*(size+gap);
        html+='<rect x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" rx="2" fill="'+clr+'"><title>'+ds+(val?': '+labelFn(val):'')+'</title></rect>';
        if (cur.getDate()<=7&&r===0&&!monthLabels[cur.getMonth()]) { monthLabels[cur.getMonth()]=true; html+='<text x="'+x+'" y="14" fill="'+C.text+'" font-size="9" font-family="IBM Plex Mono">'+monthName(cur.getMonth())+'</text>'; }
        cur.setDate(cur.getDate()+1);
      }
    }
    html+='</svg></div>'; el.innerHTML=html;
  }

  function drawDonut(containerId, segments, centerText, centerSub) {
    var el=document.getElementById(containerId); if (!el) return;
    var size=120;
    var html='<svg width="'+size+'" height="'+size+'" viewBox="0 0 120 120">';
    var total=segments.reduce(function(s,seg){return s+seg.value;},0)||1;
    var start=-90;
    for (var i=0;i<segments.length;i++) {
      var pctVal=segments[i].value/total; var angle=pctVal*360; var end=start+angle;
      var large=angle>180?1:0, r=50,cx=60,cy=60;
      var x1=cx+r*Math.cos(start*Math.PI/180), y1=cy+r*Math.sin(start*Math.PI/180);
      var x2=cx+r*Math.cos(end*Math.PI/180), y2=cy+r*Math.sin(end*Math.PI/180);
      html+='<path d="M '+cx+' '+cy+' L '+x1+' '+y1+' A '+r+' '+r+' 0 '+large+' 1 '+x2+' '+y2+' Z" fill="'+segments[i].color+'" opacity="0.85"><title>'+segments[i].label+': '+fmt(segments[i].value,0)+'m ('+fmt(pctVal*100,0)+'%)</title></path>';
      start=end;
    }
    html+='<circle cx="60" cy="60" r="32" fill="#0A0C10"/>';
    html+='<text x="60" y="56" text-anchor="middle" fill="'+C.textBright+'" font-size="16" font-weight="700" font-family="IBM Plex Mono">'+centerText+'</text>';
    html+='<text x="60" y="72" text-anchor="middle" fill="'+C.text+'" font-size="8" font-family="IBM Plex Mono">'+centerSub+'</text>';
    html+='</svg>'; el.innerHTML=html;
  }

  function buildWeeklyPattern(data, field, color, isTime) {
    var buckets=[[],[],[],[],[],[],[]];
    for (var i=0;i<data.length;i++) {
      var val=isTime?timeToMin(data[i][field]):data[i][field];
      if (val!=null) buckets[new Date(data[i].date+'T00:00:00').getDay()].push(val);
    }
    var names=['SUN','MON','TUE','WED','THU','FRI','SAT'];
    var avgs=buckets.map(function(b){return b.length?avg(b):0;});
    var maxA=Math.max.apply(null,avgs)||1;
    var html='<div style="display:flex;gap:6px;align-items:flex-end;height:100px">';
    for (var d=0;d<7;d++) {
      var barH=avgs[d]>0?Math.round((avgs[d]/maxA)*75):0;
      var valStr=isTime?minToTime(avgs[d]):fmt(avgs[d],1);
      html+='<div style="flex:1;text-align:center">';
      html+='<div style="font:10px \'IBM Plex Mono\';color:'+C.textBright+';margin-bottom:3px">'+(avgs[d]>0?valStr:'—')+'</div>';
      html+='<div style="height:'+Math.max(2,barH)+'px;background:linear-gradient(180deg,'+color+','+color+'44);border-radius:3px 3px 0 0;opacity:'+(avgs[d]>0?1:0.15)+'"></div>';
      html+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:3px">'+names[d]+'</div>';
      html+='</div>';
    }
    html+='</div>'; return html;
  }

  function buildMonthComparison(data) {
    var months={};
    for (var i=0;i<data.length;i++) {
      var mk=data[i].date.substring(0,7);
      if (!months[mk]) months[mk]={sleep:[],rhr:[],hrv:[],steps:[],vo2:[],score:[],wake:[],bed:[],cal:[],exercise:[],deep:[],rem:[],spo2:[]};
      var d=data[i];
      if (d.sleep_hours) months[mk].sleep.push(d.sleep_hours);
      if (d.resting_hr) months[mk].rhr.push(d.resting_hr);
      if (d.hrv_avg) months[mk].hrv.push(d.hrv_avg);
      if (d.steps) months[mk].steps.push(d.steps);
      if (d.vo2_max) months[mk].vo2.push(d.vo2_max);
      if (d.sleep_score) months[mk].score.push(d.sleep_score);
      if (d.wake_time) months[mk].wake.push(timeToMin(d.wake_time));
      if (d.bedtime) { var bm=timeToMin(d.bedtime); if (bm<720) bm+=1440; months[mk].bed.push(bm); }
      if (d.active_calories) months[mk].cal.push(d.active_calories);
      if (d.exercise_minutes) months[mk].exercise.push(d.exercise_minutes);
      if (d.sleep_deep_min) months[mk].deep.push(d.sleep_deep_min);
      if (d.sleep_rem_min) months[mk].rem.push(d.sleep_rem_min);
      var sv=spo2Val(d); if (sv) months[mk].spo2.push(sv);
    }
    var keys=Object.keys(months).sort().reverse().filter(function(k){
      var m=months[k]; return m.sleep.length>0||m.steps.length>2||m.rhr.length>2;
    });
    if (!keys.length) return '<div style="color:'+C.text+';text-align:center;padding:20px">No monthly data yet</div>';
    var headers=['MONTH','SLEEP','SCORE','WAKE','BED','RHR','HRV','STEPS','VO2','CAL','EXER','DEEP','REM'];
    var colors=[C.text,C.sleep,C.good,C.wake,C.bedtime,C.hr,C.hrv,C.steps,C.vo2,C.cal,C.exercise,C.sleepDeep,C.sleepRem];
    var html='<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table style="width:100%;border-collapse:collapse;font:11px \'IBM Plex Mono\',monospace">';
    html+='<tr style="border-bottom:1px solid rgba(255,255,255,0.1)">';
    for (var hi=0;hi<headers.length;hi++) html+='<th style="text-align:'+(hi===0?'left':'center')+';padding:8px 4px;color:'+colors[hi]+';font-size:9px;letter-spacing:1px">'+headers[hi]+'</th>';
    html+='</tr>';
    for (var k=0;k<keys.length;k++) {
      var m=months[keys[k]], prevM=k<keys.length-1?months[keys[k+1]]:null;
      var label=monthName(parseInt(keys[k].split('-')[1])-1)+' '+keys[k].split('-')[0].slice(2);
      html+='<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">';
      html+='<td style="padding:8px 4px;color:'+C.textBright+';font-weight:700">'+label+'</td>';
      var slpAvg=avg(m.sleep); html+='<td style="text-align:center;padding:8px 3px;color:'+C.sleep+'">'+fmt(slpAvg,1)+'h '+(prevM?trendIcon(slpAvg,avg(prevM.sleep)):'')+'</td>';
      var scAvg=avg(m.score); html+='<td style="text-align:center;padding:8px 3px;color:'+scoreColor(scAvg)+'">'+fmt(scAvg,0)+'</td>';
      html+='<td style="text-align:center;padding:8px 3px;color:'+C.wake+'">'+(m.wake.length?minToTime(avg(m.wake)):'—')+'</td>';
      html+='<td style="text-align:center;padding:8px 3px;color:'+C.bedtime+'">'+(m.bed.length?minToTime(avg(m.bed)%1440):'—')+'</td>';
      var rhrAvg=avg(m.rhr); html+='<td style="text-align:center;padding:8px 3px;color:'+C.hr+'">'+fmt(rhrAvg,0)+' '+(prevM?trendIcon(avg(prevM.rhr),rhrAvg):'')+'</td>';
      var hrvAvg=avg(m.hrv); html+='<td style="text-align:center;padding:8px 3px;color:'+C.hrv+'">'+fmt(hrvAvg,0)+'ms '+(prevM?trendIcon(hrvAvg,avg(prevM.hrv)):'')+'</td>';
      html+='<td style="text-align:center;padding:8px 3px;color:'+C.steps+'">'+fmt(avg(m.steps),0)+'</td>';
      html+='<td style="text-align:center;padding:8px 3px;color:'+C.vo2+'">'+fmt(avg(m.vo2),1)+'</td>';
      html+='<td style="text-align:center;padding:8px 3px;color:'+C.cal+'">'+fmt(avg(m.cal),0)+'</td>';
      html+='<td style="text-align:center;padding:8px 3px;color:'+C.exercise+'">'+(m.exercise.length?fmt(avg(m.exercise),0)+'m':'—')+'</td>';
      html+='<td style="text-align:center;padding:8px 3px;color:'+C.sleepDeep+'">'+fmt(avg(m.deep),0)+'m</td>';
      html+='<td style="text-align:center;padding:8px 3px;color:'+C.sleepRem+'">'+fmt(avg(m.rem),0)+'m</td>';
      html+='</tr>';
    }
    html+='</table></div>'; return html;
  }

  function correlation(arr1, arr2) {
    if (arr1.length<5||arr1.length!==arr2.length) return null;
    var n=arr1.length, m1=avg(arr1), m2=avg(arr2);
    var num=0, d1=0, d2=0;
    for (var i=0;i<n;i++) { num+=(arr1[i]-m1)*(arr2[i]-m2); d1+=(arr1[i]-m1)*(arr1[i]-m1); d2+=(arr2[i]-m2)*(arr2[i]-m2); }
    return d1&&d2?num/Math.sqrt(d1*d2):null;
  }

  // ── Shared stat computations ───────────────────────────
  function _computeStats(rangeData) {
    var last7=rangeData.slice(-7), last14=rangeData.slice(-14), last30=rangeData.slice(-30);
    var today=rangeData.length?rangeData[rangeData.length-1]:{};
    var yesterday=rangeData.length>1?rangeData[rangeData.length-2]:{};
    var avgSleep7=avg(last7.filter(function(d){return d.sleep_hours;}).map(function(d){return d.sleep_hours;}));
    var avgSleep30=avg(last30.filter(function(d){return d.sleep_hours;}).map(function(d){return d.sleep_hours;}));
    var avgRHR7=avg(last7.filter(function(d){return d.resting_hr;}).map(function(d){return d.resting_hr;}));
    var avgRHR30=avg(last30.filter(function(d){return d.resting_hr;}).map(function(d){return d.resting_hr;}));
    var avgHRV7=avg(last7.filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;}));
    var avgHRV30=avg(last30.filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;}));
    var avgSteps7=avg(last7.filter(function(d){return d.steps;}).map(function(d){return d.steps;}));
    var bedtimes=rangeData.filter(function(d){return d.bedtime;}).map(function(d){var m=timeToMin(d.bedtime);return m<720?m+1440:m;});
    var sleepConsistency=bedtimes.length>=3?Math.max(0,100-Math.round(stddev(bedtimes)*2)):null;
    var sleepDebt=0; for (var sd=0;sd<last14.length;sd++) { if (last14[sd].sleep_hours) sleepDebt+=(7-last14[sd].sleep_hours); }
    function recoveryScore(d) {
      if (!d.hrv_avg&&!d.resting_hr&&!d.sleep_score) return null;
      var s=0,w=0;
      if (d.sleep_score){s+=d.sleep_score*0.4;w+=0.4;}
      if (d.hrv_avg&&avgHRV30){s+=Math.min(100,(d.hrv_avg/avgHRV30)*50)*0.35;w+=0.35;}
      if (d.resting_hr&&avgRHR30){s+=Math.min(100,(avgRHR30/d.resting_hr)*50)*0.25;w+=0.25;}
      return w>0?Math.round(s/w):null;
    }
    return { today:today, yesterday:yesterday, avgSleep7:avgSleep7, avgSleep30:avgSleep30,
             avgRHR7:avgRHR7, avgRHR30:avgRHR30, avgHRV7:avgHRV7, avgHRV30:avgHRV30,
             avgSteps7:avgSteps7, sleepConsistency:sleepConsistency, sleepDebt:sleepDebt,
             recoveryScore:recoveryScore(today) };
  }

  // ══════════════════════════════════════════════════════
  // TAB: SLEEP
  // ══════════════════════════════════════════════════════
  function _renderSleep(container, rangeData, allData, stats) {
    var today=stats.today, yesterday=stats.yesterday;
    var deepM=today.sleep_deep_min||0, remM=today.sleep_rem_min||0, coreM=today.sleep_core_min||0, awakeM=today.sleep_awake_min||0;
    var labels=rangeData.map(function(d){return d.date.substring(8);});

    var h='';

    // ── Today's sleep snapshot ──
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">TONIGHT\'S SLEEP — '+(today.date||'N/A')+'</div>';
    h+='<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">';
    h+='<div id="hs-donut" style="flex-shrink:0"></div>';
    h+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;flex:1">';
    var sc=[
      {l:'BEDTIME',v:today.bedtime||'—',c:C.bedtime}, {l:'WAKE UP',v:today.wake_time||'—',c:C.wake},
      {l:'DURATION',v:fmt(today.sleep_hours,1)+'h',c:C.sleep}, {l:'SCORE',v:fmt(today.sleep_score,0),c:scoreColor(today.sleep_score||0)},
      {l:'DEEP',v:fmt(deepM,0)+'m',c:C.sleepDeep}, {l:'REM',v:fmt(remM,0)+'m',c:C.sleepRem},
      {l:'CORE',v:fmt(coreM,0)+'m',c:C.sleepCore}, {l:'CONSISTENCY',v:stats.sleepConsistency!=null?stats.sleepConsistency+'%':'—',c:stats.sleepConsistency>=70?C.good:stats.sleepConsistency>=40?C.warn:C.bad}
    ];
    for (var si=0;si<sc.length;si++) {
      h+='<div style="background:'+C.cardBg+';border:1px solid '+C.cardBorder+';border-radius:8px;padding:10px;text-align:center">';
      h+='<div style="font:700 7px \'IBM Plex Mono\';color:'+sc[si].c+';letter-spacing:1.5px">'+sc[si].l+'</div>';
      h+='<div style="font:700 15px \'IBM Plex Mono\';color:'+C.textBright+';margin-top:3px">'+sc[si].v+'</div></div>';
    }
    h+='</div></div></div>';

    // ── Sleep Duration Chart ──
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    h+='<div class="panel-section-title" style="margin:0">SLEEP DURATION</div>';
    h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">7d: <span style="color:'+C.sleep+'">'+fmt(stats.avgSleep7,1)+'h</span> &middot; 30d: <span style="color:'+C.sleep+'">'+fmt(stats.avgSleep30,1)+'h</span></div>';
    h+='</div>';
    h+='<canvas id="hs-sleep-bars" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';

    // ── Sleep Score Trend ──
    var scoreData=rangeData.filter(function(d){return d.sleep_score;});
    if (scoreData.length>=3) {
      h+='<div class="panel-section" style="margin-bottom:20px">';
      h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
      h+='<div class="panel-section-title" style="margin:0">SLEEP QUALITY SCORE</div>';
      var avgSc=avg(scoreData.map(function(d){return d.sleep_score;}));
      h+='<div style="font:9px \'IBM Plex Mono\';color:'+scoreColor(avgSc)+'">avg: '+fmt(avgSc,0)+' / 100</div>';
      h+='</div>';
      h+='<canvas id="hs-score-chart" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';
    }

    // ── Sleep Debt 30-day Trend ──
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    h+='<div class="panel-section-title" style="margin:0">SLEEP DEBT TRACKER</div>';
    var debtColor=stats.sleepDebt>3?C.bad:stats.sleepDebt>1?C.warn:C.good;
    h+='<div style="font:700 11px \'IBM Plex Mono\';color:'+debtColor+'">'+(stats.sleepDebt>0?'+'+fmt(stats.sleepDebt,1)+'h DEFICIT':fmt(Math.abs(stats.sleepDebt),1)+'h SURPLUS')+'</div>';
    h+='</div>';
    h+='<canvas id="hs-debt-chart" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas>';
    h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:6px">Running sleep debt vs 7h/night target. Above zero line = in deficit.</div>';
    h+='</div>';

    // ── Bedtime & Wake Scatter ──
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">BEDTIME & WAKE PATTERN</div>';
    h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:10px"><span style="color:'+C.bedtime+'">&#9679; BEDTIME</span> &nbsp;&middot;&nbsp; <span style="color:'+C.wake+'">&#9679; WAKE UP</span></div>';
    h+='<canvas id="hs-bw-chart" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';

    // ── Weekly Patterns ──
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">WEEKLY PATTERNS</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">';
    h+='<div><div style="font:10px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:10px">SLEEP BY DAY</div>'+buildWeeklyPattern(rangeData,'sleep_hours',C.sleep,false)+'</div>';
    h+='<div><div style="font:10px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:10px">WAKE TIME BY DAY</div>'+buildWeeklyPattern(rangeData,'wake_time',C.wake,true)+'</div>';
    h+='</div></div>';

    container.innerHTML=h;

    // Canvas drawing
    setTimeout(function(){
      var cw=(container.offsetWidth||600)-2;

      drawDonut('hs-donut',
        [{value:deepM,color:C.sleepDeep,label:'Deep'},{value:coreM,color:C.sleepCore,label:'Core'},{value:remM,color:C.sleepRem,label:'REM'},{value:awakeM,color:C.sleepAwake,label:'Awake'}],
        fmt(today.sleep_hours,1)+'h','SLEEP');

      (function(){
        var vals=rangeData.map(function(d){return d.sleep_hours||0;});
        var ctx=getCtx('hs-sleep-bars',cw,160); if (!ctx) return;
        drawGradientBars(ctx,vals,C.sleep,cw,160,Math.max(10,Math.max.apply(null,vals)),{
          labels:labels, colorFn:function(v){return v>=7?C.good:v>=5?C.warn:C.bad;},
          targets:[{value:7,label:'7h goal',color:'rgba(0,230,118,0.35)'},{value:5,label:'5h min',color:'rgba(245,166,35,0.25)'}]});
      })();

      // Sleep Score Trend
      if (scoreData.length>=3) {
        (function(){
          var pts=scoreData.map(function(d){return d.sleep_score;});
          var slbls=scoreData.map(function(d){return d.date.substring(8);});
          var ctx=getCtx('hs-score-chart',cw,160); if (!ctx) return;
          drawSegmentLine(ctx,pts,scoreColor,cw,160,0,100,{gridLines:true,yAxis:true,labels:slbls,
            thresholds:[{value:70,label:'Good',color:'rgba(0,230,118,0.35)'},{value:40,label:'Fair',color:'rgba(245,166,35,0.25)'}]});
        })();
      }

      // Sleep Debt Chart
      (function(){
        var last30=rangeData.slice(-30);
        var running=0, pts=[], dlabels=[];
        for (var i=0;i<last30.length;i++) {
          if (last30[i].sleep_hours) running+=(7-last30[i].sleep_hours);
          pts.push(running); dlabels.push(last30[i].date.substring(8));
        }
        if (pts.length<2) return;
        var minV=Math.min.apply(null,pts)-0.5, maxV=Math.max.apply(null,pts)+0.5;
        var ctx=getCtx('hs-debt-chart',cw,130); if (!ctx) return;
        // Zero line
        var pad={t:15,b:28,l:40,r:8}, ch=130-pad.t-pad.b;
        var range=maxV-minV||1;
        var zeroY=pad.t+ch-((0-minV)/range)*ch;
        ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1; ctx.setLineDash([3,4]);
        ctx.beginPath(); ctx.moveTo(pad.l,zeroY); ctx.lineTo(cw-pad.r,zeroY); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle=C.text; ctx.font='8px "IBM Plex Mono"'; ctx.textAlign='right'; ctx.fillText('0',pad.l-4,zeroY+3);
        drawGradientLine(ctx,pts,stats.sleepDebt>0?C.bad:C.good,cw,130,minV,maxV,{gridLines:true,yAxis:true,decimals:1,labels:dlabels,showAvg:false});
      })();

      // Bedtime/wake scatter (same as before)
      (function(){
        var ctx=getCtx('hs-bw-chart',cw,220); if (!ctx) return;
        var pad={t:20,b:28,l:50,r:10}, cWidth=cw-pad.l-pad.r, cHeight=220-pad.t-pad.b;
        var filtered=rangeData.filter(function(d){return d.bedtime||d.wake_time;});
        if (!filtered.length) return;
        ctx.strokeStyle=C.grid; ctx.lineWidth=0.5;
        var gridTimes=[{m:1260,l:'21:00'},{m:1320,l:'22:00'},{m:1380,l:'23:00'},{m:1440,l:'00:00'},{m:1500,l:'01:00'}];
        for (var gt=0;gt<gridTimes.length;gt++){
          var gy=pad.t+(1-(gridTimes[gt].m-1200)/360)*(cHeight/2);
          ctx.beginPath();ctx.moveTo(pad.l,gy);ctx.lineTo(cw-pad.r,gy);ctx.stroke();
          ctx.fillStyle=C.text;ctx.font='9px "IBM Plex Mono"';ctx.textAlign='right';ctx.fillText(gridTimes[gt].l,pad.l-4,gy+3);
        }
        var wakeGrid=[{m:180,l:'03:00'},{m:240,l:'04:00'},{m:300,l:'05:00'},{m:360,l:'06:00'},{m:420,l:'07:00'}];
        for(var wg=0;wg<wakeGrid.length;wg++){
          var wy=pad.t+cHeight/2+10+((wakeGrid[wg].m-180)/300)*(cHeight/2-10);
          ctx.beginPath();ctx.moveTo(pad.l,wy);ctx.lineTo(cw-pad.r,wy);ctx.stroke();
          ctx.fillStyle=C.text;ctx.font='9px "IBM Plex Mono"';ctx.textAlign='right';ctx.fillText(wakeGrid[wg].l,pad.l-4,wy+3);
        }
        ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.setLineDash([4,4]);
        ctx.beginPath();ctx.moveTo(pad.l,pad.t+cHeight/2+5);ctx.lineTo(cw-pad.r,pad.t+cHeight/2+5);ctx.stroke();ctx.setLineDash([]);
        var bedPts=[],wakePts=[];
        for(var fi=0;fi<filtered.length;fi++){
          var fd=filtered[fi], fx=pad.l+(fi/(Math.max(1,filtered.length-1)))*cWidth;
          if(fd.bedtime){var bm=timeToMin(fd.bedtime);if(bm<720)bm+=1440;bedPts.push({x:fx,y:pad.t+(1-(bm-1200)/360)*(cHeight/2)});}
          if(fd.wake_time){var wm=timeToMin(fd.wake_time);wakePts.push({x:fx,y:pad.t+cHeight/2+10+((wm-180)/300)*(cHeight/2-10)});}
        }
        if(bedPts.length>1){ctx.strokeStyle=C.bedtime;ctx.lineWidth=1.5;ctx.globalAlpha=0.5;ctx.beginPath();for(var bi=0;bi<bedPts.length;bi++){if(bi===0)ctx.moveTo(bedPts[bi].x,bedPts[bi].y);else ctx.lineTo(bedPts[bi].x,bedPts[bi].y);}ctx.stroke();ctx.globalAlpha=1;}
        if(wakePts.length>1){ctx.strokeStyle=C.wake;ctx.lineWidth=1.5;ctx.globalAlpha=0.5;ctx.beginPath();for(var wi=0;wi<wakePts.length;wi++){if(wi===0)ctx.moveTo(wakePts[wi].x,wakePts[wi].y);else ctx.lineTo(wakePts[wi].x,wakePts[wi].y);}ctx.stroke();ctx.globalAlpha=1;}
        for(var fi2=0;fi2<filtered.length;fi2++){
          var fd2=filtered[fi2], fx2=pad.l+(fi2/(Math.max(1,filtered.length-1)))*cWidth;
          if(fd2.bedtime){var bm2=timeToMin(fd2.bedtime);if(bm2<720)bm2+=1440;var by=pad.t+(1-(bm2-1200)/360)*(cHeight/2);ctx.shadowColor=C.bedtime;ctx.shadowBlur=6;ctx.beginPath();ctx.arc(fx2,by,3.5,0,Math.PI*2);ctx.fillStyle=C.bedtime;ctx.fill();ctx.shadowBlur=0;}
          if(fd2.wake_time){var wm2=timeToMin(fd2.wake_time);var wy2=pad.t+cHeight/2+10+((wm2-180)/300)*(cHeight/2-10);ctx.shadowColor=C.wake;ctx.shadowBlur=6;ctx.beginPath();ctx.arc(fx2,wy2,3.5,0,Math.PI*2);ctx.fillStyle=C.wake;ctx.fill();ctx.shadowBlur=0;}
          if(fi2%Math.max(1,Math.floor(filtered.length/8))===0){ctx.fillStyle=C.text;ctx.font='8px "IBM Plex Mono"';ctx.textAlign='center';ctx.fillText(shortDate(fd2.date),fx2,220-4);}
        }
      })();
    }, 80);
  }

  // ══════════════════════════════════════════════════════
  // TAB: HEART
  // ══════════════════════════════════════════════════════
  function _renderHeart(container, rangeData, allData, stats) {
    var today=stats.today;
    var h='';

    // Recovery Ring + KPIs
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">TODAY\'S HEART VITALS</div>';
    h+='<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">';
    if (stats.recoveryScore!=null) {
      var rc=scoreColor(stats.recoveryScore);
      h+='<div style="text-align:center;flex-shrink:0">';
      h+='<svg width="110" height="110" viewBox="0 0 110 110">';
      h+='<circle cx="55" cy="55" r="46" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8"/>';
      h+='<circle cx="55" cy="55" r="46" fill="none" stroke="'+rc+'" stroke-width="8" stroke-dasharray="'+Math.round(stats.recoveryScore*2.89)+' 289" transform="rotate(-90 55 55)" stroke-linecap="round" style="filter:drop-shadow(0 0 8px '+rc+')"/>';
      h+='<text x="55" y="50" text-anchor="middle" fill="'+rc+'" font-size="26" font-weight="700" font-family="IBM Plex Mono">'+stats.recoveryScore+'</text>';
      h+='<text x="55" y="66" text-anchor="middle" fill="'+C.text+'" font-size="8" font-family="IBM Plex Mono" letter-spacing="2">RECOVERY</text>';
      h+='</svg></div>';
    }
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;flex:1">';
    var hKpis=[
      {l:'RESTING HR', v:fmt(today.resting_hr,0)+' bpm', s:'7d:'+fmt(stats.avgRHR7,0)+'  30d:'+fmt(stats.avgRHR30,0), c:C.hr},
      {l:'HRV', v:fmt(today.hrv_avg,0)+' ms', s:'7d:'+fmt(stats.avgHRV7,0)+'  30d:'+fmt(stats.avgHRV30,0), c:C.hrv},
      {l:'VO2 MAX', v:fmt(today.vo2_max,1), s:'Longevity index', c:C.vo2},
      {l:'SPO2', v:(spo2Val(today)?fmt(spo2Val(today),1)+'%':'—'), s:'Blood oxygen', c:C.spo2}
    ];
    for (var ki=0;ki<hKpis.length;ki++) {
      var kp=hKpis[ki];
      h+='<div style="background:'+C.cardBg+';border:1px solid '+C.cardBorder+';border-radius:10px;padding:12px;text-align:center">';
      h+='<div style="font:700 8px \'IBM Plex Mono\';color:'+kp.c+';letter-spacing:2px;margin-bottom:6px">'+kp.l+'</div>';
      h+='<div style="font:700 18px \'IBM Plex Mono\';color:'+C.textBright+'">'+kp.v+'</div>';
      h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:3px">'+kp.s+'</div>';
      h+='</div>';
    }
    h+='</div></div></div>';

    // RHR + HRV side by side
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">RESTING HEART RATE & HRV TREND</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
    h+='<div><div style="font:10px \'IBM Plex Mono\';color:'+C.hr+';margin-bottom:8px">RESTING HR — lower is better</div><canvas id="hh-rhr" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';
    h+='<div><div style="font:10px \'IBM Plex Mono\';color:'+C.hrv+';margin-bottom:8px">HRV — higher is better</div><canvas id="hh-hrv" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';
    h+='</div></div>';

    // VO2 Max
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">VO2 MAX — LONGEVITY INDEX</div>';
    h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:10px">VO2 Max tracks your overall aerobic fitness. This uses all historical data for a long-term trend view.</div>';
    h+='<canvas id="hh-vo2" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas>';
    // VO2 longevity benchmarks
    h+='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:10px">';
    [{l:'POOR',v:'<35',c:'rgba(255,82,82,0.5)'},{l:'FAIR',v:'35-42',c:'rgba(245,166,35,0.5)'},{l:'GOOD',v:'42-50',c:'rgba(0,212,255,0.4)'},{l:'GREAT',v:'50-58',c:'rgba(0,230,118,0.5)'},{l:'ELITE',v:'>58',c:'rgba(0,230,118,0.8)'}].forEach(function(b){
      h+='<div style="text-align:center;padding:6px 4px;background:'+b.c+';border-radius:4px"><div style="font:700 8px \'IBM Plex Mono\'">'+b.l+'</div><div style="font:9px \'IBM Plex Mono\'">'+b.v+'</div></div>';
    });
    h+='</div></div>';

    // SpO2
    var spo2Data=rangeData.filter(function(d){return spo2Val(d);});
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">BLOOD OXYGEN (SpO2)</div>';
    if (spo2Data.length>=2) {
      var avgSpo2=avg(spo2Data.map(function(d){return spo2Val(d);}));
      h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:10px">30-day avg: <span style="color:'+C.spo2+'">'+fmt(avgSpo2,1)+'%</span> — Normal range: 95-100%</div>';
      h+='<canvas id="hh-spo2" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas>';
    } else {
      h+='<div style="padding:28px;text-align:center;background:rgba(38,198,218,0.04);border:1px solid rgba(38,198,218,0.12);border-radius:10px">';
      h+='<div style="font-size:28px;margin-bottom:8px">🫁</div>';
      h+='<div style="font:11px \'IBM Plex Mono\';color:'+C.spo2+'">SpO2 data not detected</div>';
      h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:6px">Enable Blood Oxygen in Health Auto Export to see this chart</div>';
      h+='</div>';
    }
    h+='</div>';

    // RHR by day of week
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">HEART RATE WEEKLY PATTERN</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">';
    h+='<div><div style="font:10px \'IBM Plex Mono\';color:'+C.hr+';margin-bottom:8px">RHR BY DAY</div>'+buildWeeklyPattern(rangeData,'resting_hr',C.hr,false)+'</div>';
    h+='<div><div style="font:10px \'IBM Plex Mono\';color:'+C.hrv+';margin-bottom:8px">HRV BY DAY</div>'+buildWeeklyPattern(rangeData,'hrv_avg',C.hrv,false)+'</div>';
    h+='</div></div>';

    container.innerHTML=h;

    setTimeout(function(){
      var cw=(container.offsetWidth||600)-2, hw=Math.floor(cw/2)-10;

      // RHR
      (function(){
        var pts=rangeData.filter(function(d){return d.resting_hr;}).map(function(d){return d.resting_hr;});
        var lbls=rangeData.filter(function(d){return d.resting_hr;}).map(function(d){return d.date.substring(8);});
        if (pts.length>=2) { var ctx=getCtx('hh-rhr',hw,160); if(ctx) drawGradientLine(ctx,pts,C.hr,hw,160,Math.min.apply(null,pts)-3,Math.max.apply(null,pts)+3,{gridLines:true,yAxis:true,showAvg:true,labels:lbls}); }
      })();
      // HRV
      (function(){
        var pts=rangeData.filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;});
        var lbls=rangeData.filter(function(d){return d.hrv_avg;}).map(function(d){return d.date.substring(8);});
        if (pts.length>=2) { var ctx=getCtx('hh-hrv',hw,160); if(ctx) drawGradientLine(ctx,pts,C.hrv,hw,160,Math.min.apply(null,pts)-3,Math.max.apply(null,pts)+3,{gridLines:true,yAxis:true,showAvg:true,labels:lbls}); }
      })();
      // VO2 (all data)
      (function(){
        var vo2Data=allData.filter(function(d){return d.vo2_max;});
        var pts=vo2Data.map(function(d){return d.vo2_max;});
        var lbls=vo2Data.map(function(d){return shortDate(d.date);});
        if (pts.length>=2) { var ctx=getCtx('hh-vo2',cw,150); if(ctx) drawGradientLine(ctx,pts,C.vo2,cw,150,Math.min.apply(null,pts)-1,Math.max.apply(null,pts)+1,{gridLines:true,yAxis:true,showAvg:true,decimals:1,labels:lbls}); }
        else if (pts.length===1) { var el=document.getElementById('hh-vo2'); if(el) el.parentElement.innerHTML+='<div style="text-align:center;padding:20px;font:700 18px \'IBM Plex Mono\';color:'+C.vo2+'">'+fmt(pts[0],1)+' ml/kg/min</div>'; }
      })();
      // SpO2
      if (spo2Data.length>=2) {
        (function(){
          var pts=spo2Data.map(function(d){return spo2Val(d);});
          var lbls=spo2Data.map(function(d){return d.date.substring(8);});
          var ctx=getCtx('hh-spo2',cw,130); if(!ctx) return;
          var minV=Math.min.apply(null,pts)-0.5, maxV=Math.max.apply(null,pts)+0.5;
          drawGradientLine(ctx,pts,C.spo2,cw,130,Math.min(93,minV),Math.max(100,maxV),{gridLines:true,yAxis:true,decimals:1,labels:lbls,
            thresholds:[{value:95,label:'95% minimum',color:'rgba(245,166,35,0.4)'},{value:98,label:'98% target',color:'rgba(0,230,118,0.35)'}]});
        })();
      }
    }, 80);
  }

  // ══════════════════════════════════════════════════════
  // TAB: ACTIVITY
  // ══════════════════════════════════════════════════════
  function _renderActivity(container, rangeData, stats) {
    var today=stats.today;
    var labels=rangeData.map(function(d){return d.date.substring(8);});
    var avgSteps7=stats.avgSteps7;

    var h='';

    // Activity KPIs
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">TODAY\'S ACTIVITY</div>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">';
    var stepsData=rangeData.filter(function(d){return d.steps;});
    var calData=rangeData.filter(function(d){return d.active_calories;});
    var exData=rangeData.filter(function(d){return d.exercise_minutes;});
    var avgCal7=avg(rangeData.slice(-7).filter(function(d){return d.active_calories;}).map(function(d){return d.active_calories;}));
    var avgEx7=avg(rangeData.slice(-7).filter(function(d){return d.exercise_minutes;}).map(function(d){return d.exercise_minutes;}));
    [
      {l:'STEPS TODAY',    v:today.steps?today.steps.toLocaleString():'—',    s:'7d avg: '+fmt(avgSteps7,0), c:C.steps},
      {l:'ACTIVE CAL',     v:fmt(today.active_calories,0),                     s:'7d avg: '+fmt(avgCal7,0),  c:C.cal},
      {l:'EXERCISE MIN',   v:today.exercise_minutes?fmt(today.exercise_minutes,0)+'min':'—', s:'7d avg: '+fmt(avgEx7,0)+'min', c:C.exercise},
      {l:'10K STEP DAYS',  v:stepsData.filter(function(d){return d.steps>=10000;}).length+'', s:'out of '+stepsData.length+' logged', c:C.good}
    ].forEach(function(k){
      h+='<div style="background:'+C.cardBg+';border:1px solid '+C.cardBorder+';border-radius:10px;padding:12px;text-align:center">';
      h+='<div style="font:700 8px \'IBM Plex Mono\';color:'+k.c+';letter-spacing:2px;margin-bottom:6px">'+k.l+'</div>';
      h+='<div style="font:700 20px \'IBM Plex Mono\';color:'+C.textBright+'">'+k.v+'</div>';
      h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:3px">'+k.s+'</div>';
      h+='</div>';
    });
    h+='</div></div>';

    // Steps chart
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    h+='<div class="panel-section-title" style="margin:0">DAILY STEPS</div>';
    h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">7d avg: <span style="color:'+C.steps+'">'+fmt(avgSteps7,0)+'</span></div>';
    h+='</div>';
    h+='<canvas id="ha-steps" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';

    // Active Calories chart
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    h+='<div class="panel-section-title" style="margin:0">ACTIVE CALORIES</div>';
    h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">7d avg: <span style="color:'+C.cal+'">'+fmt(avgCal7,0)+' kcal</span></div>';
    h+='</div>';
    h+='<canvas id="ha-cal" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';

    // Exercise Minutes chart
    var exArr=rangeData.filter(function(d){return d.exercise_minutes;});
    if (exArr.length>=2) {
      h+='<div class="panel-section" style="margin-bottom:20px">';
      h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
      h+='<div class="panel-section-title" style="margin:0">EXERCISE MINUTES</div>';
      h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">7d avg: <span style="color:'+C.exercise+'">'+fmt(avgEx7,0)+'min</span></div>';
      h+='</div>';
      h+='<canvas id="ha-exercise" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';
    } else {
      h+='<div class="panel-section" style="margin-bottom:20px">';
      h+='<div style="padding:24px;text-align:center;background:rgba(224,64,251,0.04);border:1px solid rgba(224,64,251,0.12);border-radius:10px">';
      h+='<div style="font:11px \'IBM Plex Mono\';color:'+C.exercise+'">Exercise Minutes not yet synced</div>';
      h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:4px">Enable Exercise Minutes in Health Auto Export</div>';
      h+='</div></div>';
    }

    // Day of week patterns
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">WEEKLY ACTIVITY PATTERNS</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">';
    h+='<div><div style="font:10px \'IBM Plex Mono\';color:'+C.steps+';margin-bottom:8px">STEPS BY DAY</div>'+buildWeeklyPattern(rangeData,'steps',C.steps,false)+'</div>';
    h+='<div><div style="font:10px \'IBM Plex Mono\';color:'+C.cal+';margin-bottom:8px">CALORIES BY DAY</div>'+buildWeeklyPattern(rangeData,'active_calories',C.cal,false)+'</div>';
    h+='</div></div>';

    container.innerHTML=h;

    setTimeout(function(){
      var cw=(container.offsetWidth||600)-2;

      (function(){
        var stepsArr=rangeData.filter(function(d){return d.steps;});
        var vals=stepsArr.map(function(d){return d.steps||0;});
        var lbls=stepsArr.map(function(d){return d.date.substring(8);});
        var ctx=getCtx('ha-steps',cw,160); if(!ctx) return;
        drawGradientBars(ctx,vals,C.steps,cw,160,Math.max(15000,Math.max.apply(null,vals)),{labels:lbls,targets:[{value:10000,label:'10K target',color:'rgba(0,212,255,0.3)'}]});
      })();

      (function(){
        var calArr=rangeData.filter(function(d){return d.active_calories;});
        var vals=calArr.map(function(d){return d.active_calories||0;});
        var lbls=calArr.map(function(d){return d.date.substring(8);});
        var ctx=getCtx('ha-cal',cw,160); if(!ctx) return;
        drawGradientBars(ctx,vals,C.cal,cw,160,Math.max(600,Math.max.apply(null,vals)),{labels:lbls,targets:[{value:500,label:'500 kcal',color:'rgba(252,76,2,0.3)'}]});
      })();

      if (exArr.length>=2) {
        (function(){
          var vals=exArr.map(function(d){return d.exercise_minutes||0;});
          var lbls=exArr.map(function(d){return d.date.substring(8);});
          var ctx=getCtx('ha-exercise',cw,150); if(!ctx) return;
          drawGradientBars(ctx,vals,C.exercise,cw,150,Math.max(60,Math.max.apply(null,vals)),{
            labels:lbls, colorFn:function(v){return v>=30?C.good:v>=15?C.warn:C.exercise;},
            targets:[{value:30,label:'30min goal',color:'rgba(224,64,251,0.35)'}]});
        })();
      }
    }, 80);
  }

  // ══════════════════════════════════════════════════════
  // TAB: YEAR
  // ══════════════════════════════════════════════════════
  function _renderYear(container, allData) {
    var h='';
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">SLEEP HOURS — YEAR HEATMAP</div>';
    h+='<div id="hy-sleep"></div></div>';

    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">HRV — YEAR HEATMAP</div>';
    h+='<div id="hy-hrv"></div></div>';

    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">DAILY STEPS — YEAR HEATMAP</div>';
    h+='<div id="hy-steps"></div></div>';

    h+='<div class="panel-section">';
    h+='<div class="panel-section-title">MONTH-OVER-MONTH COMPARISON</div>';
    h+=buildMonthComparison(allData);
    h+='</div>';

    container.innerHTML=h;
    var avgHRV30a=avg(allData.slice(-30).filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;}));

    setTimeout(function(){
      drawHeatmap('hy-sleep',allData,function(d){if(!d.sleep_hours)return'rgba(255,255,255,0.03)';return d.sleep_hours>=7?'rgba(112,174,255,0.85)':d.sleep_hours>=6?'rgba(112,174,255,0.5)':d.sleep_hours>=5?'rgba(245,166,35,0.6)':'rgba(255,82,82,0.6)';},function(d){return d.sleep_hours?fmt(d.sleep_hours,1)+'h':'—';});
      drawHeatmap('hy-hrv',allData,function(d){if(!d.hrv_avg)return'rgba(255,255,255,0.03)';var r=avgHRV30a>0?d.hrv_avg/avgHRV30a:1;return r>=1.1?'rgba(0,230,118,0.85)':r>=0.9?'rgba(0,230,118,0.45)':r>=0.8?'rgba(245,166,35,0.6)':'rgba(255,82,82,0.6)';},function(d){return d.hrv_avg?fmt(d.hrv_avg,0)+'ms':'—';});
      drawHeatmap('hy-steps',allData,function(d){if(!d.steps)return'rgba(255,255,255,0.03)';return d.steps>=10000?'rgba(0,212,255,0.85)':d.steps>=7000?'rgba(0,212,255,0.55)':d.steps>=4000?'rgba(0,212,255,0.3)':'rgba(0,212,255,0.12)';},function(d){return d.steps?d.steps.toLocaleString():'—';});
    },80);
  }

  // ══════════════════════════════════════════════════════
  // TAB: INSIGHTS (Correlations + Health × Fortress)
  // ══════════════════════════════════════════════════════
  function _buildFortressPairs(rangeData) {
    var pairs=[];
    rangeData.forEach(function(d) {
      var brahma=null;
      try { brahma=JSON.parse(localStorage.getItem('fl_brahma_daily_'+d.date)||'null'); } catch(e) {}
      if (!brahma) return;
      var score=0;
      if (typeof FA_RULES!=='undefined') {
        FA_RULES.forEach(function(r){ if(r.getHeld(brahma)) score++; });
      } else {
        if(!brahma.porn&&!brahma.masturbate) score++;
        if(brahma.brahma_held&&!brahma.sexual) score++;
        if(brahma.device_free||brahma.phone_out) score++;
        if(brahma.stayed_out) score++;
        if(brahma.woke_3am) score++;
        if(brahma.journal_written) score++;
        if(brahma.food_rules) score++;
      }
      pairs.push({ date:d.date, hrv:d.hrv_avg, rhr:d.resting_hr, sleep:d.sleep_hours,
                   sleepScore:d.sleep_score, fortress:score });
    });
    return pairs;
  }

  function _renderInsights(container, rangeData, allData, stats) {
    var today=stats.today, yesterday=stats.yesterday;
    var h='';

    // ── Vitals Summary Strip ──
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">TODAY\'S VITALS — '+(today.date||'—')+'</div>';
    h+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">';
    [{l:'SLEEP',v:fmt(today.sleep_hours,1)+'h',c:C.sleep},{l:'RHR',v:fmt(today.resting_hr,0)+' bpm',c:C.hr},
     {l:'HRV',v:fmt(today.hrv_avg,0)+' ms',c:C.hrv},{l:'VO2 MAX',v:fmt(today.vo2_max,1),c:C.vo2},
     {l:'STEPS',v:today.steps?today.steps.toLocaleString():'—',c:C.steps},
     {l:'SLEEP DEBT',v:fmt(Math.abs(stats.sleepDebt),1)+'h',c:stats.sleepDebt>2?C.bad:stats.sleepDebt>0?C.warn:C.good}
    ].forEach(function(k){
      h+='<div style="background:'+C.cardBg+';border:1px solid '+C.cardBorder+';border-radius:10px;padding:12px;text-align:center">';
      h+='<div style="font:700 8px \'IBM Plex Mono\';color:'+k.c+';letter-spacing:2px;margin-bottom:6px">'+k.l+'</div>';
      h+='<div style="font:700 18px \'IBM Plex Mono\';color:'+C.textBright+'">'+k.v+'</div></div>';
    });
    h+='</div></div>';

    // ── Standard Correlations ──
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title">HEALTH CORRELATIONS</div>';
    h+='<div id="hi-corr" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"></div>';
    h+='</div>';

    // ── Health × Fortress Correlation ──
    var pairs=_buildFortressPairs(rangeData);
    h+='<div class="panel-section" style="margin-bottom:20px">';
    h+='<div class="panel-section-title" style="color:var(--brahma)">❤ × 🏰 HEALTH &times; FORTRESS CORRELATION</div>';
    h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:14px">How your physical health impacts your discipline — and vice versa.</div>';

    if (pairs.length < 5) {
      h+='<div style="padding:24px;text-align:center;background:rgba(255,68,68,0.04);border:1px solid rgba(255,68,68,0.12);border-radius:10px">';
      h+='<div style="font:11px \'IBM Plex Mono\';color:var(--brahma)">Need at least 5 days with both health & fortress data</div>';
      h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:6px">Log fortress daily and keep Health Auto Export syncing</div>';
      h+='</div>';
    } else {
      // HRV split
      var hrvPairs=pairs.filter(function(p){return p.hrv;});
      if (hrvPairs.length>=4) {
        var medHRV=median(hrvPairs.map(function(p){return p.hrv;}));
        var highHRV=hrvPairs.filter(function(p){return p.hrv>=medHRV;});
        var lowHRV=hrvPairs.filter(function(p){return p.hrv<medHRV;});
        var avgFHighHRV=avg(highHRV.map(function(p){return p.fortress;}));
        var avgFLowHRV=avg(lowHRV.map(function(p){return p.fortress;}));
        var diff=avgFHighHRV-avgFLowHRV;

        h+='<div style="background:rgba(0,230,118,0.04);border:1px solid rgba(0,230,118,0.1);border-radius:14px;padding:18px;margin-bottom:12px">';
        h+='<div style="font:700 10px \'IBM Plex Mono\';color:'+C.hrv+';letter-spacing:2px;margin-bottom:14px">HRV vs FORTRESS SCORE</div>';
        h+='<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center">';
        // High HRV
        h+='<div style="text-align:center;padding:16px;background:rgba(0,230,118,0.06);border:1px solid rgba(0,230,118,0.15);border-radius:10px">';
        h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:6px">HIGH HRV DAYS</div>';
        h+='<div style="font:700 8px \'IBM Plex Mono\';color:'+C.hrv+';margin-bottom:4px">≥ '+fmt(medHRV,0)+'ms median</div>';
        h+='<div style="font:700 32px \'IBM Plex Mono\';color:'+C.good+';line-height:1">'+fmt(avgFHighHRV,1)+'</div>';
        h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">/ 7 avg fortress</div>';
        h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.hrv+';margin-top:4px">'+highHRV.length+' days</div>';
        h+='</div>';
        // Arrow
        h+='<div style="text-align:center">';
        h+='<div style="font:700 18px \'IBM Plex Mono\';color:'+(diff>0?C.good:C.bad)+'">'+(diff>0?'↑':'↓')+'</div>';
        h+='<div style="font:700 14px \'IBM Plex Mono\';color:'+(diff>0?C.good:C.bad)+'">'+fmt(Math.abs(diff),1)+'</div>';
        h+='<div style="font:8px \'IBM Plex Mono\';color:'+C.text+'">pts diff</div>';
        h+='</div>';
        // Low HRV
        h+='<div style="text-align:center;padding:16px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.15);border-radius:10px">';
        h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:6px">LOW HRV DAYS</div>';
        h+='<div style="font:700 8px \'IBM Plex Mono\';color:'+C.hr+';margin-bottom:4px">< '+fmt(medHRV,0)+'ms median</div>';
        h+='<div style="font:700 32px \'IBM Plex Mono\';color:'+C.bad+';line-height:1">'+fmt(avgFLowHRV,1)+'</div>';
        h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">/ 7 avg fortress</div>';
        h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.hr+';margin-top:4px">'+lowHRV.length+' days</div>';
        h+='</div>';
        h+='</div>';
        h+='<div style="margin-top:12px;font:9px \'IBM Plex Mono\';color:'+C.text+';text-align:center">';
        if (Math.abs(diff)>=0.5) h+=(diff>0?'✓ Higher HRV correlates with stronger discipline — your body and mind move together.':'⚠ Fortress scores drop when HRV is low. Prioritize recovery to stay disciplined.');
        else h+='HRV and fortress scores are roughly equal on both high and low HRV days.';
        h+='</div></div>';
      }

      // Sleep split
      var slpPairs=pairs.filter(function(p){return p.sleep;});
      if (slpPairs.length>=4) {
        var highSleep=slpPairs.filter(function(p){return p.sleep>=7;});
        var lowSleep=slpPairs.filter(function(p){return p.sleep<6;});
        if (highSleep.length>=2&&lowSleep.length>=2) {
          var avgFHigh=avg(highSleep.map(function(p){return p.fortress;}));
          var avgFLow=avg(lowSleep.map(function(p){return p.fortress;}));
          var slpDiff=avgFHigh-avgFLow;

          h+='<div style="background:rgba(112,174,255,0.04);border:1px solid rgba(112,174,255,0.1);border-radius:14px;padding:18px;margin-bottom:12px">';
          h+='<div style="font:700 10px \'IBM Plex Mono\';color:'+C.sleep+';letter-spacing:2px;margin-bottom:14px">SLEEP DURATION vs FORTRESS SCORE</div>';
          h+='<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center">';
          h+='<div style="text-align:center;padding:16px;background:rgba(112,174,255,0.06);border:1px solid rgba(112,174,255,0.15);border-radius:10px">';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:4px">7+ HOURS SLEEP</div>';
          h+='<div style="font:700 32px \'IBM Plex Mono\';color:'+C.good+';line-height:1">'+fmt(avgFHigh,1)+'</div>';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">/ 7 avg fortress</div>';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.sleep+';margin-top:4px">'+highSleep.length+' nights</div>';
          h+='</div>';
          h+='<div style="text-align:center"><div style="font:700 18px \'IBM Plex Mono\';color:'+(slpDiff>0?C.good:C.bad)+'">'+(slpDiff>0?'↑':'↓')+'</div><div style="font:700 14px \'IBM Plex Mono\';color:'+(slpDiff>0?C.good:C.bad)+'">'+fmt(Math.abs(slpDiff),1)+'</div><div style="font:8px \'IBM Plex Mono\';color:'+C.text+'">pts diff</div></div>';
          h+='<div style="text-align:center;padding:16px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.15);border-radius:10px">';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:4px">UNDER 6 HOURS</div>';
          h+='<div style="font:700 32px \'IBM Plex Mono\';color:'+C.bad+';line-height:1">'+fmt(avgFLow,1)+'</div>';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">/ 7 avg fortress</div>';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.hr+';margin-top:4px">'+lowSleep.length+' nights</div>';
          h+='</div>';
          h+='</div>';
          h+='<div style="margin-top:12px;font:9px \'IBM Plex Mono\';color:'+C.text+';text-align:center">';
          if (Math.abs(slpDiff)>=0.5) h+=(slpDiff>0?'✓ More sleep = stronger fortress performance. Sleep is a discipline multiplier.':'Surprisingly, shorter sleep nights show equal or stronger discipline. Check your data.');
          else h+='Sleep duration shows no strong pattern with fortress score in this range.';
          h+='</div></div>';
        }
      }

      // Fortress vs Health correlation summary
      var hfCorr=correlation(pairs.map(function(p){return p.hrv||0;}),pairs.map(function(p){return p.fortress;}));
      var sfCorr=correlation(pairs.map(function(p){return p.sleep||0;}),pairs.map(function(p){return p.fortress;}));
      if (hfCorr!==null||sfCorr!==null) {
        h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">';
        if (hfCorr!==null) {
          h+='<div style="background:'+C.cardBg+';border:1px solid '+C.cardBorder+';border-radius:10px;padding:14px;text-align:center">';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:4px">HRV ↔ FORTRESS CORRELATION</div>';
          h+='<div style="font:700 22px \'IBM Plex Mono\';color:'+(Math.abs(hfCorr)>0.3?C.good:C.warn)+'">r = '+fmt(hfCorr,2)+'</div>';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:4px">'+(Math.abs(hfCorr)>0.5?'Strong link':Math.abs(hfCorr)>0.3?'Moderate link':'Weak link')+'</div>';
          h+='</div>';
        }
        if (sfCorr!==null) {
          h+='<div style="background:'+C.cardBg+';border:1px solid '+C.cardBorder+';border-radius:10px;padding:14px;text-align:center">';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-bottom:4px">SLEEP ↔ FORTRESS CORRELATION</div>';
          h+='<div style="font:700 22px \'IBM Plex Mono\';color:'+(Math.abs(sfCorr)>0.3?C.good:C.warn)+'">r = '+fmt(sfCorr,2)+'</div>';
          h+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:4px">'+(Math.abs(sfCorr)>0.5?'Strong link':Math.abs(sfCorr)>0.3?'Moderate link':'Weak link')+'</div>';
          h+='</div>';
        }
        h+='</div>';
      }
    }
    h+='</div>';

    container.innerHTML=h;

    // Standard correlations
    setTimeout(function(){
      var el=document.getElementById('hi-corr'); if (!el) return;
      var paired=rangeData.filter(function(d){return d.sleep_hours&&d.hrv_avg;});
      var slpHrv=correlation(paired.map(function(d){return d.sleep_hours;}),paired.map(function(d){return d.hrv_avg;}));
      var paired2=rangeData.filter(function(d){return d.sleep_hours&&d.resting_hr;});
      var slpRhr=correlation(paired2.map(function(d){return d.sleep_hours;}),paired2.map(function(d){return d.resting_hr;}));
      var paired3=rangeData.filter(function(d){return d.steps&&d.sleep_hours;});
      var stpSlp=correlation(paired3.map(function(d){return d.steps;}),paired3.map(function(d){return d.sleep_hours;}));
      var paired4=rangeData.filter(function(d){return d.hrv_avg&&d.resting_hr;});
      var hrvRhr=correlation(paired4.map(function(d){return d.hrv_avg;}),paired4.map(function(d){return d.resting_hr;}));

      var insights=[];
      if (slpHrv!=null) insights.push({icon:'💤❤',title:'Sleep ↔ HRV',value:'r = '+fmt(slpHrv,2),desc:slpHrv>0.3?'Strong: better sleep = higher HRV':slpHrv>0?'Weak positive correlation':'Negative — investigate',color:slpHrv>0.3?C.good:C.warn});
      if (slpRhr!=null) insights.push({icon:'💤♥',title:'Sleep ↔ Resting HR',value:'r = '+fmt(slpRhr,2),desc:slpRhr<-0.2?'More sleep = lower resting HR':'Weak correlation',color:slpRhr<-0.2?C.good:C.warn});
      if (stpSlp!=null) insights.push({icon:'👣💤',title:'Steps ↔ Sleep',value:'r = '+fmt(stpSlp,2),desc:stpSlp>0.2?'More active days = better sleep':'No strong link yet',color:stpSlp>0.2?C.good:C.text});
      if (hrvRhr!=null) insights.push({icon:'📊♥',title:'HRV ↔ Resting HR',value:'r = '+fmt(hrvRhr,2),desc:hrvRhr<-0.3?'Strong inverse — healthy sign':'Expected relationship weak',color:hrvRhr<-0.3?C.good:C.warn});

      var avgHRV30=avg(rangeData.slice(-30).filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;}));
      var sleepDebt=stats.sleepDebt;
      var sleepConsistency=stats.sleepConsistency;
      if (sleepDebt>3) insights.push({icon:'⚠️',title:'Sleep Debt Alert',value:fmt(sleepDebt,1)+'h deficit',desc:'Recovery is compromised. Prioritize earlier bedtime.',color:C.bad});
      else if (sleepDebt<-2) insights.push({icon:'✅',title:'Sleep Surplus',value:fmt(Math.abs(sleepDebt),1)+'h surplus',desc:'Well rested. Great recovery window.',color:C.good});
      if (sleepConsistency!=null) insights.push({icon:'🕐',title:'Bedtime Consistency',value:sleepConsistency+'%',desc:sleepConsistency>=70?'Consistent schedule — circadian rhythm healthy':'Irregular bedtimes hurt sleep quality',color:sleepConsistency>=70?C.good:C.warn});
      var vo2All=allData.filter(function(d){return d.vo2_max;}).map(function(d){return d.vo2_max;});
      if (vo2All.length>=10) {
        var vo2First=avg(vo2All.slice(0,5)), vo2Last=avg(vo2All.slice(-5));
        insights.push({icon:'🏆',title:'VO2 Max Trend',value:fmt(vo2Last,1)+' ('+changePct(vo2Last,vo2First)+')',desc:vo2Last>vo2First?'Fitness improving — great trajectory':'Fitness declining — increase cardio',color:vo2Last>=vo2First?C.good:C.warn});
      }

      var ih='';
      for (var ii=0;ii<insights.length;ii++) {
        var ins=insights[ii];
        ih+='<div style="background:'+C.cardBg+';border:1px solid '+C.cardBorder+';border-radius:10px;padding:14px">';
        ih+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:16px">'+ins.icon+'</span><span style="font:700 11px \'IBM Plex Mono\';color:'+C.textBright+'">'+ins.title+'</span></div>';
        ih+='<div style="font:700 18px \'IBM Plex Mono\';color:'+ins.color+';margin-bottom:4px">'+ins.value+'</div>';
        ih+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">'+ins.desc+'</div></div>';
      }
      el.innerHTML=ih||'<div style="font:11px \'IBM Plex Mono\';color:'+C.text+';grid-column:1/-1;text-align:center;padding:20px">Need at least 5 days of data for correlation analysis</div>';
    }, 80);
  }

  // ══════════════════════════════════════════════════════
  // MAIN RENDER — builds tab bar + dispatches
  // ══════════════════════════════════════════════════════
  function _getRangeData() {
    if (!_healthData.length) return [];
    var sorted=_healthData.slice().sort(function(a,b){return a.date<b.date?-1:1;});
    if (_viewRange>=9999) return sorted;
    var cutoff=new Date(); cutoff.setDate(cutoff.getDate()-_viewRange);
    var cutStr=cutoff.toISOString().substring(0,10);
    return sorted.filter(function(d){return d.date>=cutStr;});
  }

  function _renderActiveTab(contentEl, rangeData, allData) {
    var stats=_computeStats(rangeData);
    switch (_activeTab) {
      case 'sleep':    _renderSleep(contentEl, rangeData, allData, stats); break;
      case 'heart':    _renderHeart(contentEl, rangeData, allData, stats); break;
      case 'activity': _renderActivity(contentEl, rangeData, stats); break;
      case 'year':     _renderYear(contentEl, allData); break;
      case 'insights': _renderInsights(contentEl, rangeData, allData, stats); break;
      default:         _renderSleep(contentEl, rangeData, allData, stats);
    }
  }

  function renderHealthDashboard() {
    var container=document.getElementById('health-dashboard-content');
    if (!container) return;
    if (!_healthData.length) {
      container.innerHTML='<div style="text-align:center;padding:60px 20px;color:'+C.text+'"><div style="font-size:40px;margin-bottom:16px">❤</div><div style="font:13px \'IBM Plex Mono\'">No health data yet.<br>Configure Health Auto Export to start syncing.</div></div>';
      return;
    }
    var allData=_healthData.slice().sort(function(a,b){return a.date<b.date?-1:1;});
    var rangeData=_getRangeData();

    var TABS=[
      {k:'sleep',    icon:'💤', label:'SLEEP'},
      {k:'heart',    icon:'❤',  label:'HEART'},
      {k:'activity', icon:'⚡', label:'ACTIVITY'},
      {k:'year',     icon:'📅', label:'YEAR'},
      {k:'insights', icon:'🧠', label:'INSIGHTS'}
    ];

    var html='<div class="ht-bar">';
    TABS.forEach(function(t){
      html+='<button class="ht-tab'+(t.k===_activeTab?' active':'')+'" data-tab="'+t.k+'" onclick="switchHealthTab(\''+t.k+'\')"><span class="ht-tab-icon">'+t.icon+'</span><span class="ht-tab-label">'+t.label+'</span></button>';
    });
    html+='</div><div id="ht-content" style="padding-top:4px"></div>';
    container.innerHTML=html;

    _renderActiveTab(document.getElementById('ht-content'), rangeData, allData);
  }

  // ── DATA LOADING ──
  function loadHealthData() {
    if (typeof sbFetch!=='function') return;
    sbFetch('health_daily','GET',null,'?order=date.asc&limit=2000').then(function(data){
      _healthData=data&&data.length?data:[];
      _loaded=true;
      renderHealthDashboard();
    }).catch(function(e){ console.error('Health data load failed:',e); });
  }

  // ── EXPOSE GLOBALS ──
  window.loadHealthData=loadHealthData;
  window.switchHealthTab=function(tab){
    _activeTab=tab;
    document.querySelectorAll('.ht-tab').forEach(function(b){ b.classList.toggle('active',b.dataset.tab===tab); });
    var allData=_healthData.slice().sort(function(a,b){return a.date<b.date?-1:1;});
    var contentEl=document.getElementById('ht-content'); if (!contentEl) return;
    _renderActiveTab(contentEl,_getRangeData(),allData);
  };
  window.healthSetRange=function(days){
    _viewRange=days;
    document.querySelectorAll('.health-range-btn').forEach(function(b){ b.classList.toggle('active',parseInt(b.dataset.range)===days); });
    renderHealthDashboard();
  };

})();
