(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const h = (tag, attrs={}, children=[])=>{
    const el = document.createElement(tag);
    for(const [k,v] of Object.entries(attrs)){
      if(k==='style' && typeof v==='object') Object.assign(el.style, v);
      else if(k.startsWith('on') && typeof v==='function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    children.forEach(c=>el.append(c.nodeType?c:document.createTextNode(c)));
    return el;
  };

  let fuse = null, data = null, loaded = false;

  async function ensureIndex(){
    if(loaded) return;
    const meta = document.querySelector('meta[name="search-index"]');
    const url = meta ? meta.getAttribute('content') : '/index.json';
    try{
      const res = await fetch(url, {credentials:'omit'});
      data = await res.json();
      fuse = new Fuse(data, {
        keys: ['title','content','summary','params.eligibility','params.apply_year','section'],
        threshold: 0.32,
        ignoreLocation: true,
        minMatchCharLength: 2
      });
      loaded = true;
    }catch(e){ console.warn('Search index load failed', e); }
  }

  function buildUI(){
    // Floating button
    const btn = h('button', {id:'site-search-btn', 'aria-label':'Search this site', title:'Search (/) or Ctrl+K'}, ['🔎']);
    Object.assign(btn.style, {
      position:'fixed', bottom:'20px', right:'20px', width:'48px', height:'48px',
      borderRadius:'999px', border:'1px solid #d1d5db', background:'#111827', color:'#fff',
      cursor:'pointer', zIndex: 9999, fontSize:'20px', display:'flex', alignItems:'center', justifyContent:'center'
    });

    // Overlay + modal
    const overlay = h('div', {id:'site-search-overlay', role:'dialog', 'aria-modal':'true', 'aria-labelledby':'site-search-title'});
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', background:'rgba(0,0,0,.45)', display:'none',
      alignItems:'flex-start', justifyContent:'center', padding:'10vh 1rem', zIndex: 9998
    });

    const modal = h('div', {id:'site-search-modal'});
    Object.assign(modal.style, {
      maxWidth:'800px', width:'100%', background:'#fff', borderRadius:'12px',
      border:'1px solid #e5e7eb', boxShadow:'0 10px 30px rgba(0,0,0,.2)'
    });

    const header = h('div', {style:''}, [
      h('div', {style:''}, [
        h('h2', {id:'site-search-title', style:''}, ['Search this site'])
      ])
    ]);
    Object.assign(header.style, {display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.9rem 1rem', borderBottom:'1px solid #f3f4f6'});

    const close = h('button', {type:'button', 'aria-label':'Close search'}, ['✕']);
    Object.assign(close.style, {border:'none', background:'transparent', cursor:'pointer', fontSize:'18px'});
    close.addEventListener('click', hide);
    header.append(close);

    const inputWrap = h('div', {style:''});
    Object.assign(inputWrap.style, {padding:'0.75rem 1rem', borderBottom:'1px solid #f3f4f6'});
    const input = h('input', {type:'search', placeholder:'Search (try: scholarship sophomore, pickering, eligibility, deadline)', autocomplete:'off'});
    Object.assign(input.style, {width:'100%', padding:'0.7rem 0.85rem', border:'1px solid #d1d5db', borderRadius:'10px'});
    inputWrap.append(input);

    const results = h('div', {id:'site-search-results'});
    Object.assign(results.style, {maxHeight:'55vh', overflow:'auto', padding:'0.5rem 0'});

    modal.append(header, inputWrap, results);
    overlay.append(modal);

    function show(){ overlay.style.display='flex'; input.focus(); }
    function hide(){ overlay.style.display='none'; }

    function render(items, q){
      results.innerHTML = '';
      if(!items || items.length===0){
        results.append(h('div', {style:'padding:0.75rem 1rem; color:#6b7280;'}, ['No results. Try different keywords.']));
        return;
      }
      items.slice(0,12).forEach(r=>{
        const it = r.item || r;
        const url = it.relpermalink || it.permalink;
        const title = it.title || 'Untitled';
        const snippet = (it.summary || it.content || '').toString().split('\n')[0].slice(0,260);
        const row = h('a', {href:url}, [
          h('div', {style:''}, [
            h('div', {style:'font-weight:600;color:#111827;'}, [title]),
            h('div', {style:'color:#4b5563;font-size:.95rem;margin-top:2px;'}, [snippet])
          ])
        ]);
        Object.assign(row.style, {display:'block', padding:'0.65rem 1rem', textDecoration:'none', borderBottom:'1px solid #f3f4f6'});
        row.addEventListener('keydown', e=>{ if(e.key==='Escape'){ hide(); btn.focus(); }});
        results.append(row);
      });
    }

    async function doSearch(){
      const q = (input.value || '').trim();
      if(!q){ results.innerHTML=''; return; }
      await ensureIndex();
      if(!fuse){ render([], q); return; }
      const hits = fuse.search(q);
      render(hits, q);
    }

    input.addEventListener('input', ()=>{ // slight debounce
      clearTimeout(input.__t);
      input.__t = setTimeout(doSearch, 120);
    });

    document.body.append(btn, overlay);

    btn.addEventListener('click', async ()=>{ await ensureIndex(); show(); });

    overlay.addEventListener('click', e=>{ if(e.target === overlay) hide(); });
    document.addEventListener('keydown', e=>{
      // Global shortcuts: / to focus, Ctrl/Cmd+K to toggle
      const mod = e.ctrlKey || e.metaKey;
      if(e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA'){
        e.preventDefault(); ensureIndex().then(()=>{ overlay.style.display='flex'; input.focus(); });
      } else if(mod && (e.key.toLowerCase() === 'k')){
        e.preventDefault(); ensureIndex().then(()=>{
          if(overlay.style.display==='flex') hide(); else { overlay.style.display='flex'; input.focus(); }
        });
      } else if(e.key === 'Escape' && overlay.style.display==='flex'){
        hide(); btn.focus();
      }
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
