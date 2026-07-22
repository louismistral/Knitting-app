// Maille — version "Organic" (design importé depuis Claude Design).
// Portage fidèle du prototype Maille.dc.html : le template {{ }}/sc-for/sc-if
// est réécrit en htm + Preact. Données et auth via Supabase (projet dédié
// "maille-organic") : chaque utilisateur a son propre compte email/mot de
// passe et ne voit que ses propres données (RLS Postgres).
import { h, Component, render } from './vendor/preact.module.js';
import htm from './vendor/htm.module.js';
import { supabase } from './supabaseClient.js';
const html = htm.bind(h);

class App extends Component {
  constructor(props){
    super(props);
    this.state = {
      // ---- auth ----
      sessionChecked:false, session:null,
      authMode:'signin', authEmail:'', authPassword:'', authError:'', authBusy:false,
      // ---- data ----
      loaded:false,
      stash:[], patterns:[], projects:[], needles:[], signedUrls:{},
      // ---- UI ----
      zone:'home',
      expandedYarn:null,
      yarnDialog:false, yarnDraft:this.blankYarn(), yarnEditId:null,
      cwDraft:{color:'',hex:'#c67139',dyeLot:'',grams:'',photo:''}, cwFor:null,
      editingCw:null, cwEditDraft:null, cwEditOrigPhoto:'',
      manageBrands:false, newBrand:'',
      editingProject:null, projectDraft:null, projectDraftInitial:null,
      allocPick:{colorwayId:'',grams:''}, needlePick:'', patternPick:'', previewPatternId:null,
      patternDialog:false, patternDraft:this.blankPattern(), patternEditId:null,
      tagPrompt:null,         // {kind:'category'|'author', value}
      // ---- needle stash ----
      needleDialog:false, needleDraft:this.blankNeedle(), needleEditId:null,
      manageSizes:false, newSize:'',
      // ---- taxonomies + profil (stockés dans user_metadata) ----
      categories:[], authors:[], needleSizes:[], brands:[], displayName:'', avatarPath:'',
      manageTax:false, newCategory:'', newAuthor:'',
      editingName:false, nameDraft:'',
      // ---- garde-fou navigation ----
      pendingNav:null,
      // ---- primitives Phase 1 : confirmation & filtres ----
      confirm:null,           // {title,message,confirmLabel,onConfirm}
      filters:{}, filterOpen:{},
      // ---- glisser-déposer des photos de projet (Phase 5c) ----
      dragPhoto:null,         // {idx,key,w,h,grabX,grabY,x,y,url}
      // ---- ajustement des grammes dispo par addition/soustraction ----
      gramsAdjust:{},         // {[cwId]: {sign:'+'|'-', value}}
    };
    this._loadingData=false;
    this._flipFirst=null;   // rects « First » pour l'animation FLIP des vignettes
  }
  blankYarn(){ return {brand:'',name:'',mps:'',gps:'',blend:'',color:'',hex:'#c67139',dyeLot:'',grams:'',photo:''}; }
  blankPattern(){ return {name:'',category:'Pull',author:'',path:'',fileName:'',kind:''}; }
  blankNeedle(){ return {brand:'',size:'',length:'',interchangeable:false}; }
  standardSizes(){ return [2,2.25,2.5,2.75,3,3.25,3.5,3.75,4,4.5,5,5.5,6,6.5,7,8,9,10,12,15,20].map(String); }
  today(){ return new Date().toISOString().slice(0,10); }

  // ══════════════════════════════════════════════════════════════════
  // Primitives UI réutilisables (Phase 1)
  // ══════════════════════════════════════════════════════════════════

  // Bouton « + <texte> » en pointillé.
  addBtn(label,onClick,extraStyle){ return html`<button class="btn-add" style=${extraStyle||''} onClick=${onClick}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>${label}</button>`; }
  // Variante « + <texte> » en pointillé pour déclencher un input file (ex. ajout de photo).
  addFileBtn(label,onChange,extraStyle){ return html`<label class="btn-add" style=${'cursor:pointer;'+(extraStyle||'')}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>${label}<input type="file" accept="image/*" onChange=${onChange} style="display:none"/></label>`; }

  // ---- markdown minimal fait main (gras, italique, titres, listes) ----
  mdInline(text){ const parts=[]; let rest=text; let key=0;
    const re=/(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/;
    while(rest.length){
      const m=re.exec(rest);
      if(!m){ parts.push(rest); break; }
      if(m.index>0) parts.push(rest.slice(0,m.index));
      if(m[1]!==undefined) parts.push(h('strong',{key:key++},m[2]));
      else parts.push(h('em',{key:key++},m[4]));
      rest=rest.slice(m.index+m[0].length);
    }
    return parts; }
  renderMarkdown(text){ if(!text||!text.trim()) return null;
    const blocks=[]; let listBuf=null; let key=0;
    const flushList=()=>{ if(listBuf){ blocks.push(h('ul',{key:key++,style:'margin:0 0 10px 18px;padding:0'},listBuf.map((li,i)=>h('li',{key:i,style:'margin-bottom:4px'},this.mdInline(li))))); listBuf=null; } };
    text.split('\n').forEach(line=>{
      const l=line.trim();
      if(l===''){ flushList(); return; }
      const m3=/^###\s+(.*)/.exec(l), m2=/^##\s+(.*)/.exec(l), m1=/^#\s+(.*)/.exec(l), li=/^[-*]\s+(.*)/.exec(l);
      if(m3){ flushList(); blocks.push(h('div',{key:key++,style:'font-family:var(--font-heading);font-size:14px;margin:10px 0 4px'},this.mdInline(m3[1]))); }
      else if(m2){ flushList(); blocks.push(h('div',{key:key++,style:'font-family:var(--font-heading);font-size:16px;margin:12px 0 6px'},this.mdInline(m2[1]))); }
      else if(m1){ flushList(); blocks.push(h('div',{key:key++,style:'font-family:var(--font-heading);font-size:19px;margin:14px 0 8px'},this.mdInline(m1[1]))); }
      else if(li){ if(!listBuf) listBuf=[]; listBuf.push(li[1]); }
      else { flushList(); blocks.push(h('div',{key:key++,style:'margin-bottom:6px;line-height:1.5'},this.mdInline(l))); }
    });
    flushList();
    return blocks; }

  // Rond de couleur plein cliquable (ouvre le sélecteur natif au clic).
  // Si `photoUrl`, une photo circulaire recouvre le rond en aperçu (la couleur
  // reste éditable en dessous : l'overlay laisse passer les clics).
  colorDot(hex,onChange,size,photoUrl){ const s=size||34;
    return html`<label style="display:inline-block;position:relative;width:${s}px;height:${s}px;border-radius:50%;background:${hex};box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.12);cursor:pointer;flex:none">
      <input type="color" value=${hex} onInput=${onChange} style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:none;padding:0"/>
      ${photoUrl?html`<span style=${`position:absolute;inset:0;border-radius:50%;background-image:url(${photoUrl});background-size:cover;background-position:center;box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.12);pointer-events:none`}></span>`:null}
    </label>`; }

  // Bloc « Couleur + photo » d'un coloris : rond de couleur (avec aperçu photo
  // en overlay si présent) + bouton d'ajout/remplacement + suppression de photo.
  cwColorPhoto(hex,onHex,photo,photoUrl,onPhoto,onRemove){
    return html`<div style="display:flex;align-items:center;gap:8px">
      ${this.colorDot(hex,onHex,44,photoUrl)}
      <div style="display:flex;flex-direction:column;gap:3px">
        <label class="btn btn-icon btn-secondary" style="width:28px;height:28px;cursor:pointer;padding:0" title=${photo?'Remplacer la photo':'Ajouter une photo'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <input type="file" accept="image/*" onChange=${onPhoto} style="display:none"/>
        </label>
        ${photo?html`<button class="btn btn-icon btn-ghost" style="width:28px;height:28px" onClick=${onRemove} title="Retirer la photo"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`:null}
      </div>
    </div>`; }

  // Toggle segmenté (N options), le pouce glisse sous l'option active.
  segToggle(options,value,onChange,width){ const n=options.length; const idx=Math.max(0,options.findIndex(o=>o.value===value));
    return html`<div class="seg-toggle" style=${width?('width:'+width):''}>
      <div class="seg-thumb" style=${`width:calc((100% - 6px)/${n});transform:translateX(calc(${idx} * 100%))`}></div>
      ${options.map(o=>html`<button type="button" class=${o.value===value?'on':''} onClick=${()=>onChange(o.value)}>${o.label}</button>`)}
    </div>`; }

  // Modale flottante générique.
  renderModal({title,body,actions,onBackdrop,width,z}){
    return html`<div class="dialog-backdrop" style=${'z-index:'+(z||60)} onClick=${onBackdrop||null}>
      <div class="dialog" style=${'width:min('+(width||440)+'px,100%)'} onClick=${(e)=>e.stopPropagation()}>
        ${title?html`<div class="dialog-title">${title}</div>`:null}
        ${body}
        ${actions?html`<div class="dialog-actions" style="flex-wrap:wrap">${actions}</div>`:null}
      </div>
    </div>`; }

  // Confirmation générique (utilisée avant toute suppression).
  askConfirm(opts){ this.setState({confirm:{confirmLabel:'Supprimer',...opts}}); }
  confirmYes=()=>{ const c=this.state.confirm; this.setState({confirm:null}); if(c&&c.onConfirm) c.onConfirm(); };
  confirmNo=()=>this.setState({confirm:null});

  // Modèle de filtres multi-tags avec mémoire du « Tout » (par zone puis dimension).
  getFilt(zone,dim){ const z=this.state.filters[zone]; return (z&&z[dim])||{sel:[],mem:[]}; }
  setFilt(zone,dim,next){ this.setState(s=>({filters:{...s.filters,[zone]:{...(s.filters[zone]||{}),[dim]:next}}})); }
  toggleFilterTag=(zone,dim,val)=>()=>{ const f=this.getFilt(zone,dim);
    const sel=f.sel.includes(val)?f.sel.filter(x=>x!==val):[...f.sel,val];
    this.setFilt(zone,dim,{sel,mem:[]}); };
  toggleFilterAll=(zone,dim)=>()=>{ const f=this.getFilt(zone,dim);
    if(f.sel.length===0){ if(f.mem.length) this.setFilt(zone,dim,{sel:f.mem,mem:[]}); }
    else this.setFilt(zone,dim,{sel:[],mem:f.sel}); };
  toggleFilterPanel=(zone)=>()=>this.setState(s=>({filterOpen:{...s.filterOpen,[zone]:!s.filterOpen[zone]}}));
  filterCount(zone,dims){ return dims.reduce((n,d)=>n+this.getFilt(zone,d).sel.length,0); }
  filterPass(zone,dim,val){ const f=this.getFilt(zone,dim); return f.sel.length===0 || f.sel.includes(val); }
  purgeFilterValue(zone,dim,val){ const f=this.getFilt(zone,dim);
    if(f.sel.includes(val)||f.mem.includes(val)) this.setFilt(zone,dim,{sel:f.sel.filter(x=>x!==val),mem:f.mem.filter(x=>x!==val)}); }
  // Bouton « Filtrer » (avec compteur) + panneau de tags.
  renderFilterButton(zone,dims){ const c=this.filterCount(zone,dims);
    return html`<button class="btn btn-secondary" onClick=${this.toggleFilterPanel(zone)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M7 12h10M10 19h4"/></svg>Filtrer${c>0?html`<span class="filter-badge">${c}</span>`:''}</button>`; }
  renderFilterPanel(zone,dimsConfig){ if(!this.state.filterOpen[zone]) return null;
    return html`<div class="filter-panel">
      ${dimsConfig.map((dc,di)=>{ const f=this.getFilt(zone,dc.dim); const allOn=f.sel.length===0;
        return html`<div style=${di>0?'margin-top:14px':''}>
          <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--color-accent);margin-bottom:8px">${dc.label}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button class=${'filter-chip'+(allOn?' on':'')} onClick=${this.toggleFilterAll(zone,dc.dim)}>Tout</button>
            ${dc.options.map(o=>{ const on=f.sel.includes(o); const mem=allOn&&f.mem.includes(o);
              return html`<button class=${'filter-chip'+(on?' on':'')+(mem?' mem':'')} onClick=${this.toggleFilterTag(zone,dc.dim,o)}>${o}</button>`; })}
          </div>
        </div>`; })}
    </div>`; }

