// The covenant record + Punishment Cycle ledger must survive one device.
// Until 2026-09-26 both lived in localStorage only. These checks prove the
// Supabase mirror works, that offline logging is never lost, and — most
// importantly — that a merge can never delete a payment already made.
const fs=require('fs'), http=require('http'), path=require('path'), puppeteer=require('puppeteer');
const root=path.resolve(__dirname,'../website');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,prefer','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','content-type':'application/json'};
let passed=0;
function check(ok,msg){ if(!ok) throw new Error(msg); passed++; process.stdout.write('  ✓ '+msg+'\n'); }

const server=http.createServer((q,r)=>{
  const pn=decodeURIComponent(new URL(q.url,'http://l').pathname);
  const f=path.resolve(root,'.'+pn);
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){r.writeHead(404);r.end();return;}
  r.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(r);
});

let SERVER_ROWS=[];      // what discipline_log holds server-side
let WRITES=[];
let OFFLINE=false;

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});

  async function page(iso, opts){
    opts=opts||{};
    const p=await browser.newPage();
    await p.setViewport({width:390,height:900});
    await p.setBypassServiceWorker(true);
    await p.evaluateOnNewDocument((fx,off)=>{
      const N=Date; const at=new N(fx).getTime();
      class T extends N{constructor(...a){super(...(a.length?a:[at]));}static now(){return at;}}
      window.Date=T;
      if(off) Object.defineProperty(window.navigator,'onLine',{get:()=>false,configurable:true});
    }, iso, !!opts.offline);
    await p.setRequestInterception(true);
    p.on('request',rq=>{
      const u=rq.url(), m=rq.method();
      if(!/supabase\.co|googleapis|gstatic|mapbox/.test(u)){rq.continue();return;}
      if(m==='OPTIONS'){rq.respond({status:204,headers:cors,body:''});return;}
      if(OFFLINE){rq.abort('internetdisconnected');return;}
      if(u.includes('/auth/v1/user')){rq.respond({status:200,headers:cors,body:JSON.stringify({email:'firstlightlive@gmail.com'})});return;}
      if(u.includes('/rest/v1/discipline_log')){
        if(m==='GET'){rq.respond({status:200,headers:cors,body:JSON.stringify(SERVER_ROWS)});return;}
        let row=null; try{row=JSON.parse(rq.postData());}catch(e){}
        if(row){ WRITES.push(row);
          SERVER_ROWS=SERVER_ROWS.filter(x=>!(x.date===row.date&&x.kind===row.kind)).concat([row]); }
        rq.respond({status:201,headers:cors,body:'[]'});return;
      }
      if(m!=='GET') WRITES.push({url:u});
      rq.respond({status:200,headers:cors,body:'[]'});
    });
    await p.goto(base+'/404.html',{waitUntil:'domcontentloaded'});
    await p.evaluate(()=>{
      try{localStorage.clear();sessionStorage.clear();}catch(e){}
      localStorage.setItem('fl_supabase_session',JSON.stringify({access_token:'t',refresh_token:'r',expires_at:4102444800,user:{email:'firstlightlive@gmail.com'}}));
      localStorage.setItem('fl_rules_owner','1');
      sessionStorage.setItem('fl_unlock_session',JSON.stringify({until:4102444800000}));
    });
    return p;
  }

  try{
    const TODAY='2026-09-28T20:00:00+05:30';   // Day 2 of the run

    // ═══ 1. logging a day reaches Supabase ═══════════════════════
    process.stdout.write('\nDISCIPLINE — the record leaves the device\n');
    SERVER_ROWS=[]; WRITES=[]; OFFLINE=false;
    const p1=await page(TODAY);
    const errs=[]; p1.on('pageerror',e=>errs.push(e.message.slice(0,90)));
    await p1.goto(base+'/discipline.html',{waitUntil:'domcontentloaded'});
    await new Promise(r=>setTimeout(r,1200));
    check(errs.length===0,'discipline.html loads with no JS errors'+(errs.length?': '+errs[0]:''));
    check(await p1.evaluate(()=>typeof window.FLDisc==='object'),'the sync module is present');
    check(await p1.evaluate(()=>typeof FL.upsert==='function'),'the offline runtime is loaded (queue available)');

    await p1.evaluate(async()=>{
      document.getElementById('logBtn').click();
      await new Promise(r=>setTimeout(r,500));
    });
    const dayWrites=WRITES.filter(w=>w.kind==='day');
    check(dayWrites.length>0,'logging the day writes a discipline_log row');
    check(dayWrites.some(w=>w.date==='2026-09-28'),'the row carries the right date');
    check(dayWrites.some(w=>w.data&&w.data.logged===true),'the row records that the day was logged');
    check(dayWrites.some(w=>w.data&&w.data._ts),'the entry is timestamped so last-write-wins can resolve');
    check(dayWrites.some(w=>w.data&&w.data.penance),'the penance owed is persisted, not just the marks');

    // a payment against the ledger
    WRITES=[];
    await p1.evaluate(async()=>{
      document.getElementById('clC').value='30';
      document.getElementById('clearBtn').click();
      await new Promise(r=>setTimeout(r,400));
    });
    const cl=WRITES.filter(w=>w.kind==='cleared');
    check(cl.length>0,'recording a payment writes the cleared ledger');
    check(cl.some(w=>Number(w.data.cycle)===30),'the paid km are persisted');
    await p1.close();

    // ═══ 2. offline logging is not lost ══════════════════════════
    process.stdout.write('\nDISCIPLINE — offline\n');
    SERVER_ROWS=[]; WRITES=[]; OFFLINE=true;
    const p2=await page(TODAY,{offline:true});
    await p2.goto(base+'/discipline.html',{waitUntil:'domcontentloaded'});
    await new Promise(r=>setTimeout(r,1000));
    const off=await p2.evaluate(async()=>{
      document.getElementById('logBtn').click();
      await new Promise(r=>setTimeout(r,400));
      return JSON.parse(localStorage.getItem('fl_ch4_log')||'{}');
    });
    check(off['2026-09-28']&&off['2026-09-28'].logged===true,'a day logged with no network is still recorded locally');
    check(!!off['2026-09-28']._ts,'it is timestamped, so it can merge correctly when it syncs');
    const snap=await p2.evaluate(()=>JSON.parse(localStorage.getItem('fl_disc_synced')||'{}'));
    check(!snap['2026-09-28'],'it is NOT marked as synced — the retry will pick it up');
    await p2.close();

    // ═══ 3. the merge must never delete a payment ════════════════
    process.stdout.write('\nDISCIPLINE — merge safety (a paid ride is never erased)\n');
    OFFLINE=false; WRITES=[];
    // Server says 120 km of cycle paid; this device only knows about 30.
    SERVER_ROWS=[
      {date:'2026-09-27',kind:'cleared',data:{cycle:120,run:10,walk:5},updated_at:'2026-09-27T10:00:00Z'},
      {date:'2026-09-27',kind:'day',data:{logged:true,wake:true,workout:true,penance:{cycle:0,run:0,walk:0},_ts:'2026-09-27T23:00:00Z'},updated_at:'2026-09-27T23:00:00Z'}
    ];
    const p3=await page(TODAY);
    await p3.evaluate(()=>{
      localStorage.setItem('fl_ch6_cleared_2026-09-27',JSON.stringify({cycle:30,run:0,walk:0}));
      localStorage.setItem('fl_ch4_log',JSON.stringify({}));
    });
    await p3.goto(base+'/discipline.html',{waitUntil:'domcontentloaded'});
    await new Promise(r=>setTimeout(r,1500));
    const merged=await p3.evaluate(()=>({
      cleared:JSON.parse(localStorage.getItem('fl_ch6_cleared_2026-09-27')||'{}'),
      log:JSON.parse(localStorage.getItem('fl_ch4_log')||'{}')
    }));
    check(Number(merged.cleared.cycle)===120,'the LARGER paid total wins (120 km, not the local 30)');
    check(Number(merged.cleared.run)===10,'every component is merged, not just the first');
    check(!!merged.log['2026-09-27'],'a day this device never saw is pulled in from the server');
    check(merged.log['2026-09-27'].logged===true,'the pulled day keeps its marks');

    // And the reverse: a LOCAL total larger than the server is not downgraded.
    SERVER_ROWS=[{date:'2026-09-27',kind:'cleared',data:{cycle:5,run:0,walk:0},updated_at:'2026-09-27T10:00:00Z'}];
    const p4=await page(TODAY);
    await p4.evaluate(()=>localStorage.setItem('fl_ch6_cleared_2026-09-27',JSON.stringify({cycle:200,run:0,walk:0})));
    await p4.goto(base+'/discipline.html',{waitUntil:'domcontentloaded'});
    await new Promise(r=>setTimeout(r,1400));
    const keptLocal=await p4.evaluate(()=>JSON.parse(localStorage.getItem('fl_ch6_cleared_2026-09-27')||'{}'));
    check(Number(keptLocal.cycle)===200,'a stale server total never downgrades a larger local one');
    await p3.close(); await p4.close();

    // ═══ 4. still fits a phone ═══════════════════════════════════
    const p5=await page(TODAY);
    await p5.goto(base+'/discipline.html',{waitUntil:'domcontentloaded'});
    await new Promise(r=>setTimeout(r,900));
    const ovf=await p5.evaluate(async()=>{
      window.scrollTo(400,0);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const m=Math.round(window.scrollX||0); window.scrollTo(0,0); return m;
    });
    check(ovf<=2,'discipline.html does not scroll sideways on a 390px phone');
    await p5.close();

    process.stdout.write('\n'+passed+'/'+passed+' discipline sync checks passed\n');
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error('\n✗ '+e.message);server.close();process.exit(1);});
