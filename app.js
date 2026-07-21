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
      stash:[], patterns:[], projects:[], signedUrls:{},
      // ---- UI ----
      zone:'home',
      expandedYarn:null, addYarnOpen:false,
      yarnDraft:this.blankYarn(),
      editingYarn:null, yarnEditDraft:null,
      cwDraft:{color:'',hex:'#c67139',dyeLot:'',grams:''}, cwFor:null,
      editingProject:null, projectDraft:null, projectDraftInitial:null,
      allocPick:{colorwayId:'',grams:''},
      patternDialog:false, patternDraft:this.blankPattern(), patternEditId:null,
      libFilter:'Tous', libAuthor:'Tous',
      // ---- taxonomies + profil (stockés dans user_metadata) ----
      categories:[], authors:[], displayName:'',
      manageTax:false, newCategory:'', newAuthor:'',
      editingName:false, nameDraft:'',
      // ---- garde-fou navigation ----
      pendingNav:null,
    };
    this._loadingData=false;
  }
  blankYarn(){ return {brand:'',name:'',mps:'',gps:'',blend:'',color:'',hex:'#c67139',dyeLot:'',grams:''}; }
  blankPattern(){ return {name:'',category:'Pull',author:'',path:'',fileName:'',kind:''}; }
  today(){ return new Date().toISOString().slice(0,10); }

  // ---- auth lifecycle ----
  componentDidMount(){
    supabase.auth.getSession().then(({data})=>{
      this.setState({session:data.session, sessionChecked:true});
      if(data.session) this.loadAll();
    }).catch(()=>{ this.setState({sessionChecked:true}); });
    supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){
        this.setState({session:null,sessionChecked:true,loaded:false,stash:[],patterns:[],projects:[],signedUrls:{},
          zone:'home',editingProject:null,projectDraft:null,expandedYarn:null,addYarnOpen:false,patternDialog:false});
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
    const [yq,pq,prq]=await Promise.all([
      supabase.from('yarns').select('*, colorways(*)').order('created_at',{ascending:false}),
      supabase.from('patterns').select('*').order('created_at',{ascending:false}),
      supabase.from('projects').select('*, project_allocations(*), project_photos(*)').order('created_at',{ascending:false}),
    ]);
    const stash=(yq.data||[]).map(y=>({id:y.id,brand:y.brand,name:y.name,mps:Number(y.meters_per_skein)||0,gps:Number(y.grams_per_skein)||0,blend:y.blend,
      colorways:(y.colorways||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
        .map(c=>({id:c.id,color:c.color,hex:c.hex,dyeLot:c.dye_lot,grams:Number(c.grams)||0}))}));
    const patterns=(pq.data||[]).map(p=>({id:p.id,name:p.name,category:p.category,author:p.author,path:p.file_path||'',fileName:p.file_name||'',kind:p.file_kind||''}));
    const projects=(prq.data||[]).map(pr=>({id:pr.id,name:pr.name,patternId:pr.pattern_id,size:pr.size,
      gauge:pr.gauge===null?'':String(pr.gauge), needle:pr.needle_size===null?'':String(pr.needle_size),
      startDate:pr.start_date,endDate:pr.end_date,notes:pr.notes,
      allocations:(pr.project_allocations||[]).map(a=>({rowId:a.id,colorwayId:a.colorway_id,grams:Number(a.grams)||0})),
      photos:(pr.project_photos||[]).map(ph=>({rowId:ph.id,path:ph.path,name:ph.name,type:ph.type}))}));
    this.setState({stash,patterns,projects,loaded:true, ...this.deriveMeta(patterns)});
    this._loadingData=false;
    this.refreshSignedUrls();
  }
  deriveMeta(patterns){
    const u=this.state.session&&this.state.session.user;
    const meta=(u&&u.user_metadata)||{};
    const usedCats=Array.from(new Set(patterns.map(p=>p.category).filter(Boolean)));
    const usedAuthors=Array.from(new Set(patterns.map(p=>p.author).filter(Boolean)));
    const defaults=['Pull','Gilet','Bonnet','Chaussettes','Écharpe','Châle','Accessoire','Autre'];
    const categories=Array.isArray(meta.categories)&&meta.categories.length?meta.categories.slice():Array.from(new Set([...defaults,...usedCats]));
    const authors=Array.isArray(meta.authors)?meta.authors.slice():usedAuthors;
    return {categories,authors,displayName:meta.display_name||''};
  }
  async saveMeta(patch){
    this.setState(patch);
    try{ await supabase.auth.updateUser({data:patch}); }catch(e){}
  }
  async refreshSignedUrls(){
    const patternPaths=[...new Set(this.state.patterns.filter(p=>p.kind==='img'&&p.path).map(p=>p.path))];
    const photoPaths=[...new Set([
      ...this.state.projects.flatMap(p=>p.photos.map(ph=>ph.path)),
      ...(this.state.projectDraft? this.state.projectDraft.photos.map(ph=>ph.path):[]),
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
  setYarnDraft=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({yarnDraft:{...s.yarnDraft,[f]:v}})); };
  addYarn=async()=>{
    const d=this.state.yarnDraft;
    if(!d.name.trim()||!d.brand.trim()) return;
    const uid=this.state.session.user.id;
    const {data:yarnRow}=await supabase.from('yarns').insert({user_id:uid,brand:d.brand.trim(),name:d.name.trim(),
      meters_per_skein:Number(d.mps)||0,grams_per_skein:Number(d.gps)||0,blend:d.blend.trim()}).select().single();
    if(!yarnRow) return;
    const {data:cwRow}=await supabase.from('colorways').insert({user_id:uid,yarn_id:yarnRow.id,
      color:d.color.trim()||'Coloris 1',hex:d.hex,dye_lot:d.dyeLot.trim(),grams:Number(d.grams)||0}).select().single();
    const yarn={id:yarnRow.id,brand:yarnRow.brand,name:yarnRow.name,mps:Number(yarnRow.meters_per_skein)||0,gps:Number(yarnRow.grams_per_skein)||0,blend:yarnRow.blend,
      colorways:cwRow?[{id:cwRow.id,color:cwRow.color,hex:cwRow.hex,dyeLot:cwRow.dye_lot,grams:Number(cwRow.grams)||0}]:[]};
    this.setState(s=>({stash:[yarn,...s.stash],yarnDraft:this.blankYarn(),addYarnOpen:false,expandedYarn:yarn.id}));
  };
  toggleAddYarn=()=>this.setState(s=>({addYarnOpen:!s.addYarnOpen}));
  toggleYarn=(id)=>()=>this.setState(s=>({expandedYarn:s.expandedYarn===id?null:id}));
  deleteYarn=(id)=>async(e)=>{ e.stopPropagation(); await supabase.from('yarns').delete().eq('id',id);
    this.setState(s=>({stash:s.stash.filter(y=>y.id!==id)})); };
  startEditYarn=(id)=>(e)=>{ e.stopPropagation(); const y=this.state.stash.find(x=>x.id===id);
    this.setState({editingYarn:id,yarnEditDraft:{brand:y.brand,name:y.name,mps:String(y.mps||''),gps:String(y.gps||''),blend:y.blend||''}}); };
  cancelEditYarn=()=>this.setState({editingYarn:null,yarnEditDraft:null});
  setYarnEditDraft=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({yarnEditDraft:{...s.yarnEditDraft,[f]:v}})); };
  saveEditYarn=(id)=>async()=>{ const d=this.state.yarnEditDraft; if(!d||!d.name.trim()||!d.brand.trim()) return;
    const cols={brand:d.brand.trim(),name:d.name.trim(),meters_per_skein:Number(d.mps)||0,grams_per_skein:Number(d.gps)||0,blend:d.blend.trim()};
    await supabase.from('yarns').update(cols).eq('id',id);
    this.setState(s=>({stash:s.stash.map(y=>y.id!==id?y:{...y,brand:cols.brand,name:cols.name,mps:cols.meters_per_skein,gps:cols.grams_per_skein,blend:cols.blend}),editingYarn:null,yarnEditDraft:null})); };
  setCwGrams=(yid,cid)=>async(e)=>{ const v=Number(e.target.value)||0; await supabase.from('colorways').update({grams:v}).eq('id',cid);
    this.setState(s=>({stash:s.stash.map(y=>y.id!==yid?y:{...y,colorways:y.colorways.map(c=>c.id!==cid?c:{...c,grams:v})})})); };
  startCw=(yid)=>()=>this.setState({cwFor:yid,cwDraft:{color:'',hex:'#c67139',dyeLot:'',grams:''}});
  setCwDraft=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({cwDraft:{...s.cwDraft,[f]:v}})); };
  addCw=(yid)=>async()=>{ const d=this.state.cwDraft; if(!d.color.trim()) return;
    const uid=this.state.session.user.id;
    const {data:cwRow}=await supabase.from('colorways').insert({user_id:uid,yarn_id:yid,color:d.color.trim(),hex:d.hex,dye_lot:d.dyeLot.trim(),grams:Number(d.grams)||0}).select().single();
    if(!cwRow) return;
    const cw={id:cwRow.id,color:cwRow.color,hex:cwRow.hex,dyeLot:cwRow.dye_lot,grams:Number(cwRow.grams)||0};
    this.setState(s=>({stash:s.stash.map(y=>y.id!==yid?y:{...y,colorways:[...y.colorways,cw]}),cwFor:null})); };
  deleteCw=(yid,cid)=>async(e)=>{ e.stopPropagation(); await supabase.from('colorways').delete().eq('id',cid);
    this.setState(s=>({stash:s.stash.map(y=>y.id!==yid?y:{...y,colorways:y.colorways.filter(c=>c.id!==cid)})})); };

  // ---- patterns ----
  openPattern=()=>this.setState({patternDialog:true,patternDraft:this.blankPattern(),patternEditId:null,patternOrigPath:''});
  startEditPattern=(id)=>(e)=>{ e.stopPropagation(); const p=this.state.patterns.find(x=>x.id===id);
    this.setState({patternDialog:true,patternEditId:id,patternOrigPath:p.path||'',
      patternDraft:{name:p.name,category:p.category,author:p.author||'',path:p.path||'',fileName:p.fileName||'',kind:p.kind||''}}); };
  closePattern=()=>{ const d=this.state.patternDraft;
    if(d.path && d.path!==this.state.patternOrigPath) supabase.storage.from('patterns').remove([d.path]);
    this.setState({patternDialog:false,patternEditId:null,patternOrigPath:''}); };
  setPatternDraft=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({patternDraft:{...s.patternDraft,[f]:v}})); };
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
  deletePattern=(id)=>async(e)=>{ e.stopPropagation(); const p=this.state.patterns.find(x=>x.id===id);
    if(p&&p.path) await supabase.storage.from('patterns').remove([p.path]);
    await supabase.from('patterns').delete().eq('id',id);
    this.setState(s=>({patterns:s.patterns.filter(x=>x.id!==id)})); };
  setLibFilter=(c)=>()=>this.setState({libFilter:c});
  setLibAuthor=(a)=>()=>this.setState({libAuthor:a});

  // ---- taxonomies (catégories & auteurs, stockées dans user_metadata) ----
  toggleManageTax=()=>this.setState(s=>({manageTax:!s.manageTax}));
  setNewCategory=(e)=>this.setState({newCategory:e.target.value});
  setNewAuthor=(e)=>this.setState({newAuthor:e.target.value});
  addCategory=async()=>{ const c=this.state.newCategory.trim(); if(!c||this.state.categories.includes(c)){ this.setState({newCategory:''}); return; }
    this.setState({newCategory:''}); await this.saveMeta({categories:[...this.state.categories,c]}); };
  deleteCategory=(c)=>async()=>{ await this.saveMeta({categories:this.state.categories.filter(x=>x!==c)});
    this.setState(s=>({libFilter:s.libFilter===c?'Tous':s.libFilter})); };
  addAuthor=async()=>{ const a=this.state.newAuthor.trim(); if(!a||this.state.authors.includes(a)){ this.setState({newAuthor:''}); return; }
    this.setState({newAuthor:''}); await this.saveMeta({authors:[...this.state.authors,a]}); };
  deleteAuthor=(a)=>async()=>{ await this.saveMeta({authors:this.state.authors.filter(x=>x!==a)});
    this.setState(s=>({libAuthor:s.libAuthor===a?'Tous':s.libAuthor})); };

  // ---- profil : nom personnalisé ----
  startEditName=()=>this.setState(s=>({editingName:true,nameDraft:s.displayName||''}));
  cancelEditName=()=>this.setState({editingName:false});
  setNameDraft=(e)=>this.setState({nameDraft:e.target.value});
  saveName=async()=>{ const n=this.state.nameDraft.trim(); await this.saveMeta({display_name:n}); this.setState({editingName:false}); };

  // ---- projects ----
  newProject=()=>{ const draft={id:null,name:'',patternId:'',size:'',gauge:'',needle:'',startDate:this.today(),endDate:null,notes:'',allocations:[],photos:[]};
    this.setState({zone:'projects',editingProject:'new',projectDraft:draft,projectDraftInitial:JSON.stringify(draft),allocPick:{colorwayId:'',grams:''}}); };
  editProject=(id)=>()=>{ const p=this.state.projects.find(x=>x.id===id); const draft=this.dedupeAllocs(JSON.parse(JSON.stringify(p)));
    this.setState({zone:'projects',editingProject:id,projectDraft:draft,projectDraftInitial:JSON.stringify(draft),allocPick:{colorwayId:'',grams:''}});
    this.ensurePatternUrl(draft.patternId); };
  cancelEdit=()=>{ const d=this.state.projectDraft;
    if(d && !d.id && d.photos.length) d.photos.forEach(ph=>supabase.storage.from('photos').remove([ph.path]));
    this.setState({editingProject:null,projectDraft:null,projectDraftInitial:null}); };
  ensurePatternUrl=async(patternId)=>{ if(!patternId) return; const p=this.state.patterns.find(x=>x.id===patternId);
    if(!p||!p.path||this.state.signedUrls[p.path]) return;
    const url=await this.getSignedUrl('patterns',p.path);
    if(url) this.setState(s=>({signedUrls:{...s.signedUrls,[p.path]:url}})); };
  setPD=(f)=>(e)=>{ const v=e.target.value; this.setState(s=>({projectDraft:{...s.projectDraft,[f]:v}})); };
  saveProject=async()=>{ const d=this.state.projectDraft; if(!d.name.trim()) return;
    const uid=this.state.session.user.id;
    const cols={user_id:uid,name:d.name.trim(),pattern_id:d.patternId||null,size:d.size,
      gauge:d.gauge===''?null:Number(d.gauge),needle_size:d.needle===''?null:Number(d.needle),
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
          .insert(d.photos.map(ph=>({user_id:uid,project_id:row.id,path:ph.path,name:ph.name,type:ph.type}))).select();
        if(photoRows) photos=photoRows.map(ph=>({rowId:ph.id,path:ph.path,name:ph.name,type:ph.type}));
      }
      const project={...d,id:row.id,allocations,photos};
      this.setState(s=>({projects:[project,...s.projects],editingProject:null,projectDraft:null}));
    }
  };
  finishProject=()=>this.setState(s=>({projectDraft:{...s.projectDraft,endDate:this.today()}}));
  reopenProject=()=>this.setState(s=>({projectDraft:{...s.projectDraft,endDate:null}}));
  deleteProject=async()=>{ const id=this.state.projectDraft.id;
    if(id){
      const proj=this.state.projects.find(p=>p.id===id) || this.state.projectDraft;
      const paths=(proj.photos||[]).map(ph=>ph.path).filter(Boolean);
      if(paths.length) await supabase.storage.from('photos').remove(paths);
      await supabase.from('projects').delete().eq('id',id);
    }
    this.setState(s=>({projects:s.projects.filter(p=>p.id!==id),editingProject:null,projectDraft:null})); };
  setProjectPattern=(e)=>{ const v=e.target.value; this.setState(s=>({projectDraft:{...s.projectDraft,patternId:v}})); this.ensurePatternUrl(v); };
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
    const d=this.state.projectDraft; let rowId=null;
    if(d.id){ const uid=this.state.session.user.id;
      const {data}=await supabase.from('project_photos').insert({user_id:uid,project_id:d.id,path,name:file.name,type:file.type}).select().single();
      rowId=data?data.id:null;
    }
    this.setState(s=>({projectDraft:{...s.projectDraft,photos:[...s.projectDraft.photos,{rowId,path,name:file.name,type:file.type}]},signedUrls:{...s.signedUrls,[path]:url}})); };
  removePhoto=(i)=>async()=>{ const d=this.state.projectDraft; const ph=d.photos[i];
    await supabase.storage.from('photos').remove([ph.path]);
    if(ph.rowId) await supabase.from('project_photos').delete().eq('id',ph.rowId);
    this.setState(s=>({projectDraft:{...s.projectDraft,photos:s.projectDraft.photos.filter((x,idx)=>idx!==i)}})); };

  closeModals=()=>this.setState({patternDialog:false,patternEditId:null,patternOrigPath:''});

  thumb(hex){ return `height:120px;background:linear-gradient(135deg,${hex} 0%,color-mix(in srgb,${hex} 60%,#000) 130%)`; }

  renderVals(){
    const st=this.state, map=this.cwMap();
    const patName=(id)=>{ const p=st.patterns.find(x=>x.id===id); return p?p.name:'Sans patron'; };
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

    const activeProjects=active.map(p=>({id:p.id,name:p.name,patternName:patName(p.patternId),thumbStyle:this.thumb(this.projHex(p,map)),yarnLine:yarnLine(p),yarnDot:yarnDot(p),since:since(p),open:this.editProject(p.id)}));

    const stashRows=st.stash.map(y=>{
      const colorways=y.colorways.map(cw=>{ const alloc=this.allocatedTo(cw.id); const avail=cw.grams-alloc;
        return {id:cw.id,color:cw.color,hex:cw.hex,dyeLot:cw.dyeLot,grams:cw.grams,alloc,avail,
          skeins:y.gps?(avail/y.gps).toFixed(1):'0',allocLabel:alloc>0?`${alloc} g réservés`:'',
          swatch:`width:26px;height:26px;border-radius:50%;flex:none;background:${cw.hex};box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.12)`,
          setGrams:this.setCwGrams(y.id,cw.id),del:this.deleteCw(y.id,cw.id)}; });
      const totalAvail=colorways.reduce((s,c)=>s+c.avail,0);
      const totalSkeins=y.gps?(colorways.reduce((s,c)=>s+c.avail,0)/y.gps).toFixed(1):'0';
      return {id:y.id,brand:y.brand,name:y.name,blend:y.blend,mps:y.mps,gps:y.gps,colorways,
        totalAvail,totalSkeins,cwCount:y.colorways.length,
        expanded:st.expandedYarn===y.id,toggle:this.toggleYarn(y.id),del:this.deleteYarn(y.id),
        editing:st.editingYarn===y.id,startEdit:this.startEditYarn(y.id),saveEdit:this.saveEditYarn(y.id),
        addCwOpen:st.cwFor===y.id,startCw:this.startCw(y.id),addCw:this.addCw(y.id),
        caret:`transition:transform .2s;transform:rotate(${st.expandedYarn===y.id?90:0}deg)`};
    });

    const usedCats=st.patterns.map(p=>p.category).filter(Boolean);
    const allCats=Array.from(new Set([...st.categories,...usedCats]));
    const chipStyle=(active)=>`cursor:pointer;padding:7px 15px;border-radius:999px;font-size:13px;border:1px solid ${active?'var(--color-accent)':'var(--color-divider)'};background:${active?'var(--color-accent)':'transparent'};color:${active?'var(--color-bg)':'var(--color-text)'}`;
    const catChips=['Tous',...allCats].map(c=>({label:c,active:st.libFilter===c,pick:this.setLibFilter(c),style:chipStyle(st.libFilter===c)}));
    const usedAuthors=st.patterns.map(p=>p.author).filter(Boolean);
    const allAuthors=Array.from(new Set([...st.authors,...usedAuthors]));
    const authorChips=['Tous',...allAuthors].map(a=>({label:a,active:st.libAuthor===a,pick:this.setLibAuthor(a),
      style:`cursor:pointer;padding:7px 15px;border-radius:999px;font-size:13px;border:1px solid ${st.libAuthor===a?'var(--color-accent-2)':'var(--color-divider)'};background:${st.libAuthor===a?'var(--color-accent-2)':'transparent'};color:${st.libAuthor===a?'var(--color-bg)':'var(--color-text)'}`}));
    const hasAuthorChips=allAuthors.length>0;
    // Panneau « gérer les catégories / auteurs »
    const manageCats=allCats.map(c=>({label:c,del:this.deleteCategory(c)}));
    const manageAuthors=allAuthors.map(a=>({label:a,del:this.deleteAuthor(a)}));
    const usedIn=(id)=>st.projects.filter(p=>p.patternId===id).length;
    const patterns=st.patterns.filter(p=>(st.libFilter==='Tous'||p.category===st.libFilter)&&(st.libAuthor==='Tous'||p.author===st.libAuthor)).map(p=>{
      const url=p.kind==='img'&&p.path? st.signedUrls[p.path]:'';
      return {id:p.id,name:p.name,category:p.category,author:p.author||'Sans auteur',isPdf:p.kind==='pdf',
        coverStyle:`height:150px;display:flex;align-items:center;justify-content:center;${url?`background-image:url(${url});background-size:cover;background-position:center`:`background:linear-gradient(135deg,var(--color-accent-200),var(--color-accent-2-200))`}`,
        usedLabel:usedIn(p.id)>0?`${usedIn(p.id)} projet(s)`:'Non utilisé',del:this.deletePattern(p.id),edit:this.startEditPattern(p.id)};
    });

    let detail=null;
    if(st.projectDraft){ const d=st.projectDraft;
      const allocRows=d.allocations.map((a,i)=>{ const e=map[a.colorwayId];
        return {label:e?`${e.yarn.name} · ${e.cw.color}`:'Laine supprimée',dot:e?`width:14px;height:14px;border-radius:50%;flex:none;background:${e.cw.hex}`:'',
          grams:a.grams,dyeLot:e?e.cw.dyeLot:'',avail:e?e.cw.grams-this.allocatedTo(a.colorwayId):0,
          setGrams:this.setAllocGrams(i),remove:this.removeAlloc(i)}; });
      const options=[]; st.stash.forEach(y=>y.colorways.forEach(cw=>{ const avail=cw.grams-this.allocatedTo(cw.id); options.push({id:cw.id,label:`${y.name} · ${cw.color} — ${avail} g dispo`}); }));
      const photos=d.photos.map((ph,i)=>{ const url=st.signedUrls[ph.path]||'';
        return {remove:this.removePhoto(i), imgEl: url? h('img',{src:url,style:{width:'100%',height:'100%',objectFit:'cover'}}) : h('div',{style:{width:'100%',height:'100%',background:'var(--color-neutral-200)'}})}; });
      const selP=st.patterns.find(x=>x.id===d.patternId);
      const patUrl=selP&&selP.path?(st.signedUrls[selP.path]||''):'';
      const patIsImg=!!(selP&&selP.kind==='img');
      const patIsPdf=!!(selP&&selP.kind==='pdf');
      const patImgEl=(patIsImg&&patUrl)?h('img',{src:patUrl,style:{width:'100%',display:'block',borderRadius:'14px'}}):null;
      detail={id:d.id,isNew:!d.id,name:d.name,patternId:d.patternId,size:d.size,gauge:d.gauge,needle:d.needle,
        startDate:d.startDate,endDate:d.endDate,done:!!d.endDate,notes:d.notes,photos,
        allocRows,options,pickId:st.allocPick.colorwayId,pickGrams:st.allocPick.grams,
        patternOptions:st.patterns,hasPattern:!!selP,patternName:selP?selP.name:'',patternMeta:this.patMeta(d.patternId),
        patIsImg,patIsPdf,patUrl,patImgEl,
        totalGrams:projGrams(d)};
    }

    const projectCards=st.projects.map(p=>({id:p.id,name:p.name,patternName:patName(p.patternId),done:!!p.endDate,
      statusLabel:p.endDate?'Terminé':'En cours',statusClass:p.endDate?'tag tag-neutral':'tag tag-accent-2',
      thumbStyle:this.thumb(this.projHex(p,map)),yarnLine:yarnLine(p),yarnDot:yarnDot(p),
      dateLabel:p.endDate?('Fini le '+new Date(p.endDate).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})):since(p),
      open:this.editProject(p.id)}));

    const email=(st.session&&st.session.user&&st.session.user.email)||'';
    const localPart=email.split('@')[0]||'Toi';
    const userName=(st.displayName&&st.displayName.trim())||(localPart.charAt(0).toUpperCase()+localPart.slice(1));
    const createdAt=st.session&&st.session.user&&st.session.user.created_at;
    const memberSince=createdAt? ('Membre depuis '+new Date(createdAt).toLocaleDateString('fr-FR',{month:'long',year:'numeric'})):'';

    return {
      goHome:this.go('home'),goLibrary:this.go('library'),goStash:this.go('stash'),goProjects:this.go('projects'),goProfil:this.go('profil'),
      navHome:this.navStyle('home'),navLibrary:this.navStyle('library'),navStash:this.navStyle('stash'),navProjects:this.navStyle('projects'),navProfil:this.navStyle('profil'),
      homeShow:st.zone==='home'?'':'display:none', libraryShow:st.zone==='library'?'':'display:none',
      stashShow:st.zone==='stash'?'':'display:none', profilShow:st.zone==='profil'?'':'display:none',
      projectsShow:(st.zone==='projects'&&!st.projectDraft)?'':'display:none', detailShow:(st.zone==='projects'&&st.projectDraft)?'':'display:none',
      todayStr:new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}),
      statCompleted:completed,statSkeins:gS.toFixed(1),statGrams:this.fmt(gG),statMeters:this.fmt(gM),
      statGramsShort:this.fmt(st.stash.reduce((s,y)=>s+y.colorways.reduce((t,c)=>t+c.grams,0),0))+' g',
      activeCount:active.length,activeProjects,noActive:active.length===0,newProject:this.newProject,
      stashRows,addYarnOpen:st.addYarnOpen,toggleAddYarn:this.toggleAddYarn,addYarn:this.addYarn,yd:st.yarnDraft,
      setYBrand:this.setYarnDraft('brand'),setYName:this.setYarnDraft('name'),setYMps:this.setYarnDraft('mps'),setYGps:this.setYarnDraft('gps'),
      setYBlend:this.setYarnDraft('blend'),setYColor:this.setYarnDraft('color'),setYHex:this.setYarnDraft('hex'),setYDye:this.setYarnDraft('dyeLot'),setYGrams:this.setYarnDraft('grams'),
      cwDraft:st.cwDraft,setCwColor:this.setCwDraft('color'),setCwHex:this.setCwDraft('hex'),setCwDye:this.setCwDraft('dyeLot'),setCwGramsD:this.setCwDraft('grams'),
      stashEmpty:st.stash.length===0,
      yed:st.yarnEditDraft,cancelEditYarn:this.cancelEditYarn,
      setYEBrand:this.setYarnEditDraft('brand'),setYEName:this.setYarnEditDraft('name'),setYEMps:this.setYarnEditDraft('mps'),setYEGps:this.setYarnEditDraft('gps'),setYEBlend:this.setYarnEditDraft('blend'),
      catChips,authorChips,hasAuthorChips,patterns,openPattern:this.openPattern,patternsEmpty:patterns.length===0,
      manageTax:st.manageTax,toggleManageTax:this.toggleManageTax,manageCats,manageAuthors,
      newCategory:st.newCategory,setNewCategory:this.setNewCategory,addCategory:this.addCategory,
      newAuthor:st.newAuthor,setNewAuthor:this.setNewAuthor,addAuthor:this.addAuthor,
      patternDialog:st.patternDialog,patternEdit:!!st.patternEditId,pd:st.patternDraft,closePattern:this.closePattern,savePattern:this.savePattern,onPatternFile:this.onPatternFile,
      catOptions:allCats,authorOptions:allAuthors,
      setPName:this.setPatternDraft('name'),setPCat:this.setPatternDraft('category'),setPAuthor:this.setPatternDraft('author'),
      pdHasFile:!!(st.patternDraft.fileName),pdFileName:st.patternDraft.fileName||'',
      pdCover:(st.patternDraft.kind==='img'&&st.patternDraft.path&&st.signedUrls[st.patternDraft.path])?`background-image:url(${st.signedUrls[st.patternDraft.path]});background-size:cover;background-position:center`:'background:linear-gradient(135deg,var(--color-accent-200),var(--color-accent-2-200))',
      projectCards,projectsEmpty:st.projects.length===0,detail,
      setName:this.setPD('name'),setPattern:this.setProjectPattern,setSize:this.setPD('size'),setGauge:this.setPD('gauge'),setNeedle:this.setPD('needle'),
      setStart:this.setPD('startDate'),setNotes:this.setPD('notes'),
      cancelEdit:this.cancelEdit,saveProject:this.saveProject,finishProject:this.finishProject,reopenProject:this.reopenProject,deleteProject:this.deleteProject,
      setPickId:this.setAllocPick('colorwayId'),setPickGrams:this.setAllocPick('grams'),addAlloc:this.addAlloc,
      onProjectPhoto:this.onProjectPhoto,
      pendingNav:st.pendingNav,confirmNavSave:this.confirmNavSave,confirmNavDiscard:this.confirmNavDiscard,cancelNav:this.cancelNav,
      profPatterns:st.patterns.length,profYarns:st.stash.length,
      profColorways:st.stash.reduce((s,y)=>s+y.colorways.length,0),
      profOwned:this.fmt(st.stash.reduce((s,y)=>s+y.colorways.reduce((t,c)=>t+c.grams,0),0)),
      profActive:active.length+' en cours',profDone:completed+' terminés',
      profFibers:this.fiberBreakdown(),
      modalOpen:st.patternDialog,closeModals:this.closeModals,
      editingName:st.editingName,nameDraft:st.nameDraft,startEditName:this.startEditName,cancelEditName:this.cancelEditName,setNameDraft:this.setNameDraft,saveName:this.saveName,
      userName,userEmail:email,avatarLetter:userName.charAt(0).toUpperCase()||'?',memberSince,signOut:this.signOut,
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
        <button class="nav-btn" aria-label="Bibliothèque" title="Bibliothèque" onClick=${v.goLibrary} style=${v.navLibrary}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M8 4v16"/></svg><span class="nav-label">Bibliothèque</span></button>
        <button class="nav-btn" aria-label="Yarn Stash" title="Yarn Stash" onClick=${v.goStash} style=${v.navStash}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M6 8c4 3 8 5 11 3M5 14c5 2 9 1 13-4M9 20c1-6 3-10 7-13"/></svg><span class="nav-label">Yarn Stash</span></button>
        <button class="nav-btn" aria-label="Projets" title="Projets" onClick=${v.goProjects} style=${v.navProjects}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg><span class="nav-label">Projets</span></button>
        <button class="nav-btn" aria-label="Profil" title="Profil" onClick=${v.goProfil} style=${v.navProfil}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg><span class="nav-label">Profil</span></button>
        <div class="side-summary" style="margin-top:auto;padding:14px 12px;border-radius:20px;background:var(--color-accent-2-100)">
          <div style="font-size:11px;color:var(--color-accent-2-700);line-height:1.4">${v.activeCount} projet(s) en cours · ${v.statGramsShort} de laine en réserve</div>
        </div>
      </aside>

      <main class="main" style="flex:1;min-width:0;padding:34px 40px 60px;max-width:1120px">

        <section style=${v.homeShow}>
          <div class="zone-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:26px">
            <div>
              <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--color-accent);margin-bottom:6px">${v.todayStr}</div>
              <h1 style="margin:0;font-size:40px">Bonjour, ${v.userName}</h1>
              <p style="margin:6px 0 0;font-size:15px" class="text-muted">Voici où en est ton tricot aujourd'hui.</p>
            </div>
            <button class="btn btn-primary" onClick=${v.newProject}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nouveau projet</button>
          </div>

          <div class="stat-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:34px">
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:38px;line-height:1;color:var(--color-accent)">${v.statCompleted}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Projets terminés</div>
            </div>
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:38px;line-height:1">${v.statSkeins}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Pelotes utilisées</div>
            </div>
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:38px;line-height:1">${v.statGrams}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Grammes utilisés</div>
            </div>
            <div style="padding:22px;border-radius:24px;background:var(--color-surface)">
              <div style="font-family:var(--font-heading);font-size:38px;line-height:1">${v.statMeters}</div>
              <div style="font-size:13px;margin-top:8px" class="text-muted">Mètres tricotés</div>
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
            <button class="btn btn-primary" onClick=${v.toggleAddYarn}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Ajouter une laine</button>
          </div>

          <div class="stash-head" style="display:grid;grid-template-columns:44px 1.6fr 1fr .8fr .7fr 60px;gap:12px;padding:10px 18px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:color-mix(in srgb,var(--color-text) 55%,transparent)">
            <div></div><div>Laine</div><div>Composition</div><div>Coloris</div><div>Disponible</div><div></div>
          </div>

          ${v.addYarnOpen && html`
            <div style="border-radius:22px;background:var(--color-accent-2-100);padding:18px 20px;margin-bottom:14px;animation:pop .2s ease both">
              <div style="font-family:var(--font-heading);font-size:17px;margin-bottom:14px">Nouvelle laine</div>
              <div class="form-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
                <div class="field"><label>Marque</label><input class="input" value=${v.yd.brand} onInput=${v.setYBrand} placeholder="De Rerum Natura"/></div>
                <div class="field"><label>Nom</label><input class="input" value=${v.yd.name} onInput=${v.setYName} placeholder="Ulysse"/></div>
                <div class="field"><label>Mètres / pelote</label><input class="input" type="number" value=${v.yd.mps} onInput=${v.setYMps} placeholder="185"/></div>
                <div class="field"><label>Grammes / pelote</label><input class="input" type="number" value=${v.yd.gps} onInput=${v.setYGps} placeholder="50"/></div>
                <div class="field" style="grid-column:1/3"><label>Composition (blend)</label><input class="input" value=${v.yd.blend} onInput=${v.setYBlend} placeholder="100% Mérinos"/></div>
                <div class="field"><label>Coloris</label><input class="input" value=${v.yd.color} onInput=${v.setYColor} placeholder="Blé"/></div>
                <div class="field"><label>Dye lot</label><input class="input" value=${v.yd.dyeLot} onInput=${v.setYDye} placeholder="A231"/></div>
                <div class="field"><label>Couleur</label><input type="color" value=${v.yd.hex} onInput=${v.setYHex} style="width:100%;height:36px;border:1px solid var(--color-divider);border-radius:999px;background:var(--color-surface);cursor:pointer;display:block"/></div>
                <div class="field"><label>Grammes en stock</label><input class="input" type="number" value=${v.yd.grams} onInput=${v.setYGrams} placeholder="400"/></div>
                <div style="display:flex;align-items:flex-end;gap:8px;grid-column:3/5;justify-content:flex-end"><button class="btn btn-secondary" onClick=${v.toggleAddYarn}>Annuler</button><button class="btn btn-primary" onClick=${v.addYarn}>Ajouter au stash</button></div>
              </div>
            </div>`}

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
                ${y.editing && html`
                  <div style="padding:4px 18px 18px;animation:pop .2s ease both">
                    <div style="border-top:1px solid var(--color-divider);padding-top:14px">
                      <div style="font-family:var(--font-heading);font-size:15px;margin-bottom:12px">Modifier la laine</div>
                      <div class="form-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
                        <div class="field"><label>Marque</label><input class="input" value=${v.yed.brand} onInput=${v.setYEBrand}/></div>
                        <div class="field"><label>Nom</label><input class="input" value=${v.yed.name} onInput=${v.setYEName}/></div>
                        <div class="field"><label>Mètres / pelote</label><input class="input" type="number" value=${v.yed.mps} onInput=${v.setYEMps}/></div>
                        <div class="field"><label>Grammes / pelote</label><input class="input" type="number" value=${v.yed.gps} onInput=${v.setYEGps}/></div>
                        <div class="field" style="grid-column:1/3"><label>Composition (blend)</label><input class="input" value=${v.yed.blend} onInput=${v.setYEBlend}/></div>
                        <div style="display:flex;align-items:flex-end;gap:8px;grid-column:3/5;justify-content:flex-end"><button class="btn btn-secondary" onClick=${v.cancelEditYarn}>Annuler</button><button class="btn btn-primary" onClick=${y.saveEdit}>Enregistrer</button></div>
                      </div>
                    </div>
                  </div>`}
                ${y.expanded && html`
                  <div style="padding:4px 18px 18px;animation:pop .2s ease both">
                    <div style="border-top:1px solid var(--color-divider);padding-top:14px;display:flex;flex-direction:column;gap:10px">
                      ${y.colorways.map(cw=>html`
                        <div class="cw-row" style="display:grid;grid-template-columns:34px 1fr auto auto auto 40px;gap:14px;align-items:center;padding:8px 12px;border-radius:16px;background:var(--color-bg)">
                          <div style=${cw.swatch}></div>
                          <div><div style="font-weight:600;font-size:14px">${cw.color}</div><div style="font-size:11px" class="text-muted">Dye lot ${cw.dyeLot} · ${cw.allocLabel}</div></div>
                          <div class="text-muted mob-hide" style="font-size:12px">${cw.skeins} pelotes</div>
                          <div style="display:flex;align-items:center;gap:6px"><input class="input" type="number" value=${cw.grams} onInput=${cw.setGrams} style="width:86px;text-align:right"/><span style="font-size:12px" class="text-muted">g total</span></div>
                          <div style="text-align:right"><span style="font-family:var(--font-heading);font-size:16px">${cw.avail}</span><span style="font-size:11px" class="text-muted"> g dispo</span></div>
                          <button class="btn btn-icon btn-ghost" onClick=${cw.del}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
                        </div>`)}
                      ${y.addCwOpen && html`
                        <div class="cw-form" style="display:grid;grid-template-columns:auto 1fr 1fr 1fr auto;gap:10px;align-items:end;padding:10px 12px;border-radius:16px;border:1px dashed var(--color-accent)">
                          <div class="field" style="margin:0"><label>Couleur</label><input type="color" value=${v.cwDraft.hex} onInput=${v.setCwHex} style="width:44px;height:36px;border:1px solid var(--color-divider);border-radius:999px;cursor:pointer;display:block"/></div>
                          <div class="field" style="margin:0"><label>Coloris</label><input class="input" value=${v.cwDraft.color} onInput=${v.setCwColor} placeholder="Sauge"/></div>
                          <div class="field" style="margin:0"><label>Dye lot</label><input class="input" value=${v.cwDraft.dyeLot} onInput=${v.setCwDye} placeholder="8533"/></div>
                          <div class="field" style="margin:0"><label>Grammes</label><input class="input" type="number" value=${v.cwDraft.grams} onInput=${v.setCwGramsD} placeholder="100"/></div>
                          <button class="btn btn-primary" onClick=${y.addCw}>Ajouter</button>
                        </div>`}
                      <button class="btn btn-ghost" onClick=${y.startCw} style="align-self:flex-start"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Ajouter un coloris / dye lot</button>
                    </div>
                  </div>`}
              </div>`)}
            ${v.stashEmpty && html`<div style="padding:40px;text-align:center;border:2px dashed var(--color-divider);border-radius:22px" class="text-muted">Ton stash est vide. Ajoute ta première laine.</div>`}
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
              <button class="btn btn-primary" onClick=${v.openPattern}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Ajouter un patron</button>
            </div>
          </div>

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

          <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--color-accent);margin-bottom:8px">Catégorie</div>
          <div style="display:flex;flex-wrap:wrap;gap:9px;margin-bottom:16px">
            ${v.catChips.map(c=>html`<button onClick=${c.pick} style=${c.style}>${c.label}</button>`)}
          </div>
          ${v.hasAuthorChips && html`
            <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--color-accent-2-700);margin-bottom:8px">Auteur</div>
            <div style="display:flex;flex-wrap:wrap;gap:9px;margin-bottom:22px">
              ${v.authorChips.map(a=>html`<button onClick=${a.pick} style=${a.style}>${a.label}</button>`)}
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

                <!-- Section 1 · Infos -->
                <div style="border-radius:22px;background:var(--color-surface);padding:20px">
                  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-accent);margin-bottom:14px">Informations</div>
                  <div class="grid-3" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
                    <div class="field"><label>Taille</label><input class="input" value=${v.detail.size} onInput=${v.setSize} placeholder="M"/></div>
                    <div class="field"><label>Gauge (m. / 10 cm)</label><input class="input" type="number" value=${v.detail.gauge} onInput=${v.setGauge} placeholder="22"/></div>
                    <div class="field"><label>Aiguilles (mm)</label><input class="input" type="number" step="0.5" value=${v.detail.needle} onInput=${v.setNeedle} placeholder="4"/></div>
                    <div class="field"><label>Date de début</label><input class="input" type="date" value=${v.detail.startDate} onInput=${v.setStart}/></div>
                    <div class="field" style="grid-column:span 2"><label>Statut</label><input class="input" value=${v.detail.done?'Terminé':'En cours'} disabled style="opacity:.7"/></div>
                  </div>
                  <div class="field" style="margin-top:14px"><label>Notes</label><textarea class="input" value=${v.detail.notes} onInput=${v.setNotes} placeholder="Modifications, rangs, remarques…" style="min-height:100px"></textarea></div>
                </div>

                <!-- Section 2 · Patron -->
                <div style="border-radius:22px;background:var(--color-surface);padding:20px">
                  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-accent);margin-bottom:14px">Patron</div>
                  <div class="pattern-sec" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
                    <div>
                      <div class="field"><label>Choix du patron</label>
                        <select class="input" value=${v.detail.patternId} onChange=${v.setPattern}>
                          <option value="">Aucun patron</option>
                          ${v.detail.patternOptions.map(po=>html`<option value=${po.id}>${po.name}</option>`)}
                        </select>
                      </div>
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
                    <button class="btn btn-secondary" onClick=${v.addAlloc}>Associer</button>
                  </div>
                  <p style="font-size:11.5px;margin:8px 2px 0" class="text-muted">Une même laine associée deux fois est fusionnée. Les grammes utilisés sont déduits du stash.</p>
                </div>

                <!-- Section 4 · Photos -->
                <div style="border-radius:22px;background:var(--color-surface);padding:20px">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-accent)">Photos</div><label class="btn btn-ghost" style="cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Ajouter<input type="file" accept="image/*" onChange=${v.onProjectPhoto}/></label></div>
                  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
                    ${v.detail.photos.map(ph=>html`
                      <div style="position:relative;border-radius:14px;overflow:hidden;aspect-ratio:1">${ph.imgEl}<button onClick=${ph.remove} style="position:absolute;top:5px;right:5px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;cursor:pointer;font-size:12px">×</button></div>`)}
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

        <section style=${v.profilShow}>
          <h1 style="margin:0 0 22px;font-size:36px">Profil</h1>
          <div class="profil-grid" style="display:grid;grid-template-columns:300px 1fr;gap:28px;align-items:start">
            <div style="border-radius:26px;background:var(--color-surface);padding:26px;text-align:center;box-shadow:var(--shadow-sm)">
              <div style="width:96px;height:96px;border-radius:50%;margin:0 auto 16px;background:radial-gradient(circle at 35% 30%,var(--color-accent-300),var(--color-accent-600));display:flex;align-items:center;justify-content:center;font-family:var(--font-heading);font-size:38px;color:var(--color-bg)">${v.avatarLetter}</div>
              ${!v.editingName && html`
                <div style="display:flex;align-items:center;justify-content:center;gap:6px">
                  <div style="font-family:var(--font-heading);font-size:24px">${v.userName}</div>
                  <button class="btn btn-icon btn-ghost" style="width:26px;height:26px" onClick=${v.startEditName} title="Modifier le nom"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                </div>`}
              ${v.editingName && html`
                <div style="display:flex;flex-direction:column;gap:8px;margin:0 auto;max-width:220px">
                  <input class="input" value=${v.nameDraft} onInput=${v.setNameDraft} placeholder="Ton prénom" style="text-align:center" onKeyDown=${(e)=>{if(e.key==='Enter')v.saveName();}}/>
                  <div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-secondary" onClick=${v.cancelEditName}>Annuler</button><button class="btn btn-primary" onClick=${v.saveName}>Enregistrer</button></div>
                </div>`}
              <div style="font-size:12px;margin-top:2px" class="text-muted">${v.userEmail}</div>
              <div style="font-size:13px;margin-top:6px" class="text-muted">${v.memberSince}</div>
              <div style="display:flex;justify-content:center;gap:8px;margin-top:16px"><span class="tag tag-accent">${v.profActive}</span><span class="tag tag-accent-2">${v.profDone}</span></div>
              <button class="btn btn-ghost" style="margin-top:18px;justify-content:center;width:100%" onClick=${v.signOut}>Se déconnecter</button>
            </div>

            <div style="display:flex;flex-direction:column;gap:22px">
              <div class="profil-stats" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
                <div style="padding:20px;border-radius:22px;background:var(--color-surface)"><div style="font-family:var(--font-heading);font-size:32px;color:var(--color-accent)">${v.profOwned}</div><div style="font-size:12.5px;margin-top:6px" class="text-muted">Grammes en réserve</div></div>
                <div style="padding:20px;border-radius:22px;background:var(--color-surface)"><div style="font-family:var(--font-heading);font-size:32px">${v.profYarns}</div><div style="font-size:12.5px;margin-top:6px" class="text-muted">Laines · ${v.profColorways} coloris</div></div>
                <div style="padding:20px;border-radius:22px;background:var(--color-surface)"><div style="font-family:var(--font-heading);font-size:32px">${v.profPatterns}</div><div style="font-size:12.5px;margin-top:6px" class="text-muted">Patrons en bibliothèque</div></div>
                <div style="padding:20px;border-radius:22px;background:var(--color-surface)"><div style="font-family:var(--font-heading);font-size:32px">${v.statMeters}</div><div style="font-size:12.5px;margin-top:6px" class="text-muted">Mètres tricotés</div></div>
                <div style="padding:20px;border-radius:22px;background:var(--color-surface)"><div style="font-family:var(--font-heading);font-size:32px">${v.statGrams}</div><div style="font-size:12.5px;margin-top:6px" class="text-muted">Grammes utilisés</div></div>
                <div style="padding:20px;border-radius:22px;background:var(--color-surface)"><div style="font-family:var(--font-heading);font-size:32px">${v.statSkeins}</div><div style="font-size:12.5px;margin-top:6px" class="text-muted">Pelotes utilisées</div></div>
              </div>
              <div style="border-radius:22px;background:var(--color-surface);padding:22px">
                <h4 style="margin:0 0 16px;font-size:18px">Ta réserve par fibre</h4>
                <div style="display:flex;flex-direction:column;gap:14px">
                  ${v.profFibers.map(f=>html`
                    <div>
                      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="font-weight:600">${f.label}</span><span class="text-muted">${f.grams} g · ${f.pct}%</span></div>
                      <div style="background:var(--color-bg);border-radius:999px"><div style=${f.bar}></div></div>
                    </div>`)}
                </div>
              </div>
            </div>
          </div>
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
            <div class="field"><label>Catégorie</label>
              <select class="input" value=${v.pd.category} onChange=${v.setPCat}>
                <option value="">—</option>
                ${v.catOptions.map(c=>html`<option value=${c}>${c}</option>`)}
              </select>
              <div style="display:flex;gap:6px;margin-top:6px"><input class="input" value=${v.newCategory} onInput=${v.setNewCategory} placeholder="Nouvelle…" style="font-size:13px" onKeyDown=${(e)=>{if(e.key==='Enter'){e.preventDefault();v.addCategory();}}}/><button class="btn btn-icon btn-secondary" onClick=${v.addCategory} title="Ajouter la catégorie"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>
            </div>
            <div class="field"><label>Auteur / créateur</label>
              <select class="input" value=${v.pd.author} onChange=${v.setPAuthor}>
                <option value="">—</option>
                ${v.authorOptions.map(a=>html`<option value=${a}>${a}</option>`)}
              </select>
              <div style="display:flex;gap:6px;margin-top:6px"><input class="input" value=${v.newAuthor} onInput=${v.setNewAuthor} placeholder="Nouvel auteur…" style="font-size:13px" onKeyDown=${(e)=>{if(e.key==='Enter'){e.preventDefault();v.addAuthor();}}}/><button class="btn btn-icon btn-secondary" onClick=${v.addAuthor} title="Ajouter l'auteur"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>
            </div>
          </div>
          <div class="dialog-actions"><button class="btn btn-secondary" onClick=${v.closePattern}>Annuler</button><button class="btn btn-primary" onClick=${v.savePattern}>${v.patternEdit?'Enregistrer':'Ajouter'}</button></div>
        </div>
      </div>`}

    ${v.pendingNav && html`
      <div class="dialog-backdrop" style="z-index:60">
        <div class="dialog" style="width:min(420px,100%)">
          <div class="dialog-title">Modifications non enregistrées</div>
          <div class="dialog-body">Tu as des changements non enregistrés sur ce projet. Veux-tu les enregistrer avant de quitter ?</div>
          <div class="dialog-actions" style="flex-wrap:wrap">
            <button class="btn btn-ghost" onClick=${v.cancelNav}>Annuler</button>
            <button class="btn btn-secondary" onClick=${v.confirmNavDiscard}>Ne pas enregistrer</button>
            <button class="btn btn-primary" onClick=${v.confirmNavSave}>Enregistrer</button>
          </div>
        </div>
      </div>`}
    `;
  }
}

render(h(App), document.getElementById('app'));