  // ---- auth lifecycle ----
  componentDidMount(){
    supabase.auth.getSession().then(({data})=>{
      this.setState({session:data.session, sessionChecked:true});
      if(data.session) this.loadAll();
    }).catch(()=>{ this.setState({sessionChecked:true}); });
    supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){
        this.setState({session:null,sessionChecked:true,loaded:false,stash:[],patterns:[],projects:[],needles:[],signedUrls:{},
          zone:'home',editingProject:null,projectDraft:null,expandedYarn:null,yarnDialog:false,yarnEditId:null,patternDialog:false,needleDialog:false,needleEditId:null});
      } else if(session){
        this.setState({session,sessionChecked:true});
        if(!this.state.loaded) this.loadAll();
      }
    });
  }

  setAuthField=(f)=>(e)=>this.setState({[f]:e.target.value, authError:''});
  toggleAuthMode=()=>this.setState(s=>({authMode:s.authMode==='signup'?'signin':'signup',authError:''}));
  translateAuthError(msg){
    const m=(msg||'').toLowerCase();
    if(m.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.';
    if(m.includes('user already registered')) return 'Un compte existe déjà avec cet email.';
    if(m.includes('password should be at least')) return 'Le mot de passe doit faire au moins 6 caractères.';
    if(m.includes('email not confirmed')) return "Confirme d'abord ton email (lien envoyé à l'inscription).";
    if(m.includes('rate limit')) return 'Trop de tentatives, réessaie dans quelques instants.';
    return msg || 'Une erreur est survenue.';
  }
  submitAuth=async(e)=>{
    e.preventDefault();
    const {authMode,authEmail,authPassword}=this.state;
    if(!authEmail.trim()||!authPassword) return;
    this.setState({authBusy:true,authError:''});
    try{
      if(authMode==='signup'){
        const {data,error}=await supabase.auth.signUp({email:authEmail.trim(),password:authPassword});
        if(error) throw error;
        if(!data.session){ this.setState({authBusy:false,authMode:'check-email'}); return; }
      } else {
        const {error}=await supabase.auth.signInWithPassword({email:authEmail.trim(),password:authPassword});
        if(error) throw error;
      }
      this.setState({authBusy:false,authPassword:''});
    }catch(err){
      this.setState({authBusy:false,authError:this.translateAuthError(err.message)});
    }
  };
  signOut=async()=>{ await supabase.auth.signOut(); };

  // ---- data loading ----
  async loadAll(){
    if(this._loadingData) return;
    this._loadingData=true;
    const [yq,pq,prq,nq]=await Promise.all([
      supabase.from('yarns').select('*, colorways(*)').order('created_at',{ascending:false}),
      supabase.from('patterns').select('*').order('created_at',{ascending:false}),
      supabase.from('projects').select('*, project_allocations(*), project_photos(*), project_needles(*), project_patterns(*)').order('created_at',{ascending:false}),
      supabase.from('needles').select('*').order('created_at',{ascending:false}),
    ]);
    const stash=(yq.data||[]).map(y=>({id:y.id,brand:y.brand,name:y.name,mps:Number(y.meters_per_skein)||0,gps:Number(y.grams_per_skein)||0,blend:y.blend,
      colorways:(y.colorways||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
        .map(c=>({id:c.id,color:c.color,hex:c.hex,dyeLot:c.dye_lot,grams:Number(c.grams)||0,photo:c.photo_path||''}))}));
    const patterns=(pq.data||[]).map(p=>({id:p.id,name:p.name,category:p.category,author:p.author,path:p.file_path||'',fileName:p.file_name||'',kind:p.file_kind||''}));
    const needles=(nq.data||[]).map(n=>({id:n.id,brand:n.brand||'',size:n.size_mm===null?'':String(n.size_mm),length:n.length||'',interchangeable:!!n.interchangeable}));
    const projects=(prq.data||[]).map(pr=>({id:pr.id,name:pr.name,size:pr.size,
      gauge:pr.gauge===null?'':String(pr.gauge),
      startDate:pr.start_date,endDate:pr.end_date,notes:pr.notes,
      allocations:(pr.project_allocations||[]).map(a=>({rowId:a.id,colorwayId:a.colorway_id,grams:Number(a.grams)||0})),
      needleLinks:(pr.project_needles||[]).map(pn=>({rowId:pn.id,needleId:pn.needle_id})),
      patternLinks:(pr.project_patterns||[]).map(pp=>({rowId:pp.id,patternId:pp.pattern_id})),
      photos:(pr.project_photos||[]).slice().sort((a,b)=>(a.position-b.position)||(new Date(a.created_at)-new Date(b.created_at)))
        .map(ph=>({rowId:ph.id,path:ph.path,name:ph.name,type:ph.type,position:ph.position||0}))}));
    const meta=this.deriveMeta(patterns,stash);
    this.setState({stash,patterns,projects,needles,loaded:true, ...meta});
    this._loadingData=false;
    this.refreshSignedUrls({stash,patterns,projects,avatarPath:meta.avatarPath});
  }
  deriveMeta(patterns,stash){
    const u=this.state.session&&this.state.session.user;
    const meta=(u&&u.user_metadata)||{};
    const usedCats=Array.from(new Set(patterns.map(p=>p.category).filter(Boolean)));
    const usedAuthors=Array.from(new Set(patterns.map(p=>p.author).filter(Boolean)));
    const usedBrands=Array.from(new Set((stash||[]).map(y=>y.brand).filter(Boolean)));
    const defaults=['Pull','Gilet','Bonnet','Chaussettes','Écharpe','Châle','Accessoire','Autre'];
    const categories=Array.isArray(meta.categories)&&meta.categories.length?meta.categories.slice():Array.from(new Set([...defaults,...usedCats]));
    const authors=Array.isArray(meta.authors)?meta.authors.slice():usedAuthors;
    const brands=Array.isArray(meta.brands)?meta.brands.slice():usedBrands;
    const needleSizes=Array.isArray(meta.needle_sizes)&&meta.needle_sizes.length?meta.needle_sizes.slice():this.standardSizes();
    return {categories,authors,brands,needleSizes,displayName:meta.display_name||'',avatarPath:meta.avatar_path||''};
  }
  async saveMeta(patch){
    // `patch` utilise les clés snake_case de user_metadata (côté Supabase) ;
    // l'état local est en camelCase, d'où la table de correspondance.
    const keyMap={display_name:'displayName',needle_sizes:'needleSizes',avatar_path:'avatarPath'};
    const statePatch={}; Object.keys(patch).forEach(k=>{ statePatch[keyMap[k]||k]=patch[k]; });
    this.setState(statePatch);
    try{ await supabase.auth.updateUser({data:patch}); }catch(e){}
  }
  // `src` permet de passer les données fraîchement chargées (setState de Preact
  // n'étant pas encore appliqué juste après loadAll) ; sinon on lit l'état courant.
  async refreshSignedUrls(src){
    const st=src||this.state;
    const avatarPath=('avatarPath' in st)?st.avatarPath:this.state.avatarPath;
    const patternPaths=[...new Set(st.patterns.filter(p=>p.kind==='img'&&p.path).map(p=>p.path))];
    const photoPaths=[...new Set([
      ...st.projects.flatMap(p=>p.photos.map(ph=>ph.path)),
      ...(this.state.projectDraft? this.state.projectDraft.photos.map(ph=>ph.path):[]),
      ...st.stash.flatMap(y=>y.colorways.map(c=>c.photo).filter(Boolean)),
      ...(avatarPath?[avatarPath]:[]),
    ])];
    const updates={};
    if(patternPaths.length){ const {data}=await supabase.storage.from('patterns').createSignedUrls(patternPaths,3600); (data||[]).forEach(d=>{ if(d.signedUrl) updates[d.path]=d.signedUrl; }); }
    if(photoPaths.length){ const {data}=await supabase.storage.from('photos').createSignedUrls(photoPaths,3600); (data||[]).forEach(d=>{ if(d.signedUrl) updates[d.path]=d.signedUrl; }); }
    if(Object.keys(updates).length) this.setState(s=>({signedUrls:{...s.signedUrls,...updates}}));
  }
  async getSignedUrl(bucket,path){ const {data}=await supabase.storage.from(bucket).createSignedUrl(path,3600); return data&&data.signedUrl?data.signedUrl:''; }
  storagePath(file){
    const uid=this.state.session.user.id;
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const rid=Math.random().toString(36).slice(2)+Date.now().toString(36);
    return `${uid}/${rid}-${safe}`;
  }

  // ---- lookups ----
  cwMap(){ const m={}; this.state.stash.forEach(y=>y.colorways.forEach(cw=>m[cw.id]={yarn:y,cw})); return m; }
  allocatedTo(cwId){ let g=0; this.state.projects.forEach(p=>{ if(this.state.editingProject===p.id) return; p.allocations.forEach(a=>{ if(a.colorwayId===cwId) g+=Number(a.grams)||0; }); });
    if(this.state.projectDraft){ this.state.projectDraft.allocations.forEach(a=>{ if(a.colorwayId===cwId) g+=Number(a.grams)||0; }); }
    return g; }
  fmt(n){ n=Math.round(n); return n>=1000? (n/1000).toFixed(n%1000===0?0:1)+' k':(''+n); }

  // ---- nav ----
  projectDirty(){ const d=this.state.projectDraft; if(!d) return false; return JSON.stringify(d)!==this.state.projectDraftInitial; }
  go=(z)=>()=>{
    if(this.state.projectDraft && this.projectDirty()){ this.setState({pendingNav:z}); return; }
    this.setState({zone:z,editingProject:null,projectDraft:null,projectDraftInitial:null});
  };
  confirmNavSave=async()=>{ const z=this.state.pendingNav; await this.saveProject();
    this.setState({pendingNav:null,zone:z,editingProject:null,projectDraft:null,projectDraftInitial:null}); };
  confirmNavDiscard=()=>{ const z=this.state.pendingNav; const d=this.state.projectDraft;
    if(d && !d.id && d.photos.length) d.photos.forEach(ph=>supabase.storage.from('photos').remove([ph.path]));
    this.setState({pendingNav:null,zone:z,editingProject:null,projectDraft:null,projectDraftInitial:null}); };
  cancelNav=()=>this.setState({pendingNav:null});
  navStyle(z){
    const on=this.state.zone===z && !(z==='projects'&&this.state.editingProject);
    const onProj = z==='projects' && (this.state.zone==='projects');
    const active = z==='projects'?onProj:on;
    return `display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:11px 14px;border:none;border-radius:14px;cursor:pointer;font-family:var(--font-body);font-size:14.5px;font-weight:600;transition:all .15s;background:${active?'var(--color-accent)':'transparent'};color:${active?'var(--color-bg)':'var(--color-text)'}`;
  }

  // ---- yarn stash ----
  openYarnAdd=()=>this.setState({yarnDialog:true,yarnEditId:null,yarnDraft:this.blankYarn()});
  openYarnEdit=(id)=>(e)=>{ e&&e.stopPropagation(); const y=this.state.stash.find(x=>x.id===id); if(!y) return;
    this.setState({yarnDialog:true,yarnEditId:id,yarnDraft:{...this.blankYarn(),brand:y.brand,name:y.name,mps:String(y.mps||''),gps:String(y.gps||''),blend:y.blend||''}}); };
  closeYarnDialog=()=>{ const p=this.state.yarnDraft.photo; if(p) supabase.storage.from('photos').remove([p]);
    this.setState({yarnDialog:false,yarnEditId:null}); };
  setYarnDraft=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({yarnDraft:{...s.yarnDraft,[f]:v}})); };
  setYarnDraftHex=(e)=>{ const v=e.target.value; this.setState(s=>({yarnDraft:{...s.yarnDraft,hex:v}})); };
  saveYarn=async()=>{
    const d=this.state.yarnDraft; if(!d.name.trim()||!d.brand.trim()) return;
    const brand=d.brand.trim();
    if(brand && !this.state.brands.includes(brand)) this.saveMeta({brands:[...this.state.brands,brand]});
    const cols={brand,name:d.name.trim(),meters_per_skein:Number(d.mps)||0,grams_per_skein:Number(d.gps)||0,blend:d.blend.trim()};
    const editId=this.state.yarnEditId;
    if(editId){
      await supabase.from('yarns').update(cols).eq('id',editId);
      this.setState(s=>({stash:s.stash.map(y=>y.id!==editId?y:{...y,brand:cols.brand,name:cols.name,mps:cols.meters_per_skein,gps:cols.grams_per_skein,blend:cols.blend}),yarnDialog:false,yarnEditId:null}));
    } else {
      if(!d.color.trim()) return;
      const uid=this.state.session.user.id;
      const {data:yarnRow}=await supabase.from('yarns').insert({user_id:uid,...cols}).select().single();
      if(!yarnRow) return;
      const {data:cwRow}=await supabase.from('colorways').insert({user_id:uid,yarn_id:yarnRow.id,
        color:d.color.trim(),hex:d.hex,dye_lot:d.dyeLot.trim(),grams:Number(d.grams)||0,photo_path:d.photo||null}).select().single();
      const yarn={id:yarnRow.id,brand:yarnRow.brand,name:yarnRow.name,mps:Number(yarnRow.meters_per_skein)||0,gps:Number(yarnRow.grams_per_skein)||0,blend:yarnRow.blend,
        colorways:cwRow?[{id:cwRow.id,color:cwRow.color,hex:cwRow.hex,dyeLot:cwRow.dye_lot,grams:Number(cwRow.grams)||0,photo:cwRow.photo_path||''}]:[]};
      if(d.photo) this.refreshSignedUrls();
      this.setState(s=>({stash:[yarn,...s.stash],yarnDialog:false,yarnDraft:this.blankYarn(),expandedYarn:yarn.id}));
    }
  };
  toggleYarn=(id)=>()=>this.setState(s=>({expandedYarn:s.expandedYarn===id?null:id}));
  deleteYarn=(id)=>(e)=>{ e.stopPropagation(); const y=this.state.stash.find(x=>x.id===id);
    this.askConfirm({title:'Supprimer la laine ?',message:`« ${y?y.name:'Cette laine'} » et tous ses coloris seront définitivement supprimés.`,
      onConfirm:()=>this._deleteYarn(id)}); };
  _deleteYarn=async(id)=>{ await supabase.from('yarns').delete().eq('id',id);
    this.setState(s=>({stash:s.stash.filter(y=>y.id!==id)})); };
  // Les grammes dispo ne se modifient plus en écrasant la valeur : uniquement
  // par addition ou soustraction d'une quantité, via le toggle +/- à côté.
  getGramsAdjust(cid){ return this.state.gramsAdjust[cid]||{sign:'+',value:''}; }
  toggleGramsSign=(cid)=>()=>{ const cur=this.getGramsAdjust(cid);
    this.setState(s=>({gramsAdjust:{...s.gramsAdjust,[cid]:{...cur,sign:cur.sign==='+'?'-':'+'}}})); };
  setGramsAdjustValue=(cid)=>(e)=>{ const v=e.target.value; const cur=this.getGramsAdjust(cid);
    this.setState(s=>({gramsAdjust:{...s.gramsAdjust,[cid]:{...cur,value:v}}})); };
  applyGramsAdjust=(yid,cid)=>async()=>{
    const adj=this.getGramsAdjust(cid); const n=Number(adj.value);
    if(!adj.value||!n||n<=0) return;
    const y=this.state.stash.find(x=>x.id===yid); const cw=y&&y.colorways.find(c=>c.id===cid); if(!cw) return;
    const newGrams=Math.max(0,cw.grams+(adj.sign==='-'?-n:n));
    await supabase.from('colorways').update({grams:newGrams}).eq('id',cid);
    this.setState(s=>({stash:s.stash.map(yy=>yy.id!==yid?yy:{...yy,colorways:yy.colorways.map(c=>c.id!==cid?c:{...c,grams:newGrams})}),
      gramsAdjust:{...s.gramsAdjust,[cid]:{sign:adj.sign,value:''}}})); };
  onGramsAdjustKey=(yid,cid)=>(e)=>{ if(e.key==='Enter'){ e.preventDefault(); this.applyGramsAdjust(yid,cid)(); } };
  startCw=(yid)=>()=>this.setState({cwFor:yid,cwDraft:{color:'',hex:'#c67139',dyeLot:'',grams:'',photo:''}});
  cancelCw=()=>{ const p=this.state.cwDraft.photo; if(p) supabase.storage.from('photos').remove([p]);
    this.setState({cwFor:null}); };
  setCwDraft=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({cwDraft:{...s.cwDraft,[f]:v}})); };
  addCw=(yid)=>async()=>{ const d=this.state.cwDraft; if(!d.color.trim()) return;
    const uid=this.state.session.user.id;
    const {data:cwRow}=await supabase.from('colorways').insert({user_id:uid,yarn_id:yid,color:d.color.trim(),hex:d.hex,dye_lot:d.dyeLot.trim(),grams:Number(d.grams)||0,photo_path:d.photo||null}).select().single();
    if(!cwRow) return;
    const cw={id:cwRow.id,color:cwRow.color,hex:cwRow.hex,dyeLot:cwRow.dye_lot,grams:Number(cwRow.grams)||0,photo:cwRow.photo_path||''};
    if(cw.photo) this.refreshSignedUrls();
    this.setState(s=>({stash:s.stash.map(y=>y.id!==yid?y:{...y,colorways:[...y.colorways,cw]}),cwFor:null})); };
  deleteCw=(yid,cid)=>(e)=>{ e.stopPropagation(); const y=this.state.stash.find(x=>x.id===yid); const cw=y&&y.colorways.find(c=>c.id===cid);
    this.askConfirm({title:'Supprimer le coloris ?',message:`« ${cw?cw.color:'Ce coloris'} » sera définitivement supprimé.`,
      onConfirm:()=>this._deleteCw(yid,cid)}); };
  _deleteCw=async(yid,cid)=>{ const y=this.state.stash.find(x=>x.id===yid); const cw=y&&y.colorways.find(c=>c.id===cid);
    if(cw&&cw.photo) supabase.storage.from('photos').remove([cw.photo]);
    await supabase.from('colorways').delete().eq('id',cid);
    this.setState(s=>({stash:s.stash.map(y=>y.id!==yid?y:{...y,colorways:y.colorways.filter(c=>c.id!==cid)})})); };
  startEditCw=(yid,cid)=>(e)=>{ e.stopPropagation(); const y=this.state.stash.find(x=>x.id===yid); const cw=y&&y.colorways.find(c=>c.id===cid); if(!cw) return;
    this.setState({editingCw:cid,cwEditDraft:{color:cw.color,hex:cw.hex,dyeLot:cw.dyeLot,grams:String(cw.grams),photo:cw.photo||''},cwEditOrigPhoto:cw.photo||''}); };
  cancelEditCw=()=>{ const d=this.state.cwEditDraft,orig=this.state.cwEditOrigPhoto;
    if(d&&d.photo&&d.photo!==orig) supabase.storage.from('photos').remove([d.photo]);
    this.setState({editingCw:null,cwEditDraft:null,cwEditOrigPhoto:''}); };
  setCwEditDraft=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({cwEditDraft:{...s.cwEditDraft,[f]:v}})); };
  setCwEditHex=(e)=>{ const v=e.target.value; this.setState(s=>({cwEditDraft:{...s.cwEditDraft,hex:v}})); };
  saveEditCw=(yid,cid)=>async()=>{ const d=this.state.cwEditDraft; if(!d||!d.color.trim()) return; const orig=this.state.cwEditOrigPhoto;
    const cols={color:d.color.trim(),hex:d.hex,dye_lot:d.dyeLot.trim(),grams:Number(d.grams)||0,photo_path:d.photo||null};
    await supabase.from('colorways').update(cols).eq('id',cid);
    if(orig && orig!==d.photo) supabase.storage.from('photos').remove([orig]);
    if(d.photo) this.refreshSignedUrls();
    this.setState(s=>({stash:s.stash.map(y=>y.id!==yid?y:{...y,colorways:y.colorways.map(c=>c.id!==cid?c:{...c,color:cols.color,hex:cols.hex,dyeLot:cols.dye_lot,grams:cols.grams,photo:d.photo||''})}),editingCw:null,cwEditDraft:null,cwEditOrigPhoto:''})); };
  // upload / suppression de la photo d'un coloris (bucket `photos`, réutilisé)
  // `which` ∈ {'yarn','add','edit'} → yarnDraft | cwDraft | cwEditDraft
  cwPhotoDraftKey(which){ return which==='yarn'?'yarnDraft':which==='add'?'cwDraft':'cwEditDraft'; }
  onCwPhoto=(which)=>async(e)=>{ const file=e.target.files[0]; e.target.value=''; if(!file||!file.type.startsWith('image')) return;
    const key=this.cwPhotoDraftKey(which); const prev=this.state[key]&&this.state[key].photo;
    const path=this.storagePath(file);
    const {error}=await supabase.storage.from('photos').upload(path,file,{contentType:file.type||undefined});
    if(error) return;
    const orig=this.state.cwEditOrigPhoto;
    // nettoie l'ancien fichier temporaire (jamais l'original sauvegardé)
    if(prev && prev!==orig) supabase.storage.from('photos').remove([prev]);
    const url=await this.getSignedUrl('photos',path);
    this.setState(s=>({[key]:{...s[key],photo:path},signedUrls:{...s.signedUrls,[path]:url}})); };
  removeCwPhoto=(which)=>()=>{ const key=this.cwPhotoDraftKey(which); const cur=this.state[key]&&this.state[key].photo; const orig=this.state.cwEditOrigPhoto;
    // fichier temporaire (non encore sauvegardé) → suppression storage immédiate ;
    // original sauvegardé → on vide juste le champ, la suppression storage a lieu au save.
    if(cur && cur!==orig) supabase.storage.from('photos').remove([cur]);
    this.setState(s=>({[key]:{...s[key],photo:''}})); };
  // gestion des tags de marque
  toggleManageBrands=()=>this.setState(s=>({manageBrands:!s.manageBrands}));
  setNewBrand=(e)=>this.setState({newBrand:e.target.value});
  addBrand=async()=>{ const b=this.state.newBrand.trim(); if(!b||this.state.brands.includes(b)){ this.setState({newBrand:''}); return; }
    this.setState({newBrand:''}); await this.saveMeta({brands:[...this.state.brands,b]}); };
  deleteBrand=(b)=>async()=>{ await this.saveMeta({brands:this.state.brands.filter(x=>x!==b)});
    this.purgeFilterValue('stash','brand',b); };

  // ---- patterns ----
  openPattern=()=>this.setState({patternDialog:true,patternDraft:this.blankPattern(),patternEditId:null,patternOrigPath:''});
  startEditPattern=(id)=>(e)=>{ e.stopPropagation(); const p=this.state.patterns.find(x=>x.id===id);
    this.setState({patternDialog:true,patternEditId:id,patternOrigPath:p.path||'',
      patternDraft:{name:p.name,category:p.category,author:p.author||'',path:p.path||'',fileName:p.fileName||'',kind:p.kind||''}}); };
  closePattern=()=>{ const d=this.state.patternDraft;
    if(d.path && d.path!==this.state.patternOrigPath) supabase.storage.from('patterns').remove([d.path]);
    this.setState({patternDialog:false,patternEditId:null,patternOrigPath:''}); };
  setPatternDraft=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({patternDraft:{...s.patternDraft,[f]:v}})); };
  // Petite fenêtre flottante « Nouvelle catégorie / Nouvel auteur » (cercle + à côté du sélecteur).
  openTagPrompt=(kind)=>()=>this.setState({tagPrompt:{kind,value:''}});
  closeTagPrompt=()=>this.setState({tagPrompt:null});
  setTagPromptValue=(e)=>{ const v=e.target.value; this.setState(s=>({tagPrompt:{...s.tagPrompt,value:v}})); };
  confirmTagPrompt=async()=>{ const tp=this.state.tagPrompt; if(!tp) return; const val=tp.value.trim(); if(!val) return;
    if(tp.kind==='category'){
      if(!this.state.categories.includes(val)) await this.saveMeta({categories:[...this.state.categories,val]});
      this.setState(s=>({patternDraft:{...s.patternDraft,category:val}}));
    } else {
      if(!this.state.authors.includes(val)) await this.saveMeta({authors:[...this.state.authors,val]});
      this.setState(s=>({patternDraft:{...s.patternDraft,author:val}}));
    }
    this.setState({tagPrompt:null}); };
  onPatternFile=async(e)=>{ const file=e.target.files[0]; if(!file) return;
    const isImg=file.type.startsWith('image'); const kind=isImg?'img':'pdf'; const path=this.storagePath(file);
    const prev=this.state.patternDraft.path;
    const {error}=await supabase.storage.from('patterns').upload(path,file,{contentType:file.type||undefined});
    if(error) return;
    if(prev && prev!==this.state.patternOrigPath) supabase.storage.from('patterns').remove([prev]);
    const url=isImg?await this.getSignedUrl('patterns',path):'';
    this.setState(s=>({
      patternDraft:{...s.patternDraft,path,kind,fileName:file.name,name:s.patternDraft.name||file.name.replace(/\.[^.]+$/,'')},
      signedUrls:url?{...s.signedUrls,[path]:url}:s.signedUrls,
    }));
  };
  savePattern=async()=>{ const d=this.state.patternDraft; if(!d.name.trim()) return;
    const uid=this.state.session.user.id;
    const cat=(d.category||'').trim(); const author=(d.author||'').trim();
    // Enregistre catégorie / auteur dans les listes gérées s'ils sont nouveaux.
    const metaPatch={};
    if(cat && !this.state.categories.includes(cat)) metaPatch.categories=[...this.state.categories,cat];
    if(author && !this.state.authors.includes(author)) metaPatch.authors=[...this.state.authors,author];
    if(Object.keys(metaPatch).length) this.saveMeta(metaPatch);
    if(this.state.patternEditId){
      const id=this.state.patternEditId;
      const cols={name:d.name.trim(),category:cat,author,file_path:d.path||null,file_name:d.fileName||null,file_kind:d.kind||null};
      await supabase.from('patterns').update(cols).eq('id',id);
      if(this.state.patternOrigPath && this.state.patternOrigPath!==d.path) supabase.storage.from('patterns').remove([this.state.patternOrigPath]);
      this.setState(s=>({patterns:s.patterns.map(p=>p.id!==id?p:{...p,name:cols.name,category:cols.category,author:cols.author,path:d.path||'',fileName:d.fileName||'',kind:d.kind||''}),patternDialog:false,patternEditId:null,patternOrigPath:''}));
    } else {
      const {data:row}=await supabase.from('patterns').insert({user_id:uid,name:d.name.trim(),category:cat,author,
        file_path:d.path||null,file_name:d.fileName||null,file_kind:d.kind||null}).select().single();
      if(!row) return;
      const pat={id:row.id,name:row.name,category:row.category,author:row.author,path:row.file_path||'',fileName:row.file_name||'',kind:row.file_kind||''};
      this.setState(s=>({patterns:[pat,...s.patterns],patternDialog:false,patternEditId:null,patternOrigPath:''}));
    }
  };
  deletePattern=(id)=>(e)=>{ e.stopPropagation(); const p=this.state.patterns.find(x=>x.id===id);
    this.askConfirm({title:'Supprimer le patron ?',message:`« ${p?p.name:'Ce patron'} » sera définitivement supprimé.`,
      onConfirm:()=>this._deletePattern(id)}); };
  _deletePattern=async(id)=>{ const p=this.state.patterns.find(x=>x.id===id);
    if(p&&p.path) await supabase.storage.from('patterns').remove([p.path]);
    await supabase.from('patterns').delete().eq('id',id);
    this.setState(s=>({patterns:s.patterns.filter(x=>x.id!==id)})); };
  // ---- taxonomies (catégories & auteurs, stockées dans user_metadata) ----
  toggleManageTax=()=>this.setState(s=>({manageTax:!s.manageTax}));
  setNewCategory=(e)=>this.setState({newCategory:e.target.value});
  setNewAuthor=(e)=>this.setState({newAuthor:e.target.value});
  addCategory=async()=>{ const c=this.state.newCategory.trim(); if(!c||this.state.categories.includes(c)){ this.setState({newCategory:''}); return; }
    this.setState({newCategory:''}); await this.saveMeta({categories:[...this.state.categories,c]}); };
  deleteCategory=(c)=>async()=>{ await this.saveMeta({categories:this.state.categories.filter(x=>x!==c)});
    this.purgeFilterValue('library','category',c); };
  addAuthor=async()=>{ const a=this.state.newAuthor.trim(); if(!a||this.state.authors.includes(a)){ this.setState({newAuthor:''}); return; }
    this.setState({newAuthor:''}); await this.saveMeta({authors:[...this.state.authors,a]}); };
  deleteAuthor=(a)=>async()=>{ await this.saveMeta({authors:this.state.authors.filter(x=>x!==a)});
    this.purgeFilterValue('library','author',a); };

  // ---- profil : nom personnalisé ----
  startEditName=()=>this.setState(s=>({editingName:true,nameDraft:s.displayName||''}));
  cancelEditName=()=>this.setState({editingName:false});
  setNameDraft=(e)=>this.setState({nameDraft:e.target.value});
  saveName=async()=>{ const n=this.state.nameDraft.trim(); await this.saveMeta({display_name:n}); this.setState({editingName:false}); };
  // ---- profil : photo (bucket `photos`, réutilisé) ----
  onAvatarPhoto=async(e)=>{ const file=e.target.files[0]; e.target.value=''; if(!file||!file.type.startsWith('image')) return;
    const prevPath=this.state.avatarPath;
    const path=this.storagePath(file);
    const {error}=await supabase.storage.from('photos').upload(path,file,{contentType:file.type||undefined});
    if(error) return;
    const url=await this.getSignedUrl('photos',path);
    await this.saveMeta({avatar_path:path});
    if(prevPath) supabase.storage.from('photos').remove([prevPath]);
    this.setState(s=>({signedUrls:{...s.signedUrls,[path]:url}})); };
  removeAvatarPhoto=async()=>{ const prevPath=this.state.avatarPath; if(!prevPath) return;
    await this.saveMeta({avatar_path:''});
    supabase.storage.from('photos').remove([prevPath]); };

  // ---- needle stash ----
  openNeedleAdd=()=>this.setState({needleDialog:true,needleDraft:this.blankNeedle(),needleEditId:null});
  openNeedleEdit=(id)=>()=>{ const n=this.state.needles.find(x=>x.id===id); if(!n) return;
    this.setState({needleDialog:true,needleEditId:id,needleDraft:{brand:n.brand,size:n.size,length:n.length,interchangeable:n.interchangeable}}); };
  closeNeedleDialog=()=>this.setState({needleDialog:false,needleEditId:null});
  setNeedleDraft=(f)=>(e)=>{ const v=f==='interchangeable'?e.target.checked:e.target.value; this.setState(s=>({needleDraft:{...s.needleDraft,[f]:v}})); };
  setNeedleDraftVal=(f)=>(val)=>this.setState(s=>({needleDraft:{...s.needleDraft,[f]:val}}));
  saveNeedle=async()=>{ const d=this.state.needleDraft; if(d.size===''&&!d.brand.trim()) return;
    if(d.size && !this.state.needleSizes.includes(d.size)) this.saveMeta({needle_sizes:[...this.state.needleSizes,d.size]});
    const cols={brand:d.brand.trim(),size_mm:d.size===''?0:Number(d.size),length:(d.length||'').trim(),interchangeable:!!d.interchangeable};
    const editId=this.state.needleEditId;
    if(editId){
      await supabase.from('needles').update(cols).eq('id',editId);
      this.setState(s=>({needles:s.needles.map(n=>n.id!==editId?n:{id:editId,brand:cols.brand,size:cols.size_mm===0&&d.size===''?'':String(cols.size_mm),length:cols.length,interchangeable:cols.interchangeable}),needleDialog:false,needleEditId:null}));
    } else {
      const uid=this.state.session.user.id;
      const {data:row}=await supabase.from('needles').insert({user_id:uid,...cols}).select().single();
      if(!row) return;
      const needle={id:row.id,brand:row.brand||'',size:row.size_mm===null?'':String(row.size_mm),length:row.length||'',interchangeable:!!row.interchangeable};
      this.setState(s=>({needles:[needle,...s.needles],needleDraft:this.blankNeedle(),needleDialog:false}));
    } };
  deleteNeedle=(id)=>(e)=>{ e.stopPropagation(); const n=this.state.needles.find(x=>x.id===id);
    this.askConfirm({title:'Supprimer l\'aiguille ?',message:`« ${n?this.needleLabel(n):'Cette aiguille'} » sera définitivement supprimée.`,
      onConfirm:()=>this._deleteNeedle(id)}); };
  _deleteNeedle=async(id)=>{ await supabase.from('needles').delete().eq('id',id);
    this.setState(s=>({needles:s.needles.filter(n=>n.id!==id),
      projects:s.projects.map(p=>({...p,needleLinks:(p.needleLinks||[]).filter(l=>l.needleId!==id)})),
      projectDraft:s.projectDraft?{...s.projectDraft,needleLinks:(s.projectDraft.needleLinks||[]).filter(l=>l.needleId!==id)}:s.projectDraft})); };
  // gestion des tags de taille (mm)
  toggleManageSizes=()=>this.setState(s=>({manageSizes:!s.manageSizes}));
  setNewSize=(e)=>this.setState({newSize:e.target.value});
  addSize=async()=>{ const l=this.state.newSize.trim(); if(!l||this.state.needleSizes.includes(l)){ this.setState({newSize:''}); return; }
    this.setState({newSize:''}); await this.saveMeta({needle_sizes:[...this.state.needleSizes,l]}); };
  deleteSize=(l)=>async()=>{ await this.saveMeta({needle_sizes:this.state.needleSizes.filter(x=>x!==l)});
    this.purgeFilterValue('needles','size',l); };
  needleLabel(n){ const parts=[]; if(n.size!=='') parts.push(n.size+' mm'); if(n.length) parts.push(n.length); const head=n.brand||'Aiguille'; return head+(parts.length?' · '+parts.join(' · '):''); }

  // ---- association aiguille <-> projet ----
  setNeedlePick=(e)=>this.setState({needlePick:e.target.value});
  addProjectNeedle=async()=>{ const nid=this.state.needlePick; if(!nid) return;
    const d=this.state.projectDraft;
    if((d.needleLinks||[]).some(l=>l.needleId===nid)){ this.setState({needlePick:''}); return; }
    let rowId=null;
    if(d.id){ const uid=this.state.session.user.id;
      const {data}=await supabase.from('project_needles').insert({user_id:uid,project_id:d.id,needle_id:nid}).select().single();
      rowId=data?data.id:null;
    }
    this.setState(s=>({projectDraft:{...s.projectDraft,needleLinks:[...(s.projectDraft.needleLinks||[]),{rowId,needleId:nid}]},needlePick:''})); };
  removeProjectNeedle=(i)=>async()=>{ const d=this.state.projectDraft; const l=d.needleLinks[i];
    if(d.id && l.rowId) await supabase.from('project_needles').delete().eq('id',l.rowId);
    this.setState(s=>({projectDraft:{...s.projectDraft,needleLinks:s.projectDraft.needleLinks.filter((x,idx)=>idx!==i)}})); };

  // ---- association patron(s) <-> projet ----
  setPatternPick=(e)=>this.setState({patternPick:e.target.value});
  addProjectPattern=async()=>{ const pid=this.state.patternPick; if(!pid) return;
    const d=this.state.projectDraft;
    if((d.patternLinks||[]).some(l=>l.patternId===pid)){ this.setState({patternPick:''}); return; }
    let rowId=null;
    if(d.id){ const uid=this.state.session.user.id;
      const {data}=await supabase.from('project_patterns').insert({user_id:uid,project_id:d.id,pattern_id:pid}).select().single();
      rowId=data?data.id:null;
    }
    this.ensurePatternUrl(pid);
    this.setState(s=>({projectDraft:{...s.projectDraft,patternLinks:[...(s.projectDraft.patternLinks||[]),{rowId,patternId:pid}]},patternPick:'',previewPatternId:pid})); };
  removeProjectPattern=(i)=>async()=>{ const d=this.state.projectDraft; const l=d.patternLinks[i];
    if(d.id && l.rowId) await supabase.from('project_patterns').delete().eq('id',l.rowId);
    this.setState(s=>{ const patternLinks=s.projectDraft.patternLinks.filter((x,idx)=>idx!==i);
      const preview=s.previewPatternId===l.patternId?(patternLinks[0]?patternLinks[0].patternId:null):s.previewPatternId;
      return {projectDraft:{...s.projectDraft,patternLinks},previewPatternId:preview}; }); };
  setPreviewPattern=(id)=>()=>this.setState({previewPatternId:id});

  // ---- projects ----
  newProject=()=>{ const draft={id:null,name:'',size:'',gauge:'',startDate:this.today(),endDate:null,notes:'',allocations:[],needleLinks:[],patternLinks:[],photos:[]};
    this.setState({zone:'projects',editingProject:'new',projectDraft:draft,projectDraftInitial:JSON.stringify(draft),allocPick:{colorwayId:'',grams:''},needlePick:'',patternPick:'',previewPatternId:null}); };
  editProject=(id)=>()=>{ const p=this.state.projects.find(x=>x.id===id); const draft=this.dedupeAllocs(JSON.parse(JSON.stringify(p)));
    const firstPatternId=(draft.patternLinks&&draft.patternLinks[0])?draft.patternLinks[0].patternId:null;
    this.setState({zone:'projects',editingProject:id,projectDraft:draft,projectDraftInitial:JSON.stringify(draft),allocPick:{colorwayId:'',grams:''},patternPick:'',previewPatternId:firstPatternId});
    (draft.patternLinks||[]).forEach(l=>this.ensurePatternUrl(l.patternId)); };
  cancelEdit=()=>{ const d=this.state.projectDraft;
    if(d && !d.id && d.photos.length) d.photos.forEach(ph=>supabase.storage.from('photos').remove([ph.path]));
    this.setState({editingProject:null,projectDraft:null,projectDraftInitial:null,previewPatternId:null}); };
  ensurePatternUrl=async(patternId)=>{ if(!patternId) return; const p=this.state.patterns.find(x=>x.id===patternId);
    if(!p||!p.path||this.state.signedUrls[p.path]) return;
    const url=await this.getSignedUrl('patterns',p.path);
    if(url) this.setState(s=>({signedUrls:{...s.signedUrls,[p.path]:url}})); };
  setPD=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({projectDraft:{...s.projectDraft,[f]:v}})); };
  saveProject=async()=>{ const d=this.state.projectDraft; if(!d.name.trim()) return;
    const uid=this.state.session.user.id;
    const cols={user_id:uid,name:d.name.trim(),size:d.size,
      gauge:d.gauge===''?null:Number(d.gauge),
      start_date:d.startDate||null,end_date:d.endDate||null,notes:d.notes};
    if(d.id){
      await supabase.from('projects').update(cols).eq('id',d.id);
      this.setState(s=>({projects:s.projects.map(p=>p.id===d.id?d:p),editingProject:null,projectDraft:null}));
    } else {
      const {data:row}=await supabase.from('projects').insert(cols).select().single();
      if(!row) return;
      let allocations=d.allocations;
      if(d.allocations.length){
        const {data:allocRows}=await supabase.from('project_allocations')
          .insert(d.allocations.map(a=>({user_id:uid,project_id:row.id,colorway_id:a.colorwayId,grams:a.grams}))).select();
        if(allocRows) allocations=allocRows.map(a=>({rowId:a.id,colorwayId:a.colorway_id,grams:Number(a.grams)}));
      }
      let photos=d.photos;
      if(d.photos.length){
        const {data:photoRows}=await supabase.from('project_photos')
          .insert(d.photos.map((ph,i)=>({user_id:uid,project_id:row.id,path:ph.path,name:ph.name,type:ph.type,position:i}))).select();
        if(photoRows) photos=photoRows.slice().sort((a,b)=>a.position-b.position).map(ph=>({rowId:ph.id,path:ph.path,name:ph.name,type:ph.type,position:ph.position||0}));
      }
      let needleLinks=d.needleLinks||[];
      if(needleLinks.length){
        const {data:nRows}=await supabase.from('project_needles')
          .insert(needleLinks.map(l=>({user_id:uid,project_id:row.id,needle_id:l.needleId}))).select();
        if(nRows) needleLinks=nRows.map(pn=>({rowId:pn.id,needleId:pn.needle_id}));
      }
      let patternLinks=d.patternLinks||[];
      if(patternLinks.length){
        const {data:pRows}=await supabase.from('project_patterns')
          .insert(patternLinks.map(l=>({user_id:uid,project_id:row.id,pattern_id:l.patternId}))).select();
        if(pRows) patternLinks=pRows.map(pp=>({rowId:pp.id,patternId:pp.pattern_id}));
      }
      const project={...d,id:row.id,allocations,photos,needleLinks,patternLinks};
      this.setState(s=>({projects:[project,...s.projects],editingProject:null,projectDraft:null}));
    }
  };
  finishProject=()=>this.setState(s=>({projectDraft:{...s.projectDraft,endDate:this.today()}}));
  reopenProject=()=>this.setState(s=>({projectDraft:{...s.projectDraft,endDate:null}}));
  deleteProject=()=>{ const d=this.state.projectDraft;
    this.askConfirm({title:'Supprimer le projet ?',message:`« ${d&&d.name?d.name:'Ce projet'} » sera définitivement supprimé, ainsi que ses photos.`,
      onConfirm:()=>this._deleteProject()}); };
  _deleteProject=async()=>{ const id=this.state.projectDraft.id;
    if(id){
      const proj=this.state.projects.find(p=>p.id===id) || this.state.projectDraft;
      const paths=(proj.photos||[]).map(ph=>ph.path).filter(Boolean);
      if(paths.length) await supabase.storage.from('photos').remove(paths);
      await supabase.from('projects').delete().eq('id',id);
    }
    this.setState(s=>({projects:s.projects.filter(p=>p.id!==id),editingProject:null,projectDraft:null})); };
  dedupeAllocs(draft){
    const seen={}; const merged=[]; const toDelete=[];
    (draft.allocations||[]).forEach(a=>{
      if(seen[a.colorwayId]!==undefined){ const idx=seen[a.colorwayId]; merged[idx].grams=(Number(merged[idx].grams)||0)+(Number(a.grams)||0); if(a.rowId) toDelete.push(a.rowId); }
      else { seen[a.colorwayId]=merged.length; merged.push({...a}); }
    });
    if(toDelete.length){
      supabase.from('project_allocations').delete().in('id',toDelete);
      merged.forEach(m=>{ if(m.rowId) supabase.from('project_allocations').update({grams:m.grams}).eq('id',m.rowId); });
    }
    return {...draft,allocations:merged};
  }
  setAllocPick=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({allocPick:{...s.allocPick,[f]:v}})); };
  addAlloc=async()=>{ const a=this.state.allocPick; if(!a.colorwayId) return; const grams=Number(a.grams)||0;
    const d=this.state.projectDraft;
    // Fusion : si le coloris est déjà associé au projet, on cumule les grammes.
    const idx=d.allocations.findIndex(x=>x.colorwayId===a.colorwayId);
    if(idx>=0){ const ex=d.allocations[idx]; const newGrams=(Number(ex.grams)||0)+grams;
      if(d.id && ex.rowId) await supabase.from('project_allocations').update({grams:newGrams}).eq('id',ex.rowId);
      this.setState(s=>({projectDraft:{...s.projectDraft,allocations:s.projectDraft.allocations.map((x,i)=>i===idx?{...x,grams:newGrams}:x)},allocPick:{colorwayId:'',grams:''}}));
      return;
    }
    let rowId=null;
    if(d.id){ const uid=this.state.session.user.id;
      const {data}=await supabase.from('project_allocations').insert({user_id:uid,project_id:d.id,colorway_id:a.colorwayId,grams}).select().single();
      rowId=data?data.id:null;
    }
    this.setState(s=>({projectDraft:{...s.projectDraft,allocations:[...s.projectDraft.allocations,{rowId,colorwayId:a.colorwayId,grams}]},allocPick:{colorwayId:'',grams:''}})); };
  setAllocGrams=(i)=>async(e)=>{ const v=Number(e.target.value)||0; const d=this.state.projectDraft; const a=d.allocations[i];
    if(d.id && a.rowId) await supabase.from('project_allocations').update({grams:v}).eq('id',a.rowId);
    this.setState(s=>({projectDraft:{...s.projectDraft,allocations:s.projectDraft.allocations.map((x,idx)=>idx===i?{...x,grams:v}:x)}})); };
  removeAlloc=(i)=>async()=>{ const d=this.state.projectDraft; const a=d.allocations[i];
    if(d.id && a.rowId) await supabase.from('project_allocations').delete().eq('id',a.rowId);
    this.setState(s=>({projectDraft:{...s.projectDraft,allocations:s.projectDraft.allocations.filter((x,idx)=>idx!==i)}})); };
  onProjectPhoto=async(e)=>{ const file=e.target.files[0]; if(!file||!file.type.startsWith('image')) return;
    const path=this.storagePath(file);
    const {error}=await supabase.storage.from('photos').upload(path,file,{contentType:file.type||undefined});
    if(error) return;
    const url=await this.getSignedUrl('photos',path);
    const d=this.state.projectDraft; let rowId=null; const pos=(d.photos||[]).length;
    if(d.id){ const uid=this.state.session.user.id;
      const {data}=await supabase.from('project_photos').insert({user_id:uid,project_id:d.id,path,name:file.name,type:file.type,position:pos}).select().single();
      rowId=data?data.id:null;
    }
    this.setState(s=>({projectDraft:{...s.projectDraft,photos:[...s.projectDraft.photos,{rowId,path,name:file.name,type:file.type,position:pos}]},signedUrls:{...s.signedUrls,[path]:url}})); };
  removePhoto=(i)=>async()=>{ const d=this.state.projectDraft; const ph=d.photos[i];
    await supabase.storage.from('photos').remove([ph.path]);
    if(ph.rowId) await supabase.from('project_photos').delete().eq('id',ph.rowId);
    this.setState(s=>({projectDraft:{...s.projectDraft,photos:s.projectDraft.photos.filter((x,idx)=>idx!==i)}})); };

  // ---- glisser-déposer des photos (pointer events : tactile + souris) ----
  photoKey(ph){ return ph.rowId||ph.path; }
  photoPointerDown=(i)=>(e)=>{
    if(e.button&&e.button!==0) return;                 // souris : bouton gauche seulement
    const tile=e.currentTarget; const r=tile.getBoundingClientRect();
    const d=this.state.projectDraft; const ph=d.photos[i];
    this.setState({dragPhoto:{idx:i,key:this.photoKey(ph),w:r.width,h:r.height,
      grabX:e.clientX-r.left,grabY:e.clientY-r.top,x:e.clientX,y:e.clientY,url:this.state.signedUrls[ph.path]||''}});
    window.addEventListener('pointermove',this._onPhotoMove,{passive:false});
    window.addEventListener('pointerup',this._onPhotoUp);
    window.addEventListener('pointercancel',this._onPhotoUp);
  };
  _capturePhotoRects(){ const m={}; if(!this._photoGrid) return m;
    this._photoGrid.querySelectorAll('[data-photo-key]').forEach(el=>{ m[el.getAttribute('data-photo-key')]=el.getBoundingClientRect(); });
    return m; }
  _onPhotoMove=(e)=>{ const dp=this.state.dragPhoto; if(!dp) return;
    e.preventDefault();
    const x=e.clientX,y=e.clientY;
    let targetIdx=dp.idx;
    const el=document.elementFromPoint(x,y);
    const tile=el&&el.closest&&el.closest('[data-photo-idx]');
    if(tile){ const ti=parseInt(tile.getAttribute('data-photo-idx'),10); if(!isNaN(ti)) targetIdx=ti; }
    if(targetIdx!==dp.idx){
      this._flipFirst=this._capturePhotoRects();       // « First » avant réordonnancement (pour FLIP)
      this.setState(s=>{ const photos=s.projectDraft.photos.slice(); const [moved]=photos.splice(dp.idx,1); photos.splice(targetIdx,0,moved);
        return {projectDraft:{...s.projectDraft,photos},dragPhoto:{...s.dragPhoto,idx:targetIdx,x,y}}; });
    } else {
      this.setState(s=>({dragPhoto:{...s.dragPhoto,x,y}}));
    }
  };
  _onPhotoUp=async()=>{
    window.removeEventListener('pointermove',this._onPhotoMove);
    window.removeEventListener('pointerup',this._onPhotoUp);
    window.removeEventListener('pointercancel',this._onPhotoUp);
    const dp=this.state.dragPhoto; this.setState({dragPhoto:null});
    if(!dp) return;
    // Persiste le nouvel ordre : met à jour la position des lignes dont l'index a changé.
    const d=this.state.projectDraft; if(!d) return;
    const updates=[];
    const photos=d.photos.map((ph,i)=>{ if(ph.position!==i){ if(ph.rowId&&d.id) updates.push({id:ph.rowId,position:i}); return {...ph,position:i}; } return ph; });
    if(updates.length){
      // Met aussi à jour la liste des projets pour que la vignette de carte reflète le nouvel ordre.
      this.setState(s=>({projectDraft:{...s.projectDraft,photos},
        projects:d.id?s.projects.map(p=>p.id===d.id?{...p,photos}:p):s.projects}));
      for(const u of updates){ await supabase.from('project_photos').update({position:u.position}).eq('id',u.id); }
    }
  };
  // Animation FLIP : les vignettes non déplacées glissent vers leur nouvelle case.
  componentDidUpdate(){
    if(!this._flipFirst||!this._photoGrid) { this._flipFirst=null; return; }
    const first=this._flipFirst; this._flipFirst=null;
    const dragKey=this.state.dragPhoto&&this.state.dragPhoto.key;
    this._photoGrid.querySelectorAll('[data-photo-key]').forEach(el=>{
      const key=el.getAttribute('data-photo-key'); if(key===dragKey) return;
      const f=first[key]; if(!f) return;
      const l=el.getBoundingClientRect(); const dx=f.left-l.left, dy=f.top-l.top;
      if(!dx&&!dy) return;
      el.style.transition='none'; el.style.transform=`translate(${dx}px,${dy}px)`;
      el.getBoundingClientRect();                        // force reflow
      requestAnimationFrame(()=>{ el.style.transition='transform .18s ease'; el.style.transform=''; });
    });
  }

  closeModals=()=>this.setState({patternDialog:false,patternEditId:null,patternOrigPath:''});

  thumb(hex){ return `height:120px;background:linear-gradient(135deg,${hex} 0%,color-mix(in srgb,${hex} 60%,#000) 130%)`; }
  // Vignette de la carte projet : première photo si présente, sinon dégradé sur la couleur de laine.
  projThumbStyle(p,map){ const first=(p.photos||[])[0]; const url=first&&this.state.signedUrls[first.path];
    if(url) return `height:120px;background-image:url(${url});background-size:cover;background-position:center`;
    return this.thumb(this.projHex(p,map)); }

  renderVals(){
    const st=this.state, map=this.cwMap();
    const patName=(p)=>{ const links=p.patternLinks||[]; if(!links.length) return 'Sans patron';
      const pat=st.patterns.find(x=>x.id===links[0].patternId); const extra=links.length>1?` +${links.length-1}`:'';
      return pat?`${pat.name}${extra}`:'Sans patron'; };
    const projGrams=(p)=>p.allocations.reduce((s,a)=>s+(Number(a.grams)||0),0);
    const projMeters=(p)=>p.allocations.reduce((s,a)=>{ const e=map[a.colorwayId]; return e&&e.yarn.gps? s+(a.grams/e.yarn.gps)*e.yarn.mps:s; },0);
    const projSkeins=(p)=>p.allocations.reduce((s,a)=>{ const e=map[a.colorwayId]; return e&&e.yarn.gps? s+(a.grams/e.yarn.gps):s; },0);
    let gG=0,gM=0,gS=0;
    st.projects.forEach(p=>{ gG+=projGrams(p); gM+=projMeters(p); gS+=projSkeins(p); });
    const completed=st.projects.filter(p=>p.endDate).length;
    const active=st.projects.filter(p=>!p.endDate);

    const yarnLine=(p)=>{ if(!p.allocations.length) return 'Pas encore de laine'; const e=map[p.allocations[0].colorwayId]; const extra=p.allocations.length>1?` +${p.allocations.length-1}`:''; return e? `${e.yarn.name} · ${e.cw.color}${extra}`:'Laine retirée'; };
    const yarnDot=(p)=>{ const e=p.allocations[0]&&map[p.allocations[0].colorwayId]; return `width:11px;height:11px;border-radius:50%;flex:none;background:${e?e.cw.hex:'var(--color-neutral-400)'}`; };
    const since=(p)=>{ if(!p.startDate) return ''; const d=new Date(p.startDate); return 'depuis '+d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'}); };

    const activeProjects=active.map(p=>({id:p.id,name:p.name,patternName:patName(p),thumbStyle:this.projThumbStyle(p,map),yarnLine:yarnLine(p),yarnDot:yarnDot(p),since:since(p),open:this.editProject(p.id)}));

    const stockBucket=(g)=>g<=0?'Épuisé':g<100?'< 100 g':g<300?'100–300 g':g<600?'300–600 g':'600 g +';
    const stashRows=st.stash.filter(y=>
      this.filterPass('stash','brand',y.brand||'Sans marque') &&
      this.filterPass('stash','gps',y.gps?String(y.gps):'—') &&
      this.filterPass('stash','stock',stockBucket(y.colorways.reduce((s,c)=>s+(c.grams-this.allocatedTo(c.id)),0)))
    ).map(y=>{
      const colorways=y.colorways.map(cw=>{ const alloc=this.allocatedTo(cw.id); const avail=cw.grams-alloc;
        const photoUrl=cw.photo?st.signedUrls[cw.photo]:'';
        const adj=this.getGramsAdjust(cw.id);
        return {id:cw.id,color:cw.color,hex:cw.hex,dyeLot:cw.dyeLot,grams:cw.grams,alloc,avail,
          skeins:y.gps?(avail/y.gps).toFixed(1):'0',allocLabel:alloc>0?`${alloc} g réservés`:'',
          swatch:`width:26px;height:26px;border-radius:50%;flex:none;background-color:${cw.hex};box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.12)`+(photoUrl?`;background-image:url(${photoUrl});background-size:cover;background-position:center`:''),
          editing:st.editingCw===cw.id,startEdit:this.startEditCw(y.id,cw.id),saveEdit:this.saveEditCw(y.id,cw.id),
          adjustSign:adj.sign,adjustValue:adj.value,toggleSign:this.toggleGramsSign(cw.id),
          setAdjustValue:this.setGramsAdjustValue(cw.id),onAdjustKey:this.onGramsAdjustKey(y.id,cw.id),
          applyAdjust:this.applyGramsAdjust(y.id,cw.id),
          del:this.deleteCw(y.id,cw.id)}; });
      const totalAvail=colorways.reduce((s,c)=>s+c.avail,0);
      const totalSkeins=y.gps?(colorways.reduce((s,c)=>s+c.avail,0)/y.gps).toFixed(1):'0';
      return {id:y.id,brand:y.brand,name:y.name,blend:y.blend,mps:y.mps,gps:y.gps,colorways,
        totalAvail,totalSkeins,cwCount:y.colorways.length,
        expanded:st.expandedYarn===y.id,toggle:this.toggleYarn(y.id),del:this.deleteYarn(y.id),
        startEdit:this.openYarnEdit(y.id),
        addCwOpen:st.cwFor===y.id,startCw:this.startCw(y.id),cancelCw:this.cancelCw,addCw:this.addCw(y.id),
        caret:`transition:transform .2s;transform:rotate(${st.expandedYarn===y.id?90:0}deg)`};
    });
    const usedBrands=st.stash.map(y=>y.brand).filter(Boolean);
    const allBrands=Array.from(new Set([...st.brands,...usedBrands]));
    const manageBrandsList=allBrands.map(b=>({label:b,del:this.deleteBrand(b)}));
    const usedGps=Array.from(new Set(st.stash.map(y=>y.gps).filter(Boolean))).sort((a,b)=>a-b).map(String);
    const stockOptions=['Épuisé','< 100 g','100–300 g','300–600 g','600 g +'];
    const stashFilterBtn=this.renderFilterButton('stash',['brand','gps','stock']);
    const stashFilterPanel=this.renderFilterPanel('stash',[{dim:'brand',label:'Marque',options:allBrands},{dim:'gps',label:'g / pelote',options:usedGps},{dim:'stock',label:'Disponible',options:stockOptions}]);

    const usedCats=st.patterns.map(p=>p.category).filter(Boolean);
    const allCats=Array.from(new Set([...st.categories,...usedCats]));
    const usedAuthors=st.patterns.map(p=>p.author).filter(Boolean);
    const allAuthors=Array.from(new Set([...st.authors,...usedAuthors]));
    // Panneau « gérer les catégories / auteurs »
    const manageCats=allCats.map(c=>({label:c,del:this.deleteCategory(c)}));
    const manageAuthors=allAuthors.map(a=>({label:a,del:this.deleteAuthor(a)}));
    const libraryFilterBtn=this.renderFilterButton('library',['category','author']);
    const libraryFilterPanel=this.renderFilterPanel('library',[{dim:'category',label:'Catégorie',options:allCats},{dim:'author',label:'Auteur',options:allAuthors}]);
    const usedIn=(id)=>st.projects.filter(p=>(p.patternLinks||[]).some(l=>l.patternId===id)).length;
    const patterns=st.patterns.filter(p=>this.filterPass('library','category',p.category)&&this.filterPass('library','author',p.author)).map(p=>{
      const url=p.kind==='img'&&p.path? st.signedUrls[p.path]:'';
      return {id:p.id,name:p.name,category:p.category,author:p.author||'Sans auteur',isPdf:p.kind==='pdf',
        coverStyle:`height:150px;display:flex;align-items:center;justify-content:center;${url?`background-image:url(${url});background-size:cover;background-position:center`:`background:linear-gradient(135deg,var(--color-accent-200),var(--color-accent-2-200))`}`,
        usedLabel:usedIn(p.id)>0?`${usedIn(p.id)} projet(s)`:'Non utilisé',del:this.deletePattern(p.id),edit:this.startEditPattern(p.id)};
    });

    // ---- needle stash ----
    const needleUsedIn=(id)=>st.projects.filter(p=>(p.needleLinks||[]).some(l=>l.needleId===id)).length;
    const usedSizes=st.needles.map(n=>n.size).filter(Boolean);
    const allSizes=Array.from(new Set([...st.needleSizes,...usedSizes])).sort((a,b)=>parseFloat(a)-parseFloat(b));
    const filteredNeedles=st.needles.filter(n=>
      this.filterPass('needles','size',n.size) &&
      this.filterPass('needles','type',n.interchangeable?'Interchangeable':'Fixe'));
    const needleRows=filteredNeedles.map(n=>({id:n.id,brand:n.brand||'Sans marque',size:n.size!==''?n.size+' mm':'—',length:n.length||'—',
      interchangeable:n.interchangeable,usedLabel:needleUsedIn(n.id)>0?`${needleUsedIn(n.id)} projet(s)`:'Non utilisée',
      startEdit:this.openNeedleEdit(n.id),del:this.deleteNeedle(n.id)}));
    const manageSizesList=allSizes.map(l=>({label:l,del:this.deleteSize(l)}));
    const needlesFilterBtn=this.renderFilterButton('needles',['size','type']);
    const needlesFilterPanel=this.renderFilterPanel('needles',[{dim:'size',label:'Taille (mm)',options:allSizes},{dim:'type',label:'Type',options:['Interchangeable','Fixe']}]);

    let detail=null;
    if(st.projectDraft){ const d=st.projectDraft;
      const allocRows=d.allocations.map((a,i)=>{ const e=map[a.colorwayId];
        return {label:e?`${e.yarn.name} · ${e.cw.color}`:'Laine supprimée',dot:e?`width:14px;height:14px;border-radius:50%;flex:none;background:${e.cw.hex}`:'',
          grams:a.grams,dyeLot:e?e.cw.dyeLot:'',avail:e?e.cw.grams-this.allocatedTo(a.colorwayId):0,
          setGrams:this.setAllocGrams(i),remove:this.removeAlloc(i)}; });
      const options=[]; st.stash.forEach(y=>y.colorways.forEach(cw=>{ const avail=cw.grams-this.allocatedTo(cw.id); options.push({id:cw.id,label:`${y.name} · ${cw.color} — ${avail} g dispo`}); }));
      const photos=d.photos.map((ph,i)=>{ const url=st.signedUrls[ph.path]||'';
        return {key:this.photoKey(ph),idx:i,remove:this.removePhoto(i),onDown:this.photoPointerDown(i),
          dragging:!!(st.dragPhoto&&st.dragPhoto.key===this.photoKey(ph)),
          imgEl: url? h('img',{src:url,draggable:false,style:{width:'100%',height:'100%',objectFit:'cover',pointerEvents:'none'}}) : h('div',{style:{width:'100%',height:'100%',background:'var(--color-neutral-200)'}})}; });
      const needleLinks=(d.needleLinks||[]).map((l,i)=>{ const n=st.needles.find(x=>x.id===l.needleId);
        return {label:n?this.needleLabel(n):'Aiguille supprimée',interchangeable:!!(n&&n.interchangeable),remove:this.removeProjectNeedle(i)}; });
      const linkedNeedleIds=new Set((d.needleLinks||[]).map(l=>l.needleId));
      const needleOptions=st.needles.filter(n=>!linkedNeedleIds.has(n.id)).map(n=>({id:n.id,label:this.needleLabel(n)}));

      const patternLinks=(d.patternLinks||[]).map((l,i)=>{ const pat=st.patterns.find(x=>x.id===l.patternId);
        return {id:l.patternId,label:pat?pat.name:'Patron supprimé',active:st.previewPatternId===l.patternId,
          setPreview:this.setPreviewPattern(l.patternId),remove:this.removeProjectPattern(i)}; });
      const linkedPatternIds=new Set((d.patternLinks||[]).map(l=>l.patternId));
      const patternOptions=st.patterns.filter(p=>!linkedPatternIds.has(p.id)).map(p=>({id:p.id,label:p.name}));
      const previewId=st.previewPatternId||((d.patternLinks&&d.patternLinks[0])?d.patternLinks[0].patternId:null);
      const selP=st.patterns.find(x=>x.id===previewId);
      const patUrl=selP&&selP.path?(st.signedUrls[selP.path]||''):'';
      const patIsImg=!!(selP&&selP.kind==='img');
      const patIsPdf=!!(selP&&selP.kind==='pdf');
      const patImgEl=(patIsImg&&patUrl)?h('img',{src:patUrl,style:{width:'100%',display:'block',borderRadius:'14px'}}):null;

      detail={id:d.id,isNew:!d.id,name:d.name,size:d.size,gauge:d.gauge,
        startDate:d.startDate,endDate:d.endDate,done:!!d.endDate,notes:d.notes,notesHtml:this.renderMarkdown(d.notes),photos,
        allocRows,options,pickId:st.allocPick.colorwayId,pickGrams:st.allocPick.grams,
        needleLinks,needleOptions,needlePickId:st.needlePick,hasNeedleStash:st.needles.length>0,
        patternLinks,patternOptions,patternPickId:st.patternPick,hasPatternLibrary:st.patterns.length>0,
        hasPattern:!!selP,patternName:selP?selP.name:'',patternMeta:this.patMeta(previewId),
        patIsImg,patIsPdf,patUrl,patImgEl,
        totalGrams:projGrams(d)};
    }

    const projectCards=st.projects.map(p=>({id:p.id,name:p.name,patternName:patName(p),done:!!p.endDate,
      statusLabel:p.endDate?'Terminé':'En cours',statusClass:p.endDate?'tag tag-neutral':'tag tag-accent-2',
      thumbStyle:this.projThumbStyle(p,map),yarnLine:yarnLine(p),yarnDot:yarnDot(p),
      dateLabel:p.endDate?('Fini le '+new Date(p.endDate).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})):since(p),
      open:this.editProject(p.id)}));

    const email=(st.session&&st.session.user&&st.session.user.email)||'';
    const localPart=email.split('@')[0]||'Toi';
    const userName=(st.displayName&&st.displayName.trim())||(localPart.charAt(0).toUpperCase()+localPart.slice(1));
    const createdAt=st.session&&st.session.user&&st.session.user.created_at;
    const memberSince=createdAt? ('Membre depuis '+new Date(createdAt).toLocaleDateString('fr-FR',{month:'long',year:'numeric'})):'';

    return {
      goHome:this.go('home'),goLibrary:this.go('library'),goStash:this.go('stash'),goNeedles:this.go('needles'),goProjects:this.go('projects'),
      navHome:this.navStyle('home'),navLibrary:this.navStyle('library'),navStash:this.navStyle('stash'),navNeedles:this.navStyle('needles'),navProjects:this.navStyle('projects'),
      homeShow:st.zone==='home'?'':'display:none', libraryShow:st.zone==='library'?'':'display:none',
      stashShow:st.zone==='stash'?'':'display:none',
      needlesShow:st.zone==='needles'?'':'display:none',
      projectsShow:(st.zone==='projects'&&!st.projectDraft)?'':'display:none', detailShow:(st.zone==='projects'&&st.projectDraft)?'':'display:none',
      todayStr:new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}),
      statCompleted:completed,statSkeins:gS.toFixed(1),statGrams:this.fmt(gG),statMeters:this.fmt(gM),
      statGramsShort:this.fmt(st.stash.reduce((s,y)=>s+y.colorways.reduce((t,c)=>t+c.grams,0),0))+' g',
      activeCount:active.length,activeProjects,noActive:active.length===0,newProject:this.newProject,
      stashRows,yarnDialog:st.yarnDialog,yarnEdit:!!st.yarnEditId,openYarnAdd:this.openYarnAdd,closeYarnDialog:this.closeYarnDialog,saveYarn:this.saveYarn,yd:st.yarnDraft,
      setYBrand:this.setYarnDraft('brand'),setYName:this.setYarnDraft('name'),setYMps:this.setYarnDraft('mps'),setYGps:this.setYarnDraft('gps'),
      setYBlend:this.setYarnDraft('blend'),setYColor:this.setYarnDraft('color'),setYHex:this.setYarnDraftHex,setYDye:this.setYarnDraft('dyeLot'),setYGrams:this.setYarnDraft('grams'),
      cwDraft:st.cwDraft,setCwColor:this.setCwDraft('color'),setCwHex:this.setCwDraft('hex'),setCwDye:this.setCwDraft('dyeLot'),setCwGramsD:this.setCwDraft('grams'),
      cwEditDraft:st.cwEditDraft,cancelEditCw:this.cancelEditCw,
      setCwEColor:this.setCwEditDraft('color'),setCwEHex:this.setCwEditHex,setCwEDye:this.setCwEditDraft('dyeLot'),setCwEGrams:this.setCwEditDraft('grams'),
      signedUrls:st.signedUrls,onCwPhotoYarn:this.onCwPhoto('yarn'),onCwPhotoAdd:this.onCwPhoto('add'),onCwPhotoEdit:this.onCwPhoto('edit'),
      removeCwPhotoYarn:this.removeCwPhoto('yarn'),removeCwPhotoAdd:this.removeCwPhoto('add'),removeCwPhotoEdit:this.removeCwPhoto('edit'),
      stashEmpty:st.stash.length===0,stashFilteredEmpty:st.stash.length>0&&stashRows.length===0,
      stashFilterBtn,stashFilterPanel,brandOptions:allBrands,
      manageBrands:st.manageBrands,toggleManageBrands:this.toggleManageBrands,manageBrandsList,newBrand:st.newBrand,setNewBrand:this.setNewBrand,addBrand:this.addBrand,
      libraryFilterBtn,libraryFilterPanel,patterns,openPattern:this.openPattern,patternsEmpty:patterns.length===0,
      manageTax:st.manageTax,toggleManageTax:this.toggleManageTax,manageCats,manageAuthors,
      newCategory:st.newCategory,setNewCategory:this.setNewCategory,addCategory:this.addCategory,
      newAuthor:st.newAuthor,setNewAuthor:this.setNewAuthor,addAuthor:this.addAuthor,
      patternDialog:st.patternDialog,patternEdit:!!st.patternEditId,pd:st.patternDraft,closePattern:this.closePattern,savePattern:this.savePattern,onPatternFile:this.onPatternFile,
      catOptions:allCats,authorOptions:allAuthors,
      tagPrompt:st.tagPrompt,openCatPrompt:this.openTagPrompt('category'),openAuthorPrompt:this.openTagPrompt('author'),
      closeTagPrompt:this.closeTagPrompt,setTagPromptValue:this.setTagPromptValue,confirmTagPrompt:this.confirmTagPrompt,
      setPName:this.setPatternDraft('name'),setPCat:this.setPatternDraft('category'),setPAuthor:this.setPatternDraft('author'),
      pdHasFile:!!(st.patternDraft.fileName),pdFileName:st.patternDraft.fileName||'',
      pdCover:(st.patternDraft.kind==='img'&&st.patternDraft.path&&st.signedUrls[st.patternDraft.path])?`background-image:url(${st.signedUrls[st.patternDraft.path]});background-size:cover;background-position:center`:'background:linear-gradient(135deg,var(--color-accent-200),var(--color-accent-2-200))',
      projectCards,projectsEmpty:st.projects.length===0,detail,
      setName:this.setPD('name'),setSize:this.setPD('size'),setGauge:this.setPD('gauge'),
      setStart:this.setPD('startDate'),setEnd:this.setPD('endDate'),setNotes:this.setPD('notes'),
      cancelEdit:this.cancelEdit,saveProject:this.saveProject,finishProject:this.finishProject,reopenProject:this.reopenProject,deleteProject:this.deleteProject,
      setPickId:this.setAllocPick('colorwayId'),setPickGrams:this.setAllocPick('grams'),addAlloc:this.addAlloc,
      setNeedlePick:this.setNeedlePick,addProjectNeedle:this.addProjectNeedle,
      setPatternPick:this.setPatternPick,addProjectPattern:this.addProjectPattern,
      onProjectPhoto:this.onProjectPhoto,dragPhoto:st.dragPhoto,setPhotoGridRef:(el)=>{this._photoGrid=el;},
      pendingNav:st.pendingNav,confirmNavSave:this.confirmNavSave,confirmNavDiscard:this.confirmNavDiscard,cancelNav:this.cancelNav,
      confirm:st.confirm,confirmYes:this.confirmYes,confirmNo:this.confirmNo,
      // needle stash
      needleRows,needlesEmpty:st.needles.length===0,needlesFilteredEmpty:needleRows.length===0,
      needleDialog:st.needleDialog,needleEdit:!!st.needleEditId,openNeedleAdd:this.openNeedleAdd,closeNeedleDialog:this.closeNeedleDialog,saveNeedle:this.saveNeedle,nd:st.needleDraft,
      setNBrand:this.setNeedleDraft('brand'),setNSize:this.setNeedleDraft('size'),setNLength:this.setNeedleDraft('length'),setNInterVal:this.setNeedleDraftVal('interchangeable'),
      needlesFilterBtn,needlesFilterPanel,sizeOptions:allSizes,
      manageSizes:st.manageSizes,toggleManageSizes:this.toggleManageSizes,manageSizesList,newSize:st.newSize,setNewSize:this.setNewSize,addSize:this.addSize,
      profPatterns:st.patterns.length,profYarns:st.stash.length,
      profColorways:st.stash.reduce((s,y)=>s+y.colorways.length,0),
      profOwned:this.fmt(st.stash.reduce((s,y)=>s+y.colorways.reduce((t,c)=>t+c.grams,0),0)),
      profActive:active.length+' en cours',profDone:completed+' terminés',
      profFibers:this.fiberBreakdown(),
      modalOpen:st.patternDialog,closeModals:this.closeModals,
      editingName:st.editingName,nameDraft:st.nameDraft,startEditName:this.startEditName,cancelEditName:this.cancelEditName,setNameDraft:this.setNameDraft,saveName:this.saveName,
      userName,userEmail:email,avatarLetter:userName.charAt(0).toUpperCase()||'?',memberSince,signOut:this.signOut,
      avatarUrl:st.avatarPath?st.signedUrls[st.avatarPath]:'',onAvatarPhoto:this.onAvatarPhoto,removeAvatarPhoto:this.removeAvatarPhoto,
    };
  }
  projHex(p,map){ const a=p.allocations[0]; const e=a&&map[a.colorwayId]; return e?e.cw.hex:'#c9a06a'; }
  patSrc(id){ const p=this.state.patterns.find(x=>x.id===id); return p&&p.path? (this.state.signedUrls[p.path]||''):''; }
  patHasImg(id){ const p=this.state.patterns.find(x=>x.id===id); return !!(p&&p.kind==='img'&&p.path&&this.state.signedUrls[p.path]); }
  patMeta(id){ const p=this.state.patterns.find(x=>x.id===id); return p?`${p.category} · ${p.author||'Auteur inconnu'}`:''; }
  fiberBreakdown(){
    const bag={};
    this.state.stash.forEach(y=>{ const g=y.colorways.reduce((s,c)=>s+c.grams,0); const key=(y.blend||'Autre').split(/[·,]/)[0].replace(/\d+%/,'').trim()||'Autre'; bag[key]=(bag[key]||0)+g; });
    const total=Object.values(bag).reduce((s,v)=>s+v,0)||1;
    const palette=['var(--color-accent-500)','var(--color-accent-2-500)','var(--color-accent-300)','var(--color-accent-2-300)','var(--color-neutral-400)'];
    return Object.entries(bag).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v],i)=>({label:k,grams:v,pct:Math.round(v/total*100),
      bar:`height:10px;border-radius:999px;background:${palette[i%palette.length]};width:${Math.max(4,Math.round(v/total*100))}%`}));
  }

  renderAuth(){
    const st=this.state;
    if(st.authMode==='check-email'){
      return html`
      <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--color-bg);font-family:var(--font-body)">
        <div style="max-width:380px;width:100%;text-align:center;padding:36px 28px;border-radius:26px;background:var(--color-surface);box-shadow:var(--shadow-md)">
          <div style="font-family:var(--font-heading);font-size:24px;margin-bottom:10px">Vérifie ta boîte mail</div>
          <p class="text-muted" style="font-size:14px">On a envoyé un lien de confirmation à <strong>${st.authEmail}</strong>. Clique dessus puis reviens te connecter ici.</p>
          <button class="btn btn-secondary" style="margin-top:16px" onClick=${()=>this.setState({authMode:'signin',authError:''})}>Retour à la connexion</button>
        </div>
      </div>`;
    }
    return html`
    <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--color-bg);font-family:var(--font-body)">
      <form onSubmit=${this.submitAuth} style="max-width:380px;width:100%;padding:36px 28px;border-radius:26px;background:var(--color-surface);box-shadow:var(--shadow-md);display:flex;flex-direction:column;gap:16px">
        <div style="text-align:center;margin-bottom:6px">
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none" style="margin:0 auto 10px;display:block"><circle cx="16" cy="16" r="14" fill="var(--color-accent)"/><path d="M9 16c3-5 11-5 14 0M9 16c3 5 11 5 14 0M13 6c-4 4-4 16 0 20M19 6c4 4 4 16 0 20" stroke="var(--color-bg)" stroke-width="1.6" fill="none"/></svg>
          <div style="font-family:var(--font-heading);font-size:24px">Maille</div>
          <div class="text-muted" style="font-size:13px;margin-top:4px">${st.authMode==='signup'?'Crée ton compte':'Connecte-toi à ton carnet de tricot'}</div>
        </div>
        <div class="field"><label>Email</label><input class="input" type="email" required autocomplete="email" value=${st.authEmail} onInput=${this.setAuthField('authEmail')} placeholder="toi@exemple.com"/></div>
        <div class="field"><label>Mot de passe</label><input class="input" type="password" required minlength="6" autocomplete=${st.authMode==='signup'?'new-password':'current-password'} value=${st.authPassword} onInput=${this.setAuthField('authPassword')} placeholder="••••••••"/></div>
        ${st.authError && html`<div style="font-size:13px;color:var(--color-accent-700)">${st.authError}</div>`}
        <button class="btn btn-primary btn-block" type="submit" disabled=${st.authBusy} style="margin:0">${st.authBusy?'…':(st.authMode==='signup'?'Créer mon compte':'Se connecter')}</button>
        <button type="button" class="btn btn-ghost" style="justify-content:center" onClick=${this.toggleAuthMode}>${st.authMode==='signup'?'Déjà un compte ? Se connecter':"Pas de compte ? En créer un"}</button>
      </form>
    </div>`;
  }

  render(){
    const st=this.state;
    if(!st.sessionChecked){
      return html`<div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;color:var(--color-text);font-family:var(--font-body)">Chargement…</div>`;
    }
    if(!st.session){
      return this.renderAuth();
    }
    if(!st.loaded){
      return html`<div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;color:var(--color-text);font-family:var(--font-body)">Chargement de tes données…</div>`;
    }
    const v=this.renderVals();
    return html`
    <div class="app-root" style="display:flex;min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body)">

      <aside class="side" style="width:236px;flex:none;padding:26px 18px;display:flex;flex-direction:column;gap:6px;position:sticky;top:0;height:100vh;border-right:1px solid var(--color-divider)">
        <div class="side-brand" style="display:flex;align-items:center;gap:11px;padding:0 8px 22px">
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="var(--color-accent)"/><path d="M9 16c3-5 11-5 14 0M9 16c3 5 11 5 14 0M13 6c-4 4-4 16 0 20M19 6c4 4 4 16 0 20" stroke="var(--color-bg)" stroke-width="1.6" fill="none"/></svg>
          <div><div style="font-family:var(--font-heading);font-size:20px;line-height:1">Maille</div><div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--color-accent)">carnet de tricot</div></div>
        </div>
        <button class="nav-btn" aria-label="Accueil" title="Accueil" onClick=${v.goHome} style=${v.navHome}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg><span class="nav-label">Accueil</span></button>
        <button class="nav-btn" aria-label="Projets" title="Projets" onClick=${v.goProjects} style=${v.navProjects}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg><span class="nav-label">Projets</span></button>
        <button class="nav-btn" aria-label="Yarn Stash" title="Yarn Stash" onClick=${v.goStash} style=${v.navStash}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M6 8c4 3 8 5 11 3M5 14c5 2 9 1 13-4M9 20c1-6 3-10 7-13"/></svg><span class="nav-label">Yarn Stash</span></button>
        <button class="nav-btn" aria-label="Aiguilles" title="Aiguilles" onClick=${v.goNeedles} style=${v.navNeedles}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 20 4"/><path d="M14 10l4-4"/><circle cx="4.5" cy="19.5" r="1.4"/><path d="M9 15 6 18"/></svg><span class="nav-label">Aiguilles</span></button>
        <button class="nav-btn" aria-label="Bibliothèque" title="Bibliothèque" onClick=${v.goLibrary} style=${v.navLibrary}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M8 4v16"/></svg><span class="nav-label">Bibliothèque</span></button>
        <div class="side-summary" style="margin-top:auto;padding:14px 12px;border-radius:20px;background:var(--color-accent-2-100)">
          <div style="font-size:11px;color:var(--color-accent-2-700);line-height:1.4">${v.activeCount} projet(s) en cours · ${v.statGramsShort} de laine en réserve</div>
        </div>
      </aside>

      <main class="main" style="flex:1;min-width:0;padding:34px 40px 60px;max-width:1120px">

        <section style=${v.homeShow}>
          <!-- Bande profil -->
          <div class="profile-band" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;border-radius:26px;background:var(--color-surface);padding:20px 26px;box-shadow:var(--shadow-sm);margin-bottom:24px">
            <div style="position:relative;flex:none;width:64px;height:64px">
              <div style=${'width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-heading);font-size:26px;color:var(--color-bg);'+(v.avatarUrl?`background-image:url(${v.avatarUrl});background-size:cover;background-position:center`:'background:radial-gradient(circle at 35% 30%,var(--color-accent-300),var(--color-accent-600))')}>${!v.avatarUrl?v.avatarLetter:''}</div>
              <label class="btn btn-icon btn-primary" style="position:absolute;bottom:-2px;right:-2px;width:26px;height:26px;padding:0;cursor:pointer" title="Changer la photo de profil">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <input type="file" accept="image/*" onChange=${v.onAvatarPhoto} style="display:none"/>
              </label>
              ${v.avatarUrl && html`<button class="btn btn-icon btn-ghost" style="position:absolute;top:-2px;right:-2px;width:20px;height:20px;padding:0;background:var(--color-surface);box-shadow:var(--shadow-sm)" onClick=${v.removeAvatarPhoto} title="Retirer la photo"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`}
            </div>
            <div style="flex:1;min-width:200px">
              ${!v.editingName && html`
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="font-family:var(--font-heading);font-size:22px">${v.userName}</div>
                  <button class="btn btn-icon btn-ghost" style="width:24px;height:24px" onClick=${v.startEditName} title="Modifier le nom"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                </div>`}
              ${v.editingName && html`
                <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;width:100%;max-width:420px">
                  <input class="input" value=${v.nameDraft} onInput=${v.setNameDraft} placeholder="Ton prénom" autofocus style="flex:1 1 220px;min-width:0;font-size:18px;height:48px;font-family:var(--font-heading)" onKeyDown=${(e)=>{if(e.key==='Enter')v.saveName();}}/>
                  <div style="display:flex;gap:8px;flex:none;margin-left:auto">
                    <button class="btn btn-icon btn-secondary" style="width:40px;height:40px;flex:none" onClick=${v.cancelEditName} title="Annuler"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                    <button class="btn btn-icon btn-primary" style="width:40px;height:40px;flex:none" onClick=${v.saveName} title="Enregistrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg></button>
                  </div>
                </div>`}
              <div style="font-size:12px;margin-top:2px" class="text-muted">${v.userEmail} · ${v.memberSince}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="tag tag-accent">${v.profActive}</span><span class="tag tag-accent-2">${v.profDone}</span>
              <button class="btn btn-ghost" onClick=${v.signOut}>Se déconnecter</button>
            </div>
          </div>

          <div class="zone-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px">
            <div>
              <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--color-accent);margin-bottom:6px">${v.todayStr}</div>
              <h1 style="margin:0;font-size:40px">Bonjour, ${v.userName}</h1>
              <p style="margin:6px 0 0;font-size:15px" class="text-muted">Voici où en est ton tricot aujourd'hui.</p>
            </div>
            <button class="btn btn-primary" onClick=${v.newProject}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nouveau projet</button>
          </div>

          <!-- Stats + réserve fusionnées -->
          <div class="stat-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:36px;line-height:1;color:var(--color-accent)">${v.profOwned}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Grammes en réserve</div>
            </div>
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:36px;line-height:1">${v.profYarns}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Laines · ${v.profColorways} coloris</div>
            </div>
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:36px;line-height:1">${v.profPatterns}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Patrons en bibliothèque</div>
            </div>
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:36px;line-height:1">${v.statCompleted}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Projets terminés</div>
            </div>
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:36px;line-height:1">${v.statSkeins}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Pelotes utilisées</div>
            </div>
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:36px;line-height:1">${v.statGrams}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Grammes utilisés</div>
            </div>
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:36px;line-height:1">${v.statMeters}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Mètres tricotés</div>
            </div>
          </div>

          <!-- Graphique répartition par fibre -->
          <div style="border-radius:22px;background:var(--color-surface);padding:22px;margin-bottom:34px">
            <h4 style="margin:0 0 16px;font-size:18px">Ta réserve par fibre</h4>
            <div style="display:flex;flex-direction:column;gap:14px">
              ${v.profFibers.map(f=>html`
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="font-weight:600">${f.label}</span><span class="text-muted">${f.grams} g · ${f.pct}%</span></div>
                  <div style="background:var(--color-bg);border-radius:999px"><div style=${f.bar}></div></div>
                </div>`)}
              ${v.profFibers.length===0 && html`<div class="text-muted" style="font-size:13px">Aucune laine en réserve.</div>`}
            </div>
          </div>

          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px">
            <h2 style="margin:0;font-size:24px">Projets en cours</h2>
            <a onClick=${v.goProjects} style="cursor:pointer;font-size:13px;color:var(--color-accent)">Tout voir →</a>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
            ${v.activeProjects.map(p=>html`
              <div onClick=${p.open} style="cursor:pointer;border-radius:24px;background:var(--color-surface);overflow:hidden;animation:pop .25s ease both;box-shadow:var(--shadow-sm)">
                <div style=${p.thumbStyle}></div>
                <div style="padding:16px 18px 18px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><span class="tag tag-accent-2">En cours</span><span style="font-size:11px" class="text-muted">${p.since}</span></div>
                  <div style="font-family:var(--font-heading);font-size:19px;line-height:1.15">${p.name}</div>
                  <div style="font-size:13px;margin-top:4px" class="text-muted">${p.patternName}</div>
                  <div style="font-size:12px;margin-top:12px;display:flex;align-items:center;gap:7px"><span style=${p.yarnDot}></span>${p.yarnLine}</div>
                </div>
              </div>`)}
            ${v.noActive && html`<div style="grid-column:1/-1;padding:40px;text-align:center;border:2px dashed var(--color-divider);border-radius:24px" class="text-muted">Aucun projet en cours. Lances-en un nouveau !</div>`}
          </div>
        </section>

        <section style=${v.stashShow}>
          <div class="zone-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:8px">
            <div>
              <h1 style="margin:0;font-size:36px">Yarn Stash</h1>
              <p style="margin:6px 0 0" class="text-muted">Ta réserve de laine. Les grammes se mettent à jour quand tu associes une laine à un projet.</p>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary" onClick=${v.toggleManageBrands} title="Gérer les marques"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Gérer</button>
              ${v.stashFilterBtn}
              <button class="btn btn-primary" onClick=${v.openYarnAdd}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Ajouter une laine</button>
            </div>
          </div>

          ${v.stashFilterPanel}

          ${v.manageBrands && html`
            <div style="border-radius:22px;background:var(--color-accent-2-100);padding:18px 20px;margin-bottom:18px;animation:pop .2s ease both">
              <div style="font-family:var(--font-heading);font-size:15px;margin-bottom:10px">Marques</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
                ${v.manageBrandsList.map(b=>html`<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;background:var(--color-surface);font-size:13px">${b.label}<button class="btn btn-icon btn-ghost" style="width:22px;height:22px" onClick=${b.del} title="Supprimer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`)}
                ${v.manageBrandsList.length===0 && html`<span class="text-muted" style="font-size:12px">Aucune marque</span>`}
              </div>
              <div style="display:flex;gap:8px;max-width:320px"><input class="input" value=${v.newBrand} onInput=${v.setNewBrand} placeholder="ex. De Rerum Natura" onKeyDown=${(e)=>{if(e.key==='Enter')v.addBrand();}}/><button class="btn btn-primary" onClick=${v.addBrand}>Ajouter</button></div>
            </div>`}

          <div class="stash-head" style="display:grid;grid-template-columns:44px 1.6fr 1fr .8fr .7fr 60px;gap:12px;padding:10px 18px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:color-mix(in srgb,var(--color-text) 55%,transparent)">
            <div></div><div>Laine</div><div>Composition</div><div>Coloris</div><div>Disponible</div><div></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:10px">
            ${v.stashRows.map(y=>html`
              <div style="border-radius:22px;background:var(--color-surface);overflow:hidden;box-shadow:var(--shadow-sm)">
                <div onClick=${y.toggle} class="stash-row" style="display:grid;grid-template-columns:44px 1.6fr 1fr .8fr .7fr 96px;gap:12px;align-items:center;padding:14px 18px;cursor:pointer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style=${y.caret}><path d="M9 6l6 6-6 6"/></svg>
                  <div class="stash-name"><div style="font-family:var(--font-heading);font-size:17px;line-height:1.1">${y.name}</div><div style="font-size:12px" class="text-muted">${y.brand}</div></div>
                  <div class="text-muted mob-hide" style="font-size:12.5px">${y.blend}</div>
                  <div class="mob-hide" style="font-size:13px">${y.cwCount} coloris</div>
                  <div><span style="font-family:var(--font-heading);font-size:19px">${y.totalAvail}</span> <span style="font-size:12px" class="text-muted">g · ${y.totalSkeins} pelotes</span></div>
                  <div style="display:flex;gap:2px;justify-content:flex-end">
                    <button class="btn btn-icon btn-ghost" onClick=${(e)=>{e.stopPropagation();y.startEdit(e);}} title="Modifier"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                    <button class="btn btn-icon btn-ghost" onClick=${y.del} title="Supprimer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button>
                  </div>
                </div>
                ${y.expanded && html`
                  <div style="padding:4px 18px 18px;animation:pop .2s ease both">
                    <div style="border-top:1px solid var(--color-divider);padding-top:14px;display:flex;flex-direction:column;gap:10px">
                      ${y.colorways.map(cw=> cw.editing ? html`
                          <div class="cw-form" style="display:grid;grid-template-columns:auto 1fr 1fr 1fr auto;gap:10px;align-items:end;padding:10px 12px;border-radius:16px;border:1px dashed var(--color-accent)">
                            <div class="field" style="margin:0"><label>Couleur / photo</label>${this.cwColorPhoto(v.cwEditDraft.hex,v.setCwEHex,v.cwEditDraft.photo,v.cwEditDraft.photo?v.signedUrls[v.cwEditDraft.photo]:'',v.onCwPhotoEdit,v.removeCwPhotoEdit)}</div>
                            <div class="field" style="margin:0"><label>Coloris</label><input class="input" value=${v.cwEditDraft.color} onInput=${v.setCwEColor}/></div>
                            <div class="field" style="margin:0"><label>Dye lot</label><input class="input" value=${v.cwEditDraft.dyeLot} onInput=${v.setCwEDye}/></div>
                            <div class="field" style="margin:0"><label>Grammes</label><input class="input" type="number" value=${v.cwEditDraft.grams} onInput=${v.setCwEGrams}/></div>
                            <div style="display:flex;gap:8px"><button class="btn btn-secondary" onClick=${v.cancelEditCw}>Annuler</button><button class="btn btn-primary" onClick=${cw.saveEdit}>Enregistrer</button></div>
                          </div>` : html`
                          <div class="cw-row" style="display:grid;grid-template-columns:34px 1fr auto auto 70px;gap:14px;align-items:center;padding:8px 12px;border-radius:16px;background:var(--color-bg)">
                            <div style=${cw.swatch}></div>
                            <div><div style="font-weight:600;font-size:14px">${cw.color}</div><div style="font-size:11px" class="text-muted">Dye lot ${cw.dyeLot} · ${cw.allocLabel}</div></div>
                            <div class="text-muted mob-hide" style="font-size:12px">${cw.skeins} pelotes</div>
                            <div class="cw-grams" style="display:flex;align-items:center;gap:10px">
                              <span style="font-family:var(--font-heading);font-size:16px">${cw.avail}</span><span style="font-size:11px" class="text-muted">g dispo</span>
                              <div style="position:relative;display:flex;align-items:center">
                                <button class="btn btn-icon btn-secondary" style="position:absolute;left:2px;top:50%;transform:translateY(-50%);width:32px;height:32px;padding:0;font-weight:700" onClick=${cw.toggleSign} title="Ajouter ou retirer des grammes">${cw.adjustSign}</button>
                                <input class="input" type="number" min="0" placeholder="qté" value=${cw.adjustValue} onInput=${cw.setAdjustValue} onKeyDown=${cw.onAdjustKey} style="width:92px;height:36px;padding-left:38px;text-align:right"/>
                              </div>
                              <button class="btn btn-icon btn-primary" style="width:32px;height:32px" onClick=${cw.applyAdjust} title="Valider la saisie"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
                            </div>
                            <div class="cw-actions" style="display:flex;gap:2px;justify-content:flex-end">
                              <button class="btn btn-icon btn-ghost" onClick=${cw.startEdit} title="Modifier"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                              <button class="btn btn-icon btn-ghost" onClick=${cw.del} title="Supprimer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                            </div>
                          </div>`)}
                      ${y.addCwOpen && html`
                        <div class="cw-form" style="display:grid;grid-template-columns:auto 1fr 1fr 1fr auto;gap:10px;align-items:end;padding:10px 12px;border-radius:16px;border:1px dashed var(--color-accent)">
                          <div class="field" style="margin:0"><label>Couleur / photo</label>${this.cwColorPhoto(v.cwDraft.hex,v.setCwHex,v.cwDraft.photo,v.cwDraft.photo?v.signedUrls[v.cwDraft.photo]:'',v.onCwPhotoAdd,v.removeCwPhotoAdd)}</div>
                          <div class="field" style="margin:0"><label>Coloris</label><input class="input" value=${v.cwDraft.color} onInput=${v.setCwColor} placeholder="Sauge"/></div>
                          <div class="field" style="margin:0"><label>Dye lot</label><input class="input" value=${v.cwDraft.dyeLot} onInput=${v.setCwDye} placeholder="8533"/></div>
                          <div class="field" style="margin:0"><label>Grammes</label><input class="input" type="number" value=${v.cwDraft.grams} onInput=${v.setCwGramsD} placeholder="100"/></div>
                          <div style="display:flex;gap:8px"><button class="btn btn-secondary" onClick=${y.cancelCw}>Annuler</button><button class="btn btn-primary" onClick=${y.addCw}>Ajouter</button></div>
                        </div>`}
                      ${this.addBtn('Ajouter un coloris / dye lot',y.startCw,'align-self:flex-start')}
                    </div>
                  </div>`}
              </div>`)}
            ${v.stashFilteredEmpty && html`<div style="padding:40px;text-align:center;border:2px dashed var(--color-divider);border-radius:22px" class="text-muted">Aucune laine pour ce filtre.</div>`}
            ${v.stashEmpty && html`<div style="padding:40px;text-align:center;border:2px dashed var(--color-divider);border-radius:22px" class="text-muted">Ton stash est vide. Ajoute ta première laine.</div>`}
          </div>
        </section>

        <section style=${v.needlesShow}>
          <div class="zone-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:16px">
            <div>
              <h1 style="margin:0;font-size:36px">Aiguilles</h1>
              <p style="margin:6px 0 0" class="text-muted">Ta réserve d'aiguilles. Trie par taille, et associe-les à tes projets.</p>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary" onClick=${v.toggleManageSizes} title="Gérer les tailles"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Gérer</button>
              ${v.needlesFilterBtn}
              <button class="btn btn-primary" onClick=${v.openNeedleAdd}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Ajouter une aiguille</button>
            </div>
          </div>

          ${v.needlesFilterPanel}

          ${v.manageSizes && html`
            <div style="border-radius:22px;background:var(--color-accent-2-100);padding:18px 20px;margin-bottom:18px;animation:pop .2s ease both">
              <div style="font-family:var(--font-heading);font-size:15px;margin-bottom:10px">Tailles (mm)</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
                ${v.manageSizesList.map(l=>html`<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;background:var(--color-surface);font-size:13px">${l.label} mm<button class="btn btn-icon btn-ghost" style="width:22px;height:22px" onClick=${l.del} title="Supprimer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`)}
                ${v.manageSizesList.length===0 && html`<span class="text-muted" style="font-size:12px">Aucune taille</span>`}
              </div>
              <div style="display:flex;gap:8px;max-width:320px"><input class="input" type="number" step="0.25" value=${v.newSize} onInput=${v.setNewSize} placeholder="ex. 4.5" onKeyDown=${(e)=>{if(e.key==='Enter')v.addSize();}}/><button class="btn btn-primary" onClick=${v.addSize}>Ajouter</button></div>
            </div>`}

          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px">
            ${v.needleRows.map(n=>html`
              <div style="border-radius:20px;background:var(--color-surface);box-shadow:var(--shadow-sm);overflow:hidden;animation:pop .2s ease both">
                <div style="padding:16px 18px">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                    <div style="font-family:var(--font-heading);font-size:24px;line-height:1">${n.size}</div>
                    <div style="display:flex;gap:2px">
                      <button class="btn btn-icon btn-ghost" onClick=${n.startEdit} title="Modifier" style="margin:-4px 0 0 0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                      <button class="btn btn-icon btn-ghost" onClick=${n.del} title="Supprimer" style="margin:-4px -6px 0 0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button>
                    </div>
                  </div>
                  <div style="font-size:13px;margin-top:4px" class="text-muted">${n.brand}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">
                    ${n.length!=='—' && html`<span class="tag tag-accent">${n.length}</span>`}
                    ${n.interchangeable && html`<span class="tag tag-accent-2">Interchangeable</span>`}
                    ${!n.interchangeable && html`<span class="tag tag-neutral">Fixe</span>`}
                  </div>
                  <div style="font-size:11px;margin-top:12px;color:var(--color-accent-2-700)">${n.usedLabel}</div>
                </div>
              </div>`)}
            ${v.needlesEmpty && html`<div style="grid-column:1/-1;padding:40px;text-align:center;border:2px dashed var(--color-divider);border-radius:22px" class="text-muted">Aucune aiguille. Ajoute ta première paire.</div>`}
            ${!v.needlesEmpty && v.needlesFilteredEmpty && html`<div style="grid-column:1/-1;padding:40px;text-align:center;border:2px dashed var(--color-divider);border-radius:22px" class="text-muted">Aucune aiguille pour ce filtre.</div>`}
          </div>
        </section>

        <section style=${v.libraryShow}>
          <div class="zone-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px">
            <div>
              <h1 style="margin:0;font-size:36px">Bibliothèque</h1>
              <p style="margin:6px 0 0" class="text-muted">Tes patrons, classés par type et par auteur. Associe-les à tes projets.</p>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary" onClick=${v.toggleManageTax} title="Gérer les catégories et auteurs"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Gérer</button>
              ${v.libraryFilterBtn}
              <button class="btn btn-primary" onClick=${v.openPattern}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Ajouter un patron</button>
            </div>
          </div>

          ${v.libraryFilterPanel}

          ${v.manageTax && html`
            <div style="border-radius:22px;background:var(--color-accent-2-100);padding:18px 20px;margin-bottom:20px;animation:pop .2s ease both">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px" class="form-grid">
                <div>
                  <div style="font-family:var(--font-heading);font-size:15px;margin-bottom:10px">Catégories</div>
                  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
                    ${v.manageCats.map(c=>html`<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;background:var(--color-surface);font-size:13px">${c.label}<button class="btn btn-icon btn-ghost" style="width:22px;height:22px" onClick=${c.del} title="Supprimer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`)}
                    ${v.manageCats.length===0 && html`<span class="text-muted" style="font-size:12px">Aucune catégorie</span>`}
                  </div>
                  <div style="display:flex;gap:8px"><input class="input" value=${v.newCategory} onInput=${v.setNewCategory} placeholder="Nouvelle catégorie" onKeyDown=${(e)=>{if(e.key==='Enter')v.addCategory();}}/><button class="btn btn-primary" onClick=${v.addCategory}>Ajouter</button></div>
                </div>
                <div>
                  <div style="font-family:var(--font-heading);font-size:15px;margin-bottom:10px">Auteurs / créateurs</div>
                  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
                    ${v.manageAuthors.map(a=>html`<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;background:var(--color-surface);font-size:13px">${a.label}<button class="btn btn-icon btn-ghost" style="width:22px;height:22px" onClick=${a.del} title="Supprimer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`)}
                    ${v.manageAuthors.length===0 && html`<span class="text-muted" style="font-size:12px">Aucun auteur</span>`}
                  </div>
                  <div style="display:flex;gap:8px"><input class="input" value=${v.newAuthor} onInput=${v.setNewAuthor} placeholder="Nouvel auteur" onKeyDown=${(e)=>{if(e.key==='Enter')v.addAuthor();}}/><button class="btn btn-primary" onClick=${v.addAuthor}>Ajouter</button></div>
                </div>
              </div>
            </div>`}

          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px">
            ${v.patterns.map(p=>html`
              <div style="border-radius:22px;background:var(--color-surface);overflow:hidden;box-shadow:var(--shadow-sm);animation:pop .25s ease both">
                <div class="washed" onClick=${p.edit} style=${'cursor:pointer;'+p.coverStyle}>
                  ${p.isPdf && html`<div style="display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--color-accent-700)"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg><span style="font-size:11px;font-weight:600">PDF</span></div>`}
                </div>
                <div style="padding:15px 17px 17px">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px">
                    <div><span class="tag tag-accent">${p.category}</span></div>
                    <div style="display:flex;gap:2px">
                      <button class="btn btn-icon btn-ghost" onClick=${p.edit} title="Modifier" style="margin:-6px 0 0 0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                      <button class="btn btn-icon btn-ghost" onClick=${p.del} title="Supprimer" style="margin:-6px -6px 0 0"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button>
                    </div>
                  </div>
                  <div style="font-family:var(--font-heading);font-size:18px;line-height:1.15;margin-top:10px">${p.name}</div>
                  <div style="font-size:13px;margin-top:3px" class="text-muted">${p.author}</div>
                  <div style="font-size:11px;margin-top:12px;color:var(--color-accent-2-700)">${p.usedLabel}</div>
                </div>
              </div>`)}
            ${v.patternsEmpty && html`<div style="grid-column:1/-1;padding:40px;text-align:center;border:2px dashed var(--color-divider);border-radius:22px" class="text-muted">Aucun patron dans cette sélection.</div>`}
          </div>
        </section>

        <section style=${v.projectsShow}>
          <div class="zone-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px">
            <div>
              <h1 style="margin:0;font-size:36px">Projets</h1>
              <p style="margin:6px 0 0" class="text-muted">Tes tricots en cours et terminés. Plusieurs projets actifs, c'est permis.</p>
            </div>
            <button class="btn btn-primary" onClick=${v.newProject}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nouveau projet</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:18px">
            ${v.projectCards.map(p=>html`
              <div onClick=${p.open} style="cursor:pointer;border-radius:24px;background:var(--color-surface);overflow:hidden;box-shadow:var(--shadow-sm);animation:pop .25s ease both">
                <div style=${p.thumbStyle}></div>
                <div style="padding:16px 18px 18px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:9px"><span class=${p.statusClass}>${p.statusLabel}</span><span style="font-size:11px" class="text-muted">${p.dateLabel}</span></div>
                  <div style="font-family:var(--font-heading);font-size:19px;line-height:1.15">${p.name}</div>
                  <div style="font-size:13px;margin-top:4px" class="text-muted">${p.patternName}</div>
                  <div style="font-size:12px;margin-top:12px;display:flex;align-items:center;gap:7px"><span style=${p.yarnDot}></span>${p.yarnLine}</div>
                </div>
              </div>`)}
            ${v.projectsEmpty && html`<div style="grid-column:1/-1;padding:40px;text-align:center;border:2px dashed var(--color-divider);border-radius:22px" class="text-muted">Aucun projet. Crée ton premier tricot.</div>`}
          </div>
        </section>

        <section style=${v.detailShow}>
          ${v.detail && html`
            <div class="detail-wrap">
              <button class="btn btn-ghost" onClick=${v.cancelEdit} style="margin-bottom:14px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Tous les projets</button>

              <input class="input" value=${v.detail.name} onInput=${v.setName} placeholder="Nom du projet" style="font-family:var(--font-heading);font-size:26px;height:auto;padding:12px 18px;border-radius:18px;margin-bottom:20px"/>

              <div class="detail-sections" style="display:flex;flex-direction:column;gap:20px">

                <!-- Section 1 · Informations -->
                <div style="border-radius:22px;background:var(--color-surface);padding:20px">
                  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-accent);margin-bottom:14px">Informations</div>
                  <div class="grid-4" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px">
                    <div class="field"><label>Taille</label><input class="input" value=${v.detail.size} onInput=${v.setSize} placeholder="M"/></div>
                    <div class="field"><label>Gauge (m. / 10 cm)</label><input class="input" type="number" value=${v.detail.gauge} onInput=${v.setGauge} placeholder="22"/></div>
                    <div class="field"><label>Date de début</label><input class="input" type="date" value=${v.detail.startDate} onInput=${v.setStart}/></div>
                    <div class="field"><label>Date de fin</label><input class="input" type="date" value=${v.detail.endDate||''} onInput=${v.setEnd}/></div>
                  </div>
                  <div class="field" style="margin-top:14px"><label>Notes</label><textarea class="input" value=${v.detail.notes} onInput=${v.setNotes} placeholder="Modifications, rangs, remarques… (markdown : **gras**, *italique*, # titre, - liste)" style="min-height:100px"></textarea></div>
                  ${v.detail.notesHtml && html`<div style="margin-top:10px;padding:12px 16px;border-radius:16px;background:var(--color-bg);font-size:13.5px">${v.detail.notesHtml}</div>`}
                </div>

                <!-- Section 2 · Aiguilles -->
                <div style="border-radius:22px;background:var(--color-surface);padding:20px">
                  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-accent);margin-bottom:14px">Aiguilles associées</div>
                  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
                    ${v.detail.needleLinks.map(n=>html`
                      <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:14px;background:var(--color-bg)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M4 20 20 4"/><path d="M14 10l4-4"/></svg>
                        <div style="flex:1;min-width:0;font-size:13.5px;font-weight:600">${n.label}</div>
                        ${n.interchangeable && html`<span class="tag tag-accent-2">Interch.</span>`}
                        <button class="btn btn-icon btn-ghost" style="width:28px;height:28px" onClick=${n.remove}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                      </div>`)}
                    ${v.detail.needleLinks.length===0 && html`<div class="text-muted" style="font-size:13px">Aucune aiguille associée.</div>`}
                  </div>
                  ${v.detail.hasNeedleStash && html`
                    <div style="display:flex;gap:10px;align-items:flex-end">
                      <div class="field" style="margin:0;flex:1"><label>Depuis le stash d'aiguilles</label>
                        <select class="input" value=${v.detail.needlePickId} onChange=${v.setNeedlePick}>
                          <option value="">Choisir une aiguille…</option>
                          ${v.detail.needleOptions.map(o=>html`<option value=${o.id}>${o.label}</option>`)}
                        </select>
                      </div>
                      ${this.addBtn('Associer',v.addProjectNeedle)}
                    </div>`}
                  ${!v.detail.hasNeedleStash && html`<div class="text-muted" style="font-size:11.5px">Ajoute des aiguilles dans l'onglet « Aiguilles » pour pouvoir les associer.</div>`}
                </div>

                <!-- Section 3 · Laines associées -->
                <div style="border-radius:22px;background:var(--color-surface);padding:20px">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-accent)">Laines associées</div><span style="font-size:12px" class="text-muted">${v.detail.totalGrams} g au total</span></div>
                  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
                    ${v.detail.allocRows.map(a=>html`
                      <div class="alloc-row" style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:12px;align-items:center;padding:10px 14px;border-radius:16px;background:var(--color-bg)">
                        <span style=${a.dot}></span>
                        <div><div style="font-weight:600;font-size:14px">${a.label}</div><div style="font-size:11px" class="text-muted">Dispo restant : ${a.avail} g</div></div>
                        <input class="input" type="number" value=${a.grams} onInput=${a.setGrams} style="width:92px;text-align:right"/>
                        <span style="font-size:12px" class="text-muted">g utilisés</span>
                        <button class="btn btn-icon btn-ghost" onClick=${a.remove}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                      </div>`)}
                    ${v.detail.allocRows.length===0 && html`<div class="text-muted" style="font-size:13px;padding:4px 2px">Aucune laine associée pour l'instant.</div>`}
                  </div>
                  <div class="alloc-add" style="display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:end;padding:12px 14px;border-radius:16px;border:1px dashed var(--color-accent-2)">
                    <div class="field" style="margin:0"><label>Depuis le stash</label>
                      <select class="input" value=${v.detail.pickId} onChange=${v.setPickId}>
                        <option value="">Choisir une laine…</option>
                        ${v.detail.options.map(o=>html`<option value=${o.id}>${o.label}</option>`)}
                      </select>
                    </div>
                    <div class="field" style="margin:0;width:110px"><label>Grammes</label><input class="input" type="number" value=${v.detail.pickGrams} onInput=${v.setPickGrams} placeholder="200"/></div>
                    ${this.addBtn('Associer',v.addAlloc)}
                  </div>
                  <p style="font-size:11.5px;margin:8px 2px 0" class="text-muted">Une même laine associée deux fois est fusionnée. Les grammes utilisés sont déduits du stash.</p>
                </div>

                <!-- Section 4 · Patron(s) -->
                <div style="border-radius:22px;background:var(--color-surface);padding:20px">
                  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-accent);margin-bottom:14px">Patron</div>
                  <div class="pattern-sec" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
                    <div>
                      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
                        ${v.detail.patternLinks.map(pl=>html`
                          <div onClick=${pl.setPreview} style=${'display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:14px;cursor:pointer;background:'+(pl.active?'var(--color-accent-200)':'var(--color-bg)')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M8 4v16"/></svg>
                            <div style="flex:1;min-width:0;font-size:13.5px;font-weight:600">${pl.label}</div>
                            <button class="btn btn-icon btn-ghost" style="width:28px;height:28px" onClick=${(e)=>{e.stopPropagation();pl.remove(e);}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                          </div>`)}
                        ${v.detail.patternLinks.length===0 && html`<div class="text-muted" style="font-size:13px">Aucun patron associé.</div>`}
                      </div>
                      ${v.detail.hasPatternLibrary && html`
                        <div style="display:flex;gap:10px;align-items:flex-end">
                          <div class="field" style="margin:0;flex:1"><label>Depuis la bibliothèque</label>
                            <select class="input" value=${v.detail.patternPickId} onChange=${v.setPatternPick}>
                              <option value="">Choisir un patron…</option>
                              ${v.detail.patternOptions.map(po=>html`<option value=${po.id}>${po.label}</option>`)}
                            </select>
                          </div>
                          ${this.addBtn('Associer',v.addProjectPattern)}
                        </div>`}
                      ${!v.detail.hasPatternLibrary && html`<div class="text-muted" style="font-size:11.5px">Ajoute des patrons dans la Bibliothèque pour pouvoir les associer.</div>`}
                      ${v.detail.hasPattern && html`<div style="font-size:13px;margin-top:12px" class="text-muted">${v.detail.patternMeta}</div>`}
                    </div>
                    <div>
                      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--color-accent-2-700);margin-bottom:8px">Aperçu</div>
                      ${v.detail.patIsImg && v.detail.patUrl && html`<div class="washed" style="border-radius:14px;overflow:hidden">${v.detail.patImgEl}</div>`}
                      ${v.detail.patIsPdf && html`<a href=${v.detail.patUrl} target="_blank" rel="noopener" style="text-decoration:none"><div style="height:150px;border-radius:14px;background:linear-gradient(135deg,var(--color-accent-200),var(--color-accent-2-200));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--color-accent-700)"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg><span style="font-size:12px;font-weight:600">Ouvrir le PDF</span></div></a>`}
                      ${(!v.detail.patIsImg||!v.detail.patUrl) && !v.detail.patIsPdf && html`<div style="height:150px;border-radius:14px;background:linear-gradient(135deg,var(--color-accent-200),var(--color-accent-2-200));display:flex;align-items:center;justify-content:center;color:var(--color-accent-700)"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M8 4v16"/></svg></div>`}
                    </div>
                  </div>
                </div>

                <!-- Section 5 · Photos -->
                <div style="border-radius:22px;background:var(--color-surface);padding:20px">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-accent)">Photos</div>${this.addFileBtn('Ajouter',v.onProjectPhoto)}</div>
                  ${v.detail.photos.length>1 && html`<div class="text-muted" style="font-size:11.5px;margin-bottom:10px">Glisse les photos pour les réordonner. La première est la vignette du projet.</div>`}
                  <div ref=${v.setPhotoGridRef} style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
                    ${v.detail.photos.map(ph=>html`
                      <div key=${ph.key} data-photo-key=${ph.key} data-photo-idx=${ph.idx} onPointerDown=${ph.onDown}
                        style=${'position:relative;border-radius:14px;overflow:hidden;aspect-ratio:1;cursor:grab;touch-action:none;user-select:none;'+(ph.dragging?'opacity:.25;':'')}>
                        ${ph.imgEl}
                        ${ph.idx===0 && html`<span style="position:absolute;top:5px;left:5px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;font-weight:600;pointer-events:none">Vignette</span>`}
                        <button onPointerDown=${(e)=>e.stopPropagation()} onClick=${ph.remove} style="position:absolute;top:5px;right:5px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;cursor:pointer;font-size:12px">×</button>
                      </div>`)}
                    ${v.detail.photos.length===0 && html`<div class="text-muted" style="font-size:13px;grid-column:1/-1;padding:4px 2px">Aucune photo.</div>`}
                  </div>
                </div>

              </div>

              <!-- Barre d'action toujours visible -->
              <div class="detail-actions" style="position:sticky;bottom:0;z-index:20;margin-top:16px;padding:14px 0 4px;background:linear-gradient(to top,var(--color-bg) 72%,transparent);display:flex;gap:10px;flex-wrap:wrap">
                <button class="btn btn-primary" onClick=${v.saveProject} style="flex:1;min-width:140px">Enregistrer</button>
                ${v.detail.done && html`<button class="btn btn-secondary" onClick=${v.reopenProject} style="flex:1;min-width:140px">Rouvrir le projet</button>`}
                ${!v.detail.done && html`<button class="btn btn-secondary" onClick=${v.finishProject} style="flex:1;min-width:140px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg>J'ai fini le projet</button>`}
                <button class="btn btn-ghost" onClick=${v.deleteProject}>Supprimer</button>
              </div>
            </div>`}
        </section>

      </main>
    </div>

    ${v.patternDialog && html`
      <div class="dialog-backdrop" style="z-index:50">
        <div class="dialog" style="width:min(460px,100%)">
          <div class="dialog-title">${v.patternEdit?'Modifier le patron':'Ajouter un patron'}</div>
          <label style="display:block;cursor:pointer">
            <div class="washed" style=${'height:150px;border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;'+v.pdCover}>
              ${!v.pdHasFile && html`
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-700)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>
                <span style="font-size:12px;color:var(--color-accent-700)">Déposer un PDF ou une image</span>`}
              ${v.pdHasFile && html`<span style="font-size:13px;color:var(--color-accent-800);font-weight:600">${v.pdFileName}</span>`}
            </div>
            <input type="file" accept="image/*,application/pdf" onChange=${v.onPatternFile}/>
          </label>
          <div class="field"><label>Nom du patron</label><input class="input" value=${v.pd.name} onInput=${v.setPName} placeholder="Sweater No.9"/></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><label style="margin:0">Catégorie</label><button class="btn btn-icon btn-secondary" style="width:22px;height:22px" onClick=${v.openCatPrompt} title="Nouvelle catégorie"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>
              <select class="input" value=${v.pd.category} onChange=${v.setPCat}>
                <option value="">—</option>
                ${v.catOptions.map(c=>html`<option value=${c}>${c}</option>`)}
              </select>
            </div>
            <div class="field">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><label style="margin:0">Auteur / créateur</label><button class="btn btn-icon btn-secondary" style="width:22px;height:22px" onClick=${v.openAuthorPrompt} title="Nouvel auteur"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>
              <select class="input" value=${v.pd.author} onChange=${v.setPAuthor}>
                <option value="">—</option>
                ${v.authorOptions.map(a=>html`<option value=${a}>${a}</option>`)}
              </select>
            </div>
          </div>
          <div class="dialog-actions"><button class="btn btn-secondary" onClick=${v.closePattern}>Annuler</button><button class="btn btn-primary" onClick=${v.savePattern}>${v.patternEdit?'Enregistrer':'Ajouter'}</button></div>
        </div>
      </div>`}

    ${v.tagPrompt && this.renderModal({title:v.tagPrompt.kind==='category'?'Nouvelle catégorie':'Nouvel auteur',width:360,z:65,onBackdrop:v.closeTagPrompt,
      body:html`<div class="field" style="margin:0"><input class="input" value=${v.tagPrompt.value} onInput=${v.setTagPromptValue} placeholder=${v.tagPrompt.kind==='category'?'ex. Chaussettes':'ex. PetiteKnit'} onKeyDown=${(e)=>{if(e.key==='Enter'){e.preventDefault();v.confirmTagPrompt();}}}/></div>`,
      actions:html`<button class="btn btn-secondary" onClick=${v.closeTagPrompt}>Annuler</button><button class="btn btn-primary" onClick=${v.confirmTagPrompt}>Ajouter</button>`})}

    ${v.yarnDialog && this.renderModal({title:v.yarnEdit?'Modifier la laine':'Nouvelle laine',width:520,onBackdrop:v.closeYarnDialog,
      body:html`
        <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--color-accent);margin-bottom:10px">Type de laine</div>
        <div class="field"><label>Marque</label>
          <select class="input" value=${v.yd.brand} onChange=${v.setYBrand}>
            <option value="">—</option>
            ${v.brandOptions.map(b=>html`<option value=${b}>${b}</option>`)}
          </select>
          <div style="display:flex;gap:6px;margin-top:6px"><input class="input" value=${v.newBrand} onInput=${v.setNewBrand} placeholder="Nouvelle marque…" style="font-size:13px" onKeyDown=${(e)=>{if(e.key==='Enter'){e.preventDefault();v.addBrand();}}}/><button class="btn btn-icon btn-secondary" onClick=${v.addBrand} title="Ajouter la marque"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>
        </div>
        <div class="field"><label>Nom</label><input class="input" value=${v.yd.name} onInput=${v.setYName} placeholder="Ulysse"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field"><label>Mètres / pelote</label><input class="input" type="number" value=${v.yd.mps} onInput=${v.setYMps} placeholder="185"/></div>
          <div class="field"><label>Grammes / pelote</label><input class="input" type="number" value=${v.yd.gps} onInput=${v.setYGps} placeholder="50"/></div>
        </div>
        <div class="field"><label>Composition (blend)</label><input class="input" value=${v.yd.blend} onInput=${v.setYBlend} placeholder="100% Mérinos"/></div>
        ${!v.yarnEdit && html`
          <div style="border-top:1px solid var(--color-divider);margin:16px 0 14px;padding-top:14px">
            <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--color-accent);margin-bottom:10px">Pelote / coloris</div>
            <div style="display:flex;gap:12px;align-items:end;margin-bottom:12px">
              <div class="field" style="margin:0"><label>Couleur / photo</label>${this.cwColorPhoto(v.yd.hex,v.setYHex,v.yd.photo,v.yd.photo?v.signedUrls[v.yd.photo]:'',v.onCwPhotoYarn,v.removeCwPhotoYarn)}</div>
              <div class="field" style="margin:0;flex:1"><label>Coloris</label><input class="input" value=${v.yd.color} onInput=${v.setYColor} placeholder="Blé"/></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="field"><label>Dye lot</label><input class="input" value=${v.yd.dyeLot} onInput=${v.setYDye} placeholder="A231"/></div>
              <div class="field"><label>Grammes en stock</label><input class="input" type="number" value=${v.yd.grams} onInput=${v.setYGrams} placeholder="400"/></div>
            </div>
          </div>`}`,
      actions:html`<button class="btn btn-secondary" onClick=${v.closeYarnDialog}>Annuler</button><button class="btn btn-primary" onClick=${v.saveYarn}>${v.yarnEdit?'Enregistrer':'Ajouter au stash'}</button>`})}

    ${v.needleDialog && this.renderModal({title:v.needleEdit?"Modifier l'aiguille":'Nouvelle aiguille',width:440,onBackdrop:v.closeNeedleDialog,
      body:html`
        <div class="field"><label>Marque</label><input class="input" value=${v.nd.brand} onInput=${v.setNBrand} placeholder="ChiaoGoo"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field"><label>Taille (mm)</label>
            <select class="input" value=${v.nd.size} onChange=${v.setNSize}>
              <option value="">—</option>
              ${v.sizeOptions.map(s=>html`<option value=${s}>${s} mm</option>`)}
            </select>
          </div>
          <div class="field"><label>Longueur</label><input class="input" value=${v.nd.length} onInput=${v.setNLength} placeholder="ex. 80 cm"/></div>
        </div>
        <div class="field"><label>Type</label>${this.segToggle([{label:'Interchangeable',value:true},{label:'Fixe',value:false}],v.nd.interchangeable,v.setNInterVal,'100%')}</div>`,
      actions:html`<button class="btn btn-secondary" onClick=${v.closeNeedleDialog}>Annuler</button><button class="btn btn-primary" onClick=${v.saveNeedle}>${v.needleEdit?'Enregistrer':'Ajouter au stash'}</button>`})}

    ${v.pendingNav && this.renderModal({title:'Modifications non enregistrées',width:420,onBackdrop:v.cancelNav,
      body:html`<div class="dialog-body">Tu as des changements non enregistrés sur ce projet. Veux-tu les enregistrer avant de quitter ?</div>`,
      actions:html`
        <button class="btn btn-ghost" onClick=${v.cancelNav}>Annuler</button>
        <button class="btn btn-secondary" onClick=${v.confirmNavDiscard}>Ne pas enregistrer</button>
        <button class="btn btn-primary" onClick=${v.confirmNavSave}>Enregistrer</button>`})}

    ${v.confirm && this.renderModal({title:v.confirm.title||'Confirmer',width:420,z:70,onBackdrop:v.confirmNo,
      body:html`<div class="dialog-body">${v.confirm.message||''}</div>`,
      actions:html`
        <button class="btn btn-secondary" onClick=${v.confirmNo}>Annuler</button>
        <button class="btn btn-primary" style="background:var(--color-accent-700)" onClick=${v.confirmYes}>${v.confirm.confirmLabel||'Supprimer'}</button>`})}

    ${v.dragPhoto && v.dragPhoto.url && html`
      <div style=${`position:fixed;left:${v.dragPhoto.x-v.dragPhoto.grabX}px;top:${v.dragPhoto.y-v.dragPhoto.grabY}px;width:${v.dragPhoto.w}px;height:${v.dragPhoto.h}px;border-radius:14px;overflow:hidden;pointer-events:none;z-index:120;box-shadow:0 12px 30px rgba(0,0,0,.35);transform:scale(1.05);transition:transform .1s ease`}>
        <img src=${v.dragPhoto.url} draggable="false" style="width:100%;height:100%;object-fit:cover"/>
      </div>`}
    `;
  }
}

render(h(App), document.getElementById('app'));
