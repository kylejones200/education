(function(){
  const $ = (s, el=document)=>el.querySelector(s);
  const $$ = (s, el=document)=>[...el.querySelectorAll(s)];
  function h(tag, props={}, children=[]) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k,v])=>{
      if(k==='style' && typeof v==='object') Object.assign(el.style, v);
      else if(k.startsWith('on') && typeof v==='function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    });
    children.forEach(c=>el.append(c.nodeType?c:document.createTextNode(c)));
    return el;
  }

  async function loadIndex(url){
    const res = await fetch(url, {credentials:'omit'}).catch(()=>null);
    if(!res || !res.ok) return [];
    return res.json();
  }

  function passageFromContent(text, query){
    if(!text) return '';
    const q = (query||'').toLowerCase().split(/\s+/).filter(Boolean);
    const lines = text.split(/\n+/);
    const hit = lines.find(l=>q.every(w=>l.toLowerCase().includes(w)));
    return hit || lines[0] || '';
  }

  async function main(){
    const root = $('.ask-widget');
    if(!root) return;
    const input = $('#ask-input', root);
    const btn = $('#ask-btn', root);
    const out = $('#ask-results', root);

    const indexUrl = root.getAttribute('data-index') || '/index.json';
    const idx = await loadIndex(indexUrl);
    const fuse = new Fuse(idx, {
      keys: ['title','content','summary','params.eligibility','params.apply_year','section'],
      threshold: 0.3,
      ignoreLocation: true,
      minMatchCharLength: 2
    });

    function render(results, q){
      out.innerHTML='';
      if(!results || results.length===0){
        out.append(h('div', {}, ['No results found. Try different keywords.']));
        return;
      }
      results.slice(0,8).forEach(r=>{
        const item = r.item || r;
        const p = passageFromContent(item.content || item.summary, q);
        const card = h('div', {class:'ask-card', style:{border:'1px solid #e5e7eb',borderRadius:'10px',padding:'0.75rem',background:'#fff'}}, [
          h('a', {href:item.relpermalink || item.permalink, style:{fontWeight:'600',textDecoration:'none',color:'#111827'}}, [item.title || 'Untitled']),
          h('div', {style:{color:'#4b5563',fontSize:'.95rem',marginTop:'.35rem'}}, [p])
        ]);
        out.append(card);
      });
    }

    function run(){
      const q = (input.value||'').trim();
      if(!q){ out.innerHTML=''; return; }
      const res = fuse.search(q);
      render(res, q);
    }

    btn.addEventListener('click', run);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ run(); }});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
