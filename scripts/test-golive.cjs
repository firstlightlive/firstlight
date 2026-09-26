// GO-LIVE CHECK — what every public surface renders on the gap day (26 Sep)
// versus Day 1 (27 Sep). Answers one question: if this deploys, does the site
// print the right day number everywhere, and does it degrade gracefully in the
// hours before Day 1 opens?
const fs = require('fs'); const http = require('http'); const path = require('path');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '../website');
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const cors = {'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,prefer','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};

const server = http.createServer((req,res)=>{
  const pn = decodeURIComponent(new URL(req.url,'http://l').pathname);
  const f = path.resolve(root,'.'+pn);
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});

const PAGES = ['index.html','rules.html','discipline.html','daily-sheet.html','punch.html','food.html','accountability.html','app/index.html'];

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
  const results={};
  try{
    for(const iso of ['2026-09-26T12:00:00+05:30','2026-09-27T06:30:00+05:30']){
      const label=iso.slice(0,10);
      results[label]={};
      for(const pg of PAGES){
        const page=await browser.newPage();
        const errs=[];
        page.on('pageerror',e=>errs.push(e.message.slice(0,90)));
        await page.setViewport({width:390,height:844});
        await page.setBypassServiceWorker(true);
        await page.evaluateOnNewDocument(fx=>{
          const N=Date;const at=new N(fx).getTime();
          class T extends N{constructor(...a){super(...(a.length?a:[at]));}static now(){return at;}}
          window.Date=T;
        },iso);
        await page.setRequestInterception(true);
        page.on('request',rq=>{
          const u=rq.url();
          if(!/supabase\.co|googleapis\.com|gstatic\.com|mapbox/.test(u)){rq.continue();return;}
          if(rq.method()==='OPTIONS'){rq.respond({status:204,headers:cors,body:''});return;}
          if(u.includes('/auth/v1/user')){rq.respond({status:200,headers:cors,body:JSON.stringify({email:'firstlightlive@gmail.com'})});return;}
          rq.respond({status:200,headers:cors,body:'[]'});
        });
        await page.goto(base+'/404.html',{waitUntil:'domcontentloaded'});
        await page.evaluate(()=>{
          try{localStorage.clear();sessionStorage.clear();}catch(e){}
          localStorage.setItem('fl_supabase_session',JSON.stringify({access_token:'t',refresh_token:'r',expires_at:4102444800,user:{email:'firstlightlive@gmail.com'}}));
          localStorage.setItem('fl_rules_owner','1');
          sessionStorage.setItem('fl_unlock_session',JSON.stringify({until:4102444800000}));
        });
        try{
          await page.goto(base+'/'+pg,{waitUntil:'domcontentloaded',timeout:15000});
          await new Promise(r=>setTimeout(r,900));
          const info=await page.evaluate(async()=>{
            const txt=document.body.innerText||'';
            const days=[...new Set((txt.match(/\bDAY\s+-?\d+\b/gi)||[]).map(s=>s.toUpperCase().replace(/\s+/g,' ')))];
            // scrollWidth alone is a FALSE POSITIVE: a page with
            // body{overflow-x:hidden} reports a wide scrollWidth while being
            // visually clipped and not scrollable at all. accountability.html
            // read 258px of "overflow" that a user could never feel. What
            // matters is whether the page actually moves, so try to scroll it.
            window.scrollTo(400,0);
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            const moved=Math.round(window.scrollX||document.documentElement.scrollLeft||0);
            window.scrollTo(0,0);
            return {
              days,
              negative:/DAY\s+-\d/i.test(txt),
              nan:/NaN|undefined|Infinity/.test(txt),
              overflow:moved,
              reported:document.documentElement.scrollWidth-innerWidth,
              len:txt.trim().length
            };
          });
          results[label][pg]={...info,errs};
        }catch(e){ results[label][pg]={fatal:e.message.slice(0,70),errs}; }
        await page.close();
      }
    }
  } finally { await browser.close(); server.close(); }

  let bad=0;
  for(const d of Object.keys(results)){
    process.stdout.write(`\n══ ${d} ${d==='2026-09-26'?'(gap day — Day 1 is tomorrow)':'(DAY 1 — go-live)'}\n`);
    for(const pg of PAGES){
      const r=results[d][pg];
      if(r.fatal){ console.log(`  ✘ ${pg.padEnd(20)} FAILED TO LOAD: ${r.fatal}`); bad++; continue; }
      const flags=[];
      if(r.negative){flags.push('NEGATIVE DAY');bad++;}
      if(r.nan){flags.push('NaN/undefined');bad++;}
      // >2px of genuine movement is a real sideways scroll on a phone.
      if(r.overflow>2){flags.push('SCROLLS '+r.overflow+'px sideways');bad++;}
      else if(r.reported>2){flags.push('(clipped '+r.reported+'px — not user-visible)');}
      if(r.errs.length){flags.push('JS: '+r.errs[0]);bad++;}
      if(r.len<40){flags.push('near-empty render');}
      const mark=flags.length?'✘':'✓';
      console.log(`  ${mark} ${pg.padEnd(20)} ${(r.days.join(' | ')||'(no day text)').padEnd(22)} ${flags.join(' · ')}`);
    }
  }
  console.log('\n'+(bad?`✘ ${bad} problem(s)`:'✓ no negative days, no NaN, no JS errors, no overflow'));
  process.exit(bad?1:0);
})().catch(e=>{console.error(e);server.close();process.exit(1);});
