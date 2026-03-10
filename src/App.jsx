import { useState, useEffect, useCallback, useRef } from "react";

// ── CONFIG — fill these in after setup ─────────────────────────────────────
const CONFIG = {
  emailjs: {
    serviceId:  "YOUR_EMAILJS_SERVICE_ID",
    templateId: "YOUR_EMAILJS_TEMPLATE_ID",
    publicKey:  "YOUR_EMAILJS_PUBLIC_KEY",
  },
  googleSheets: {
    scriptUrl: "YOUR_GOOGLE_APPS_SCRIPT_URL",
  },
  emails: {
    owner: "vince@vppropertypros.com",
    va:    "gary@vppropertypros.com",
  },
};

// ── USERS ──────────────────────────────────────────────────────────────────
const USERS = {
  admin: { password: "VPllcoolio1+dealflowcrm", role: "admin", name: "Owner", email: "vince@vppropertypros.com" },
  va:    { password: "va123",                   role: "va",    name: "Gary",  email: "gary@vppropertypros.com"  },
};

const STAGES = [
  { id: "contacted",      label: "Contacted",        color: "#4A90D9" },
  { id: "voicemail",      label: "Voicemail / Text", color: "#9B59B6" },
  { id: "offer_made",     label: "Offer Made",       color: "#F39C12" },
  { id: "offer_accepted", label: "Offer Accepted",   color: "#27AE60" },
  { id: "taken_off",      label: "Taken Off Market", color: "#95A5A6" },
  { id: "offer_rejected", label: "Offer Rejected",   color: "#E74C3C" },
];

const OFFER_TYPES = ["Sub-To", "Seller Finance", "Hybrid", "Cash", "Other"];

const EMPTY_PROPERTY = {
  id: null, address: "", link: "", realtorName: "", realtorPhone: "",
  realtorEmail: "", askingPrice: "", loanAmount: "", mortgagePayment: "",
  loanBalance: "", interestRate: "", rentRoll: "", cashFlow: "",
  monthlyInsurance: "", monthlyTaxes: "", offerType: "", offerToSeller: "",
  stage: "contacted", notes: "", followUps: [], addedBy: "", addedDate: "",
  loi: false, contractSent: false,
};

const EMPTY_KPI = {
  date: "", newReachOuts: 0, newConversations: 0, followUps: 0,
  loisSent: 0, contractsSent: 0, offersAccepted: 0,
};

// ── STORAGE ────────────────────────────────────────────────────────────────
const LS_KEY = "dealflow_crm_v2";
const loadData = () => {
  try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r); } catch {}
  return { properties: [], kpis: [] };
};
const saveData = (d) => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} };

// ── HELPERS ────────────────────────────────────────────────────────────────
const fmt = (val, prefix = "$") => {
  if (!val && val !== 0) return "—";
  const n = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(n)) return val;
  return prefix + n.toLocaleString("en-US", { minimumFractionDigits: 0 });
};
const today   = () => new Date().toISOString().split("T")[0];
const uid     = () => Math.random().toString(36).slice(2, 10);
const isToday = (d) => d === today();
const isPast  = (d) => d && d < today();
const isFuture= (d) => d && d > today();

// ── EMAIL ──────────────────────────────────────────────────────────────────
const sendReminderEmail = async (to, toName, property, followUpNote, dueDate) => {
  const { serviceId, templateId, publicKey } = CONFIG.emailjs;
  if (!serviceId || serviceId === "YOUR_EMAILJS_SERVICE_ID") return;
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId, template_id: templateId, user_id: publicKey,
        template_params: {
          to_email: to, to_name: toName,
          property_address: property.address, realtor_name: property.realtorName,
          follow_up_note: followUpNote, due_date: dueDate,
          stage: STAGES.find(s => s.id === property.stage)?.label || property.stage,
          crm_link: window.location.href,
        },
      }),
    });
  } catch (e) { console.warn("EmailJS:", e); }
};

// ── SHEETS SYNC ────────────────────────────────────────────────────────────
const syncToSheets = async (data) => {
  const url = CONFIG.googleSheets.scriptUrl;
  if (!url || url === "YOUR_GOOGLE_APPS_SCRIPT_URL") return { ok: false, reason: "not_configured" };
  try {
    const res  = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ properties: data.properties, kpis: data.kpis }) });
    const text = await res.text();
    return { ok: text.includes("OK"), reason: text };
  } catch (e) { return { ok: false, reason: e.message }; }
};

// ── APP ────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,        setUser]        = useState(null);
  const [data,        setData]        = useState(loadData);
  const [tab,         setTab]         = useState("pipeline");
  const [modal,       setModal]       = useState(null);
  const [filterStage, setFilterStage] = useState("all");
  const [search,      setSearch]      = useState("");
  const [loginForm,   setLoginForm]   = useState({ username: "", password: "", error: "" });
  const [syncStatus,  setSyncStatus]  = useState("idle");
  const [toasts,      setToasts]      = useState([]);
  const syncTimer = useRef(null);

  const toast = useCallback((msg, type = "info") => {
    const id = uid();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const persist = useCallback((next) => {
    saveData(next); setData(next);
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncStatus("syncing");
      const res = await syncToSheets(next);
      setSyncStatus(res.ok ? "ok" : (res.reason === "not_configured" ? "idle" : "error"));
      if (res.ok) setTimeout(() => setSyncStatus("idle"), 3000);
    }, 1500);
  }, []);

  useEffect(() => {
    if (!user) return;
    const due = data.properties.flatMap(p =>
      (p.followUps || []).filter(fu => fu.dueDate && (isToday(fu.dueDate) || isPast(fu.dueDate)) && !fu.dismissed)
    );
    if (due.length > 0) toast(`📅 ${due.length} follow-up${due.length > 1 ? "s" : ""} due today!`, "warning");
  }, [user]);

  const handleLogin = () => {
    const u = USERS[loginForm.username.toLowerCase()];
    if (!u || u.password !== loginForm.password) { setLoginForm(f => ({ ...f, error: "Invalid username or password." })); return; }
    setUser({ username: loginForm.username.toLowerCase(), ...u });
    setLoginForm({ username: "", password: "", error: "" });
  };

  const saveProperty = useCallback((prop) => {
    const isNew = !prop.id;
    const item  = isNew ? { ...prop, id: uid(), addedBy: user.name, addedDate: today() } : { ...prop };
    const properties = isNew ? [...data.properties, item] : data.properties.map(p => p.id === item.id ? item : p);
    persist({ ...data, properties });
    setModal(null);
    toast(isNew ? "Property added ✓" : "Property saved ✓", "success");
  }, [data, user, persist, toast]);

  const deleteProperty = useCallback((id) => {
    if (!confirm("Delete this property?")) return;
    persist({ ...data, properties: data.properties.filter(p => p.id !== id) });
    setModal(null); toast("Property deleted", "info");
  }, [data, persist, toast]);

  const updateStage = useCallback((id, stage) => {
    persist({ ...data, properties: data.properties.map(p => p.id === id ? { ...p, stage } : p) });
  }, [data, persist]);

  const dismissFollowUp = useCallback((propId, fuIndex) => {
    const properties = data.properties.map(p => {
      if (p.id !== propId) return p;
      const followUps = p.followUps.map((fu, i) => i === fuIndex ? { ...fu, dismissed: true } : fu);
      return { ...p, followUps };
    });
    persist({ ...data, properties });
  }, [data, persist]);

  const saveKpi = useCallback((kpi) => {
    const isNew = !kpi.id;
    const item  = isNew ? { ...kpi, id: uid() } : { ...kpi };
    const kpis  = isNew ? [...data.kpis, item] : data.kpis.map(k => k.id === item.id ? item : k);
    persist({ ...data, kpis }); setModal(null); toast("KPIs saved ✓", "success");
  }, [data, persist, toast]);

  const filtered = data.properties.filter(p => {
    const matchStage  = filterStage === "all" || p.stage === filterStage;
    const q           = search.toLowerCase();
    const matchSearch = !q || [p.address, p.realtorName, p.realtorEmail, p.offerType].some(v => v?.toLowerCase().includes(q));
    return matchStage && matchSearch;
  });

  const stageCounts = STAGES.reduce((acc, s) => { acc[s.id] = data.properties.filter(p => p.stage === s.id).length; return acc; }, {});
  const totalKpis   = data.kpis.reduce((acc, k) => {
    ["newReachOuts","newConversations","followUps","loisSent","contractsSent","offersAccepted"].forEach(key => { acc[key] = (acc[key] || 0) + Number(k[key] || 0); });
    return acc;
  }, {});

  const dueFollowUps = data.properties.flatMap(p =>
    (p.followUps || []).map((fu, i) => ({ property: p, followUp: fu, index: i }))
      .filter(({ followUp: fu }) => fu.dueDate && (isToday(fu.dueDate) || isPast(fu.dueDate)) && !fu.dismissed)
  );

  const upcomingFollowUps = data.properties.flatMap(p =>
    (p.followUps || []).map((fu, i) => ({ property: p, followUp: fu, index: i }))
      .filter(({ followUp: fu }) => fu.dueDate && !fu.dismissed && isFuture(fu.dueDate))
  );

  const exportCSV = () => {
    const headers = ["Address","Stage","Realtor","Phone","Email","Asking Price","Offer Type","Offer","LOI","Contract","Added By","Date"];
    const rows    = data.properties.map(p => [p.address,p.stage,p.realtorName,p.realtorPhone,p.realtorEmail,p.askingPrice,p.offerType,p.offerToSeller,p.loi?"Yes":"No",p.contractSent?"Yes":"No",p.addedBy,p.addedDate]);
    const csv     = [headers,...rows].map(r => r.map(v => `"${v||""}"`).join(",")).join("\n");
    const a       = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv); a.download="crm_export.csv"; a.click();
  };

  if (!user) return <LoginScreen form={loginForm} setForm={setLoginForm} onLogin={handleLogin} />;

  return (
    <div style={S.shell}>
      <div style={S.toastStack}>
        {toasts.map(t => <div key={t.id} style={{...S.toast,...(t.type==="success"?S.toastSuccess:t.type==="warning"?S.toastWarning:t.type==="error"?S.toastError:{})}}>{t.msg}</div>)}
      </div>
      <Sidebar tab={tab} setTab={setTab} user={user} onLogout={()=>setUser(null)} counts={stageCounts} dueCount={dueFollowUps.length} syncStatus={syncStatus} />
      <main style={S.main}>
        {tab==="pipeline"   && <PipelineView properties={filtered} stages={STAGES} stageCounts={stageCounts} filterStage={filterStage} setFilterStage={setFilterStage} search={search} setSearch={setSearch} onAdd={()=>setModal({type:"property",item:{...EMPTY_PROPERTY}})} onEdit={item=>setModal({type:"property",item})} onStageChange={updateStage} onExport={exportCSV} dueFollowUps={dueFollowUps} />}
        {tab==="properties" && <PropertiesTable properties={filtered} stages={STAGES} search={search} setSearch={setSearch} filterStage={filterStage} setFilterStage={setFilterStage} onAdd={()=>setModal({type:"property",item:{...EMPTY_PROPERTY}})} onEdit={item=>setModal({type:"property",item})} onExport={exportCSV} />}
        {tab==="reminders"  && <RemindersView dueFollowUps={dueFollowUps} upcomingFollowUps={upcomingFollowUps} onDismiss={dismissFollowUp} onEdit={item=>setModal({type:"property",item})} />}
        {tab==="kpis"       && <KpiView kpis={data.kpis} totals={totalKpis} onAdd={()=>setModal({type:"kpi",item:{...EMPTY_KPI,id:null,date:today()}})} onEdit={item=>setModal({type:"kpi",item})} />}
        {tab==="setup" && user.role==="admin" && <SetupView syncStatus={syncStatus} onManualSync={()=>{ setSyncStatus("syncing"); syncToSheets(data).then(res=>{ setSyncStatus(res.ok?"ok":"error"); toast(res.ok?"Synced to Google Sheets ✓":"Sync failed — check setup",res.ok?"success":"error"); if(res.ok) setTimeout(()=>setSyncStatus("idle"),3000); }); }} />}
      </main>
      {modal?.type==="property" && <PropertyModal item={modal.item} user={user} onSave={saveProperty} onDelete={user.role==="admin"?deleteProperty:null} onClose={()=>setModal(null)} onSendReminder={sendReminderEmail} />}
      {modal?.type==="kpi"      && <KpiModal item={modal.item} onSave={saveKpi} onClose={()=>setModal(null)} />}
    </div>
  );
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function LoginScreen({ form, setForm, onLogin }) {
  return (
    <div style={S.loginShell}>
      <div style={S.loginCard}>
        <div style={S.loginLogo}>⬡</div>
        <h1 style={S.loginTitle}>DealFlow CRM</h1>
        <p style={S.loginSub}>Wholesaling · Creative Finance</p>
        <div style={S.loginFields}>
          <input style={S.loginInput} placeholder="Username" value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value,error:""}))} onKeyDown={e=>e.key==="Enter"&&onLogin()} />
          <input style={S.loginInput} type="password" placeholder="Password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value,error:""}))} onKeyDown={e=>e.key==="Enter"&&onLogin()} />
          {form.error && <p style={S.loginError}>{form.error}</p>}
          <button style={S.loginBtn} onClick={onLogin}>Sign In</button>
        </div>
      </div>
    </div>
  );
}

// ── SIDEBAR ────────────────────────────────────────────────────────────────
function Sidebar({ tab, setTab, user, onLogout, counts, dueCount, syncStatus }) {
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  const navItems = [
    { id:"pipeline",   icon:"◈", label:"Pipeline"   },
    { id:"properties", icon:"⊞", label:"Properties" },
    { id:"reminders",  icon:"📅", label:"Reminders", badge: dueCount },
    { id:"kpis",       icon:"◎", label:"VA KPIs"    },
    ...(user.role==="admin"?[{id:"setup",icon:"⚙",label:"Setup"}]:[]),
  ];
  const syncLabel = {idle:"",syncing:"Syncing…",ok:"Synced ✓",error:"Sync error"}[syncStatus];
  const syncColor = {idle:C.muted,syncing:C.accent,ok:"#27AE60",error:"#E74C3C"}[syncStatus];
  return (
    <aside style={S.sidebar}>
      <div>
        <div style={S.sidebarLogo}><span style={S.sidebarLogoIcon}>⬡</span><span style={S.sidebarLogoText}>DealFlow</span></div>
        <div style={S.sidebarBadge}>{total} properties</div>
        {syncLabel && <div style={{...S.sidebarBadge,color:syncColor,borderColor:syncColor+"44",marginTop:6}}>{syncLabel}</div>}
        <nav style={{marginTop:24}}>
          {navItems.map(n=>(
            <button key={n.id} style={{...S.navBtn,...(tab===n.id?S.navBtnActive:{})}} onClick={()=>setTab(n.id)}>
              <span style={S.navIcon}>{n.icon}</span>{n.label}
              {n.badge>0 && <span style={S.navBadge}>{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div style={{marginTop:32}}>
          <p style={S.sidebarSectionLabel}>PIPELINE</p>
          {STAGES.map(s=>(
            <div key={s.id} style={S.sidebarStageRow}>
              <span style={{...S.sidebarDot,background:s.color}} />
              <span style={S.sidebarStageLabel}>{s.label}</span>
              <span style={S.sidebarStageCount}>{counts[s.id]||0}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={S.sidebarFooter}>
        <div style={S.sidebarUser}>
          <div style={S.sidebarAvatar}>{user.name[0]}</div>
          <div><div style={S.sidebarUserName}>{user.name}</div><div style={S.sidebarUserRole}>{user.role==="admin"?"Owner":"VA"}</div></div>
        </div>
        <button style={S.logoutBtn} onClick={onLogout}>↩</button>
      </div>
    </aside>
  );
}

// ── PIPELINE ───────────────────────────────────────────────────────────────
function PipelineView({ properties, stages, stageCounts, filterStage, setFilterStage, search, setSearch, onAdd, onEdit, onStageChange, onExport, dueFollowUps }) {
  return (
    <div style={S.viewWrap}>
      <div style={S.viewHeader}>
        <div><h2 style={S.viewTitle}>Pipeline</h2><p style={S.viewSub}>{properties.length} properties shown</p></div>
        <div style={S.headerActions}>
          <input style={S.searchInput} placeholder="Search address, realtor…" value={search} onChange={e=>setSearch(e.target.value)} />
          <button style={S.exportBtn} onClick={onExport}>↓ CSV</button>
          <button style={S.addBtn} onClick={onAdd}>+ Add Property</button>
        </div>
      </div>
      {dueFollowUps.length>0 && (
        <div style={S.dueBanner}>📅 <strong>{dueFollowUps.length} follow-up{dueFollowUps.length>1?"s":""} due today</strong> — {dueFollowUps.slice(0,2).map(d=>d.property.address||"Unnamed").join(", ")}{dueFollowUps.length>2?` + ${dueFollowUps.length-2} more`:""}</div>
      )}
      <div style={S.stagePills}>
        <button style={{...S.pill,...(filterStage==="all"?S.pillActive:{})}} onClick={()=>setFilterStage("all")}>All ({properties.length})</button>
        {stages.map(s=>(
          <button key={s.id} style={{...S.pill,...(filterStage===s.id?{...S.pillActive,borderColor:s.color,color:s.color}:{})}} onClick={()=>setFilterStage(s.id)}>
            <span style={{...S.dot,background:s.color}}/>{s.label} ({stageCounts[s.id]||0})
          </button>
        ))}
      </div>
      <div style={S.kanban}>
        {stages.map(s=>{
          const cols=properties.filter(p=>p.stage===s.id);
          return (
            <div key={s.id} style={S.kanbanCol}>
              <div style={{...S.kanbanHeader,borderTop:`3px solid ${s.color}`}}>
                <span style={S.kanbanTitle}>{s.label}</span>
                <span style={{...S.kanbanCount,background:s.color}}>{cols.length}</span>
              </div>
              <div style={S.kanbanCards}>
                {cols.map(p=><PropertyCard key={p.id} property={p} stages={stages} onEdit={onEdit} onStageChange={onStageChange}/>)}
                {cols.length===0 && <div style={S.emptyCol}>No deals here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PropertyCard({ property: p, stages, onEdit, onStageChange }) {
  const hasDue=(p.followUps||[]).some(fu=>fu.dueDate&&(isToday(fu.dueDate)||isPast(fu.dueDate))&&!fu.dismissed);
  return (
    <div style={{...S.card,...(hasDue?S.cardDue:{})}} onClick={()=>onEdit(p)}>
      <div style={S.cardTop}><span style={S.cardAddr}>{p.address||"No address"}</span>{p.offerType&&<span style={S.cardTag}>{p.offerType}</span>}</div>
      {p.realtorName&&<div style={S.cardRealtor}>👤 {p.realtorName}</div>}
      <div style={S.cardMeta}>
        {p.askingPrice&&<span>{fmt(p.askingPrice)}</span>}
        {hasDue&&<span style={{...S.badge,background:"#F39C1222",color:"#F39C12",border:"1px solid #F39C1244"}}>📅 Due</span>}
        {p.loi&&<span style={S.badge}>LOI</span>}
        {p.contractSent&&<span style={{...S.badge,background:"#27AE6022",color:"#27AE60",border:"1px solid #27AE6044"}}>Contract</span>}
      </div>
      <select style={S.stageSelect} value={p.stage} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();onStageChange(p.id,e.target.value);}}>
        {stages.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </div>
  );
}

// ── PROPERTIES TABLE ───────────────────────────────────────────────────────
function PropertiesTable({ properties, stages, search, setSearch, filterStage, setFilterStage, onAdd, onEdit, onExport }) {
  return (
    <div style={S.viewWrap}>
      <div style={S.viewHeader}>
        <div><h2 style={S.viewTitle}>All Properties</h2><p style={S.viewSub}>{properties.length} records</p></div>
        <div style={S.headerActions}>
          <input style={S.searchInput} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <select style={S.filterSelect} value={filterStage} onChange={e=>setFilterStage(e.target.value)}>
            <option value="all">All Stages</option>
            {stages.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button style={S.exportBtn} onClick={onExport}>↓ CSV</button>
          <button style={S.addBtn} onClick={onAdd}>+ Add</button>
        </div>
      </div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>{["Address","Stage","Realtor","Asking Price","Offer Type","Offer","LOI","Contract","Next Follow-Up","Added By"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {properties.map(p=>{
              const stage=stages.find(s=>s.id===p.stage);
              const nextFu=(p.followUps||[]).filter(fu=>fu.dueDate&&!fu.dismissed).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
              const fuDue=nextFu&&(isToday(nextFu.dueDate)||isPast(nextFu.dueDate));
              return (
                <tr key={p.id} style={{...S.tr,...(fuDue?{background:"#F39C1208"}:{})}} onClick={()=>onEdit(p)}>
                  <td style={S.td}><span style={S.tdAddr}>{p.address||"—"}</span></td>
                  <td style={S.td}><span style={{...S.stageChip,background:stage?.color+"22",color:stage?.color,border:`1px solid ${stage?.color}44`}}>{stage?.label}</span></td>
                  <td style={S.td}>{p.realtorName||"—"}</td>
                  <td style={S.td}>{fmt(p.askingPrice)}</td>
                  <td style={S.td}>{p.offerType||"—"}</td>
                  <td style={S.td}>{fmt(p.offerToSeller)}</td>
                  <td style={S.td}>{p.loi?"✓":""}</td>
                  <td style={S.td}>{p.contractSent?"✓":""}</td>
                  <td style={S.td}>{nextFu?<span style={{color:fuDue?"#F39C12":C.muted,fontSize:12}}>{fuDue?"⚠ ":""}{nextFu.dueDate}</span>:"—"}</td>
                  <td style={S.td}>{p.addedBy||"—"}</td>
                </tr>
              );
            })}
            {properties.length===0&&<tr><td colSpan={10} style={{...S.td,textAlign:"center",color:C.muted,padding:40}}>No properties yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── REMINDERS VIEW ─────────────────────────────────────────────────────────
function RemindersView({ dueFollowUps, upcomingFollowUps, onDismiss, onEdit }) {
  return (
    <div style={S.viewWrap}>
      <div style={S.viewHeader}>
        <div><h2 style={S.viewTitle}>Follow-Up Reminders</h2><p style={S.viewSub}>{dueFollowUps.length} due today · {upcomingFollowUps.length} upcoming</p></div>
      </div>
      {dueFollowUps.length>0&&(
        <>
          <h3 style={S.reminderSectionTitle}>⚠ Due Today / Overdue</h3>
          <div style={S.reminderList}>
            {dueFollowUps.map(({property:p,followUp:fu,index:i})=>(
              <div key={`${p.id}-${i}`} style={{...S.reminderCard,borderLeft:"3px solid #F39C12"}}>
                <div style={S.reminderTop}>
                  <div>
                    <div style={S.reminderAddr}>{p.address||"No address"}</div>
                    <div style={S.reminderRealtor}>👤 {p.realtorName||"—"} · {STAGES.find(s=>s.id===p.stage)?.label}</div>
                    <div style={S.reminderNote}>"{fu.text}"</div>
                  </div>
                  <div style={S.reminderRight}>
                    <div style={S.reminderDate}>Due: {fu.dueDate}</div>
                    <div style={S.reminderBy}>by {fu.by}</div>
                  </div>
                </div>
                <div style={S.reminderActions}>
                  <button style={S.addBtn} onClick={()=>onEdit(p)}>Open Deal</button>
                  <button style={S.exportBtn} onClick={()=>onDismiss(p.id,i)}>Mark Done</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {upcomingFollowUps.length>0&&(
        <>
          <h3 style={{...S.reminderSectionTitle,marginTop:32}}>📅 Upcoming</h3>
          <div style={S.reminderList}>
            {[...upcomingFollowUps].sort((a,b)=>a.followUp.dueDate.localeCompare(b.followUp.dueDate)).map(({property:p,followUp:fu,index:i})=>(
              <div key={`${p.id}-${i}`} style={{...S.reminderCard,borderLeft:`3px solid ${C.accent}`}}>
                <div style={S.reminderTop}>
                  <div>
                    <div style={S.reminderAddr}>{p.address||"No address"}</div>
                    <div style={S.reminderRealtor}>👤 {p.realtorName||"—"} · {STAGES.find(s=>s.id===p.stage)?.label}</div>
                    <div style={S.reminderNote}>"{fu.text}"</div>
                  </div>
                  <div style={S.reminderRight}>
                    <div style={{...S.reminderDate,color:C.accent}}>Due: {fu.dueDate}</div>
                    <div style={S.reminderBy}>by {fu.by}</div>
                  </div>
                </div>
                <button style={S.addBtn} onClick={()=>onEdit(p)}>Open Deal</button>
              </div>
            ))}
          </div>
        </>
      )}
      {dueFollowUps.length===0&&upcomingFollowUps.length===0&&(
        <div style={S.emptyState}>
          <div style={S.emptyIcon}>✓</div>
          <div style={S.emptyText}>All caught up!</div>
          <div style={S.emptySub}>No follow-ups scheduled. Add a due date when logging a follow-up to see it here.</div>
        </div>
      )}
    </div>
  );
}

// ── KPI VIEW ───────────────────────────────────────────────────────────────
function KpiView({ kpis, totals, onAdd, onEdit }) {
  const KPI_KEYS=[
    {key:"newReachOuts",label:"New Reach Outs",icon:"📞"},
    {key:"newConversations",label:"New Conversations",icon:"💬"},
    {key:"followUps",label:"Follow Ups",icon:"🔁"},
    {key:"loisSent",label:"LOIs Sent",icon:"📄"},
    {key:"contractsSent",label:"Contracts Sent",icon:"📝"},
    {key:"offersAccepted",label:"Offers Accepted",icon:"🤝"},
  ];
  const sorted=[...kpis].sort((a,b)=>b.date.localeCompare(a.date));
  return (
    <div style={S.viewWrap}>
      <div style={S.viewHeader}>
        <div><h2 style={S.viewTitle}>VA KPI Tracker</h2><p style={S.viewSub}>All-time performance</p></div>
        <button style={S.addBtn} onClick={onAdd}>+ Log Day</button>
      </div>
      <div style={S.kpiGrid}>
        {KPI_KEYS.map(k=>(
          <div key={k.key} style={S.kpiCard}>
            <div style={S.kpiIcon}>{k.icon}</div>
            <div style={S.kpiValue}>{totals[k.key]||0}</div>
            <div style={S.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr><th style={S.th}>Date</th>{KPI_KEYS.map(k=><th key={k.key} style={S.th}>{k.icon} {k.label}</th>)}</tr></thead>
          <tbody>
            {sorted.map(k=>(
              <tr key={k.id} style={S.tr} onClick={()=>onEdit(k)}>
                <td style={S.td}>{k.date}</td>
                {KPI_KEYS.map(kk=><td key={kk.key} style={{...S.td,textAlign:"center"}}>{k[kk.key]||0}</td>)}
              </tr>
            ))}
            {sorted.length===0&&<tr><td colSpan={7} style={{...S.td,textAlign:"center",color:C.muted,padding:40}}>No KPI logs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── SETUP VIEW ─────────────────────────────────────────────────────────────
function SetupView({ syncStatus, onManualSync }) {
  const APPS_SCRIPT = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var ps = ss.getSheetByName("Properties") || ss.insertSheet("Properties");
    ps.clearContents();
    ps.appendRow(["Address","Stage","Realtor","Phone","Email","Asking Price",
      "Loan Amount","Mortgage Pmt","Balance","Rate","Rent Roll","Cash Flow",
      "Insurance","Taxes","Offer Type","Offer","LOI","Contract","Added By","Date","Notes"]);
    (data.properties || []).forEach(function(p) {
      ps.appendRow([p.address,p.stage,p.realtorName,p.realtorPhone,p.realtorEmail,
        p.askingPrice,p.loanAmount,p.mortgagePayment,p.loanBalance,p.interestRate,
        p.rentRoll,p.cashFlow,p.monthlyInsurance,p.monthlyTaxes,p.offerType,
        p.offerToSeller,p.loi?"Yes":"No",p.contractSent?"Yes":"No",
        p.addedBy,p.addedDate,p.notes]);
    });

    var ks = ss.getSheetByName("KPIs") || ss.insertSheet("KPIs");
    ks.clearContents();
    ks.appendRow(["Date","Reach Outs","Conversations","Follow Ups","LOIs","Contracts","Accepted"]);
    (data.kpis || []).forEach(function(k) {
      ks.appendRow([k.date,k.newReachOuts,k.newConversations,
        k.followUps,k.loisSent,k.contractsSent,k.offersAccepted]);
    });

    return ContentService.createTextOutput("OK")
      .setMimeType(ContentService.MimeType.TEXT);
  } catch(err) {
    return ContentService.createTextOutput("ERROR: " + err)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}`;

  const EMAIL_TEMPLATE = `Subject: Follow-Up Due — {{property_address}}

Hi {{to_name}},

You have a follow-up due today:

Property:  {{property_address}}
Realtor:   {{realtor_name}}
Stage:     {{stage}}
Due Date:  {{due_date}}
Note:      {{follow_up_note}}

Open CRM: {{crm_link}}

— DealFlow CRM`;

  return (
    <div style={S.viewWrap}>
      <div style={S.viewHeader}>
        <div><h2 style={S.viewTitle}>Setup & Integrations</h2><p style={S.viewSub}>Google Sheets sync · Email reminders</p></div>
      </div>

      <div style={S.setupCard}>
        <div style={S.setupCardHeader}>
          <span style={S.setupIcon}>📊</span>
          <div style={{flex:1}}>
            <div style={S.setupTitle}>Google Sheets Sync</div>
            <div style={S.setupSub}>Auto-syncs every save · All properties + KPIs in two tabs</div>
          </div>
          <button style={S.addBtn} onClick={onManualSync} disabled={syncStatus==="syncing"}>{syncStatus==="syncing"?"Syncing…":"Force Sync Now"}</button>
        </div>
        <div style={S.setupSteps}>
          <p style={S.setupStepTitle}>One-time setup (~10 min):</p>
          {[
            "Go to sheets.google.com — create a new spreadsheet named 'DealFlow CRM'.",
            "Click Extensions → Apps Script. Delete all existing code in the editor.",
            "Paste the Apps Script code below, then click the 💾 Save icon.",
            "Click Deploy → New Deployment. Type = Web App. Execute as = Me. Who has access = Anyone. Click Deploy. Copy the URL it gives you.",
            "Go to your GitHub repo → src/App.jsx → click the pencil (edit) icon. Find: YOUR_GOOGLE_APPS_SCRIPT_URL and replace it with your copied URL. Commit the change.",
            "Vercel auto-redeploys in ~60 seconds. Come back to this Setup page and click 'Force Sync Now' to test.",
          ].map((s,i)=>(
            <div key={i} style={S.setupStep}>
              <span style={S.setupStepNum}>{i+1}</span>
              <span style={S.setupStepText}>{s}</span>
            </div>
          ))}
          <p style={{...S.setupStepTitle,marginTop:16}}>Apps Script Code (paste this):</p>
          <div style={S.codeBlock}>{APPS_SCRIPT}</div>
        </div>
      </div>

      <div style={{...S.setupCard,marginTop:24}}>
        <div style={S.setupCardHeader}>
          <span style={S.setupIcon}>📧</span>
          <div>
            <div style={S.setupTitle}>Email Reminders via EmailJS</div>
            <div style={S.setupSub}>Free up to 200 emails/month — sends to vince@ and gary@ on the due date</div>
          </div>
        </div>
        <div style={S.setupSteps}>
          <p style={S.setupStepTitle}>One-time setup (~10 min):</p>
          {[
            "Go to emailjs.com → Sign Up free.",
            "Click Email Services → Add New Service → Gmail. Connect vincentjeromepowell@gmail.com. Copy your Service ID.",
            "Click Email Templates → Create New Template. Paste the template text below. Set the 'To Email' field to {{to_email}}. Save. Copy your Template ID.",
            "Click Account (top right) → copy your Public Key.",
            "Go to GitHub → src/App.jsx → edit. Replace YOUR_EMAILJS_SERVICE_ID, YOUR_EMAILJS_TEMPLATE_ID, and YOUR_EMAILJS_PUBLIC_KEY with your three values. Commit.",
            "Done — reminders will now email both vince@vppropertypros.com and gary@vppropertypros.com on the due date.",
          ].map((s,i)=>(
            <div key={i} style={S.setupStep}>
              <span style={S.setupStepNum}>{i+1}</span>
              <span style={S.setupStepText}>{s}</span>
            </div>
          ))}
          <p style={{...S.setupStepTitle,marginTop:16}}>Email Template (paste this into EmailJS):</p>
          <div style={S.codeBlock}>{EMAIL_TEMPLATE}</div>
        </div>
      </div>
    </div>
  );
}

// ── PROPERTY MODAL ─────────────────────────────────────────────────────────
function PropertyModal({ item, user, onSave, onDelete, onClose, onSendReminder }) {
  const [form,setForm]=useState(item);
  const [tab,setTab]=useState("info");
  const [newFuText,setNewFuText]=useState("");
  const [newFuDate,setNewFuDate]=useState("");
  const [sending,setSending]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const addFollowUp=async()=>{
    if(!newFuText.trim()) return;
    const fu={text:newFuText,date:today(),dueDate:newFuDate||null,by:user.name,dismissed:false};
    set("followUps",[...(form.followUps||[]),fu]);
    if(newFuDate&&onSendReminder){
      setSending(true);
      await onSendReminder(CONFIG.emails.owner,"Vince",form,newFuText,newFuDate);
      await onSendReminder(CONFIG.emails.va,"Gary",form,newFuText,newFuDate);
      setSending(false);
    }
    setNewFuText(""); setNewFuDate("");
  };

  const Field=({label,field,type="text",placeholder=""})=>(
    <div style={S.field}>
      <label style={S.fieldLabel}>{label}</label>
      <input style={S.fieldInput} type={type} placeholder={placeholder} value={form[field]||""} onChange={e=>set(field,e.target.value)}/>
    </div>
  );

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHeader}>
          <h3 style={S.modalTitle}>{form.id?"Edit Property":"Add Property"}</h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.stageRow}>
          {STAGES.map(s=>(
            <button key={s.id} style={{...S.stagePill,...(form.stage===s.id?{background:s.color,color:"#fff",borderColor:s.color}:{borderColor:s.color+"66",color:s.color})}} onClick={()=>set("stage",s.id)}>{s.label}</button>
          ))}
        </div>
        <div style={S.modalTabs}>
          {["info","financials","offer","notes"].map(t=>(
            <button key={t} style={{...S.modalTab,...(tab===t?S.modalTabActive:{})}} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
          ))}
        </div>
        <div style={S.modalBody}>
          {tab==="info"&&(
            <div style={S.fieldGrid}>
              <Field label="Property Address" field="address" placeholder="123 Main St, City, ST 12345"/>
              <Field label="MLS / Listing Link" field="link" placeholder="https://..."/>
              <Field label="Realtor Name" field="realtorName"/>
              <Field label="Realtor Phone" field="realtorPhone" type="tel"/>
              <Field label="Realtor Email" field="realtorEmail" type="email"/>
              <div style={S.field}>
                <label style={S.fieldLabel}>Checkboxes</label>
                <div style={{display:"flex",gap:16}}>
                  <label style={S.checkLabel}><input type="checkbox" checked={!!form.loi} onChange={e=>set("loi",e.target.checked)}/> LOI Sent</label>
                  <label style={S.checkLabel}><input type="checkbox" checked={!!form.contractSent} onChange={e=>set("contractSent",e.target.checked)}/> Contract Sent</label>
                </div>
              </div>
            </div>
          )}
          {tab==="financials"&&(
            <div style={S.fieldGrid}>
              <Field label="Asking Price" field="askingPrice" placeholder="350000"/>
              <Field label="Initial Loan Amount" field="loanAmount" placeholder="280000"/>
              <Field label="Est. Mortgage Payment" field="mortgagePayment" placeholder="1850"/>
              <Field label="Est. Loan Balance" field="loanBalance" placeholder="260000"/>
              <Field label="Est. Interest Rate (%)" field="interestRate" placeholder="4.5"/>
              <Field label="Rent Roll (monthly)" field="rentRoll" placeholder="2400"/>
              <Field label="Cash Flow (monthly)" field="cashFlow" placeholder="550"/>
              <Field label="Monthly Insurance" field="monthlyInsurance" placeholder="120"/>
              <Field label="Monthly Taxes" field="monthlyTaxes" placeholder="310"/>
            </div>
          )}
          {tab==="offer"&&(
            <div style={S.fieldGrid}>
              <div style={S.field}>
                <label style={S.fieldLabel}>Offer Type</label>
                <select style={S.fieldInput} value={form.offerType||""} onChange={e=>set("offerType",e.target.value)}>
                  <option value="">Select type…</option>
                  {OFFER_TYPES.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <Field label="Offer to Seller ($)" field="offerToSeller" placeholder="310000"/>
            </div>
          )}
          {tab==="notes"&&(
            <div>
              <textarea style={{...S.fieldInput,height:100,resize:"vertical",fontFamily:"inherit"}} placeholder="Notes about this deal…" value={form.notes||""} onChange={e=>set("notes",e.target.value)}/>
              <div style={{marginTop:20}}>
                <label style={S.fieldLabel}>Follow-Up Log</label>
                <div style={S.followUpList}>
                  {(form.followUps||[]).map((fu,i)=>(
                    <div key={i} style={{...S.followUpItem,...(fu.dismissed?{opacity:0.4}:{})}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={S.followUpDate}>{fu.date} · {fu.by}</span>
                        {fu.dueDate&&<span style={{fontSize:11,color:(isToday(fu.dueDate)||isPast(fu.dueDate))&&!fu.dismissed?"#F39C12":C.accent}}>{fu.dismissed?"✓ Done":`📅 Due: ${fu.dueDate}`}</span>}
                      </div>
                      <span>{fu.text}</span>
                    </div>
                  ))}
                  {(!form.followUps||form.followUps.length===0)&&<div style={{color:C.muted,fontSize:13}}>No follow-ups logged yet.</div>}
                </div>
                <div style={{marginTop:12}}>
                  <input style={{...S.fieldInput,marginBottom:8}} placeholder="Follow-up note…" value={newFuText} onChange={e=>setNewFuText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addFollowUp()}/>
                  <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                    <div style={{flex:1}}>
                      <label style={S.fieldLabel}>Reminder Date (optional)</label>
                      <input style={S.fieldInput} type="date" value={newFuDate} onChange={e=>setNewFuDate(e.target.value)} min={today()}/>
                    </div>
                    <button style={{...S.addBtn,whiteSpace:"nowrap"}} onClick={addFollowUp} disabled={sending}>
                      {sending?"Sending…":newFuDate?"Add + Remind":"Add Note"}
                    </button>
                  </div>
                  {newFuDate&&<p style={{fontSize:11,color:C.accent,marginTop:6}}>📧 Reminder emails to vince@ and gary@ on {newFuDate}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={S.modalFooter}>
          {onDelete&&form.id&&<button style={S.deleteBtn} onClick={()=>onDelete(form.id)}>Delete</button>}
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={S.saveBtn} onClick={()=>onSave(form)}>Save Property</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KPI MODAL ──────────────────────────────────────────────────────────────
function KpiModal({ item, onSave, onClose }) {
  const [form,setForm]=useState(item);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const KPI_KEYS=[
    {key:"newReachOuts",label:"New Reach Outs"},
    {key:"newConversations",label:"New Conversations"},
    {key:"followUps",label:"Follow Ups"},
    {key:"loisSent",label:"LOIs Sent"},
    {key:"contractsSent",label:"Contracts Sent"},
    {key:"offersAccepted",label:"Offers Accepted"},
  ];
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:460}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHeader}><h3 style={S.modalTitle}>Log KPIs</h3><button style={S.closeBtn} onClick={onClose}>✕</button></div>
        <div style={{padding:"20px 24px"}}>
          <div style={S.field}><label style={S.fieldLabel}>Date</label><input style={S.fieldInput} type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></div>
          {KPI_KEYS.map(k=>(
            <div key={k.key} style={S.field}><label style={S.fieldLabel}>{k.label}</label><input style={S.fieldInput} type="number" min="0" value={form[k.key]||0} onChange={e=>set(k.key,parseInt(e.target.value)||0)}/></div>
          ))}
        </div>
        <div style={S.modalFooter}>
          <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={S.saveBtn} onClick={()=>onSave(form)}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── STYLES ─────────────────────────────────────────────────────────────────
const C={bg:"#0D0F14",surface:"#161920",border:"#232733",text:"#E8EAF0",muted:"#6B7280",accent:"#C8A96E",accentDim:"#C8A96E22"};
const S={
  shell:{display:"flex",minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Georgia',serif"},
  main:{flex:1,overflowY:"auto",minWidth:0},
  toastStack:{position:"fixed",bottom:24,right:24,zIndex:999,display:"flex",flexDirection:"column",gap:8},
  toast:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 16px",fontSize:13,color:C.text,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",minWidth:220},
  toastSuccess:{borderColor:"#27AE6066",color:"#27AE60"},
  toastWarning:{borderColor:"#F39C1266",color:"#F39C12"},
  toastError:{borderColor:"#E74C3C66",color:"#E74C3C"},
  loginShell:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:C.bg},
  loginCard:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"48px 40px",width:360,textAlign:"center"},
  loginLogo:{fontSize:40,color:C.accent,marginBottom:12},
  loginTitle:{margin:"0 0 4px",fontSize:26,fontWeight:700,color:C.text,letterSpacing:"-0.5px"},
  loginSub:{margin:"0 0 32px",fontSize:13,color:C.muted},
  loginFields:{display:"flex",flexDirection:"column",gap:12},
  loginInput:{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",color:C.text,fontSize:14,outline:"none"},
  loginBtn:{background:C.accent,color:"#0D0F14",border:"none",borderRadius:8,padding:"13px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:4},
  loginError:{color:"#E74C3C",fontSize:13,margin:0},
  sidebar:{width:220,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"24px 0",flexShrink:0,minHeight:"100vh"},
  sidebarLogo:{display:"flex",alignItems:"center",gap:10,padding:"0 20px"},
  sidebarLogoIcon:{fontSize:22,color:C.accent},
  sidebarLogoText:{fontSize:18,fontWeight:700,letterSpacing:"-0.3px"},
  sidebarBadge:{margin:"12px 20px 0",background:C.accentDim,border:`1px solid ${C.accent}33`,borderRadius:6,padding:"4px 10px",fontSize:11,color:C.accent,display:"inline-block"},
  navBtn:{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 20px",background:"none",border:"none",color:C.muted,fontSize:14,cursor:"pointer",textAlign:"left"},
  navBtnActive:{color:C.text,background:`${C.accent}14`,borderRight:`2px solid ${C.accent}`},
  navIcon:{fontSize:16},
  navBadge:{marginLeft:"auto",background:"#E74C3C",color:"#fff",borderRadius:10,fontSize:10,padding:"1px 6px",fontWeight:700},
  sidebarSectionLabel:{padding:"0 20px",fontSize:10,color:C.muted,letterSpacing:"0.1em",marginBottom:6},
  sidebarStageRow:{display:"flex",alignItems:"center",gap:8,padding:"4px 20px"},
  sidebarDot:{width:7,height:7,borderRadius:"50%",flexShrink:0},
  sidebarStageLabel:{flex:1,fontSize:12,color:C.muted},
  sidebarStageCount:{fontSize:12,color:C.text},
  sidebarFooter:{padding:"0 20px",display:"flex",alignItems:"center",gap:10},
  sidebarUser:{display:"flex",alignItems:"center",gap:10,flex:1},
  sidebarAvatar:{width:32,height:32,borderRadius:"50%",background:C.accent,color:"#0D0F14",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14},
  sidebarUserName:{fontSize:13,fontWeight:600},
  sidebarUserRole:{fontSize:11,color:C.muted},
  logoutBtn:{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16},
  viewWrap:{padding:"32px 32px 80px"},
  viewHeader:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12},
  viewTitle:{margin:"0 0 4px",fontSize:22,fontWeight:700,letterSpacing:"-0.3px"},
  viewSub:{margin:0,fontSize:13,color:C.muted},
  headerActions:{display:"flex",gap:8,flexWrap:"wrap"},
  searchInput:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.text,fontSize:13,outline:"none",width:200},
  filterSelect:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:13,outline:"none"},
  addBtn:{background:C.accent,color:"#0D0F14",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"},
  exportBtn:{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",color:C.muted,fontSize:13,cursor:"pointer"},
  dueBanner:{background:"#F39C1215",border:"1px solid #F39C1244",borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#F39C12"},
  stagePills:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:24},
  pill:{background:"none",border:`1px solid ${C.border}`,borderRadius:20,padding:"5px 12px",color:C.muted,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6},
  pillActive:{background:C.accentDim,borderColor:C.accent,color:C.accent},
  dot:{width:7,height:7,borderRadius:"50%",display:"inline-block"},
  kanban:{display:"flex",gap:14,overflowX:"auto",paddingBottom:16},
  kanbanCol:{minWidth:200,flex:"0 0 200px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"},
  kanbanHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px"},
  kanbanTitle:{fontSize:12,fontWeight:600,letterSpacing:"0.05em",color:C.muted},
  kanbanCount:{fontSize:11,color:"#fff",borderRadius:10,padding:"2px 7px",fontWeight:700},
  kanbanCards:{padding:"8px",display:"flex",flexDirection:"column",gap:8,minHeight:80},
  emptyCol:{color:C.muted,fontSize:12,textAlign:"center",padding:"20px 0"},
  card:{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px",cursor:"pointer"},
  cardDue:{border:"1px solid #F39C1244",background:"#F39C1208"},
  cardTop:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6,marginBottom:6},
  cardAddr:{fontSize:12,fontWeight:600,lineHeight:1.4},
  cardTag:{background:C.accentDim,color:C.accent,fontSize:10,borderRadius:4,padding:"2px 6px",whiteSpace:"nowrap"},
  cardRealtor:{fontSize:11,color:C.muted,marginBottom:6},
  cardMeta:{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:8},
  badge:{background:"#27AE6022",color:"#27AE60",border:"1px solid #27AE6044",borderRadius:4,fontSize:10,padding:"1px 5px"},
  stageSelect:{width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 8px",color:C.text,fontSize:11,outline:"none",cursor:"pointer"},
  tableWrap:{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`},
  table:{width:"100%",borderCollapse:"collapse",fontSize:13},
  th:{background:C.surface,padding:"12px 14px",textAlign:"left",color:C.muted,fontSize:11,letterSpacing:"0.05em",fontWeight:600,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"},
  tr:{borderBottom:`1px solid ${C.border}`,cursor:"pointer"},
  td:{padding:"11px 14px",color:C.text,verticalAlign:"middle"},
  tdAddr:{fontWeight:600},
  stageChip:{borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:600},
  reminderSectionTitle:{fontSize:14,fontWeight:700,color:C.text,marginBottom:12},
  reminderList:{display:"flex",flexDirection:"column",gap:12},
  reminderCard:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px"},
  reminderTop:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,marginBottom:12},
  reminderAddr:{fontSize:14,fontWeight:700,marginBottom:4},
  reminderRealtor:{fontSize:12,color:C.muted,marginBottom:6},
  reminderNote:{fontSize:13,color:C.text,fontStyle:"italic"},
  reminderRight:{textAlign:"right",flexShrink:0},
  reminderDate:{fontSize:13,fontWeight:700,color:"#F39C12"},
  reminderBy:{fontSize:11,color:C.muted,marginTop:4},
  reminderActions:{display:"flex",gap:8},
  emptyState:{textAlign:"center",padding:"80px 20px"},
  emptyIcon:{fontSize:48,color:"#27AE60",marginBottom:16},
  emptyText:{fontSize:18,fontWeight:700,color:C.text,marginBottom:8},
  emptySub:{fontSize:13,color:C.muted},
  kpiGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14,marginBottom:28},
  kpiCard:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",textAlign:"center"},
  kpiIcon:{fontSize:24,marginBottom:8},
  kpiValue:{fontSize:32,fontWeight:700,color:C.accent},
  kpiLabel:{fontSize:12,color:C.muted,marginTop:4},
  setupCard:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px"},
  setupCardHeader:{display:"flex",alignItems:"center",gap:16,marginBottom:20},
  setupIcon:{fontSize:28},
  setupTitle:{fontSize:16,fontWeight:700,color:C.text},
  setupSub:{fontSize:12,color:C.muted,marginTop:2},
  setupSteps:{borderTop:`1px solid ${C.border}`,paddingTop:16},
  setupStepTitle:{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:12},
  setupStep:{display:"flex",gap:12,marginBottom:10},
  setupStepNum:{width:22,height:22,borderRadius:"50%",background:C.accent,color:"#0D0F14",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1},
  setupStepText:{fontSize:13,color:C.text,lineHeight:1.6},
  codeBlock:{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",fontSize:11,color:"#7EC8A4",fontFamily:"monospace",whiteSpace:"pre",overflowX:"auto",marginTop:12},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20},
  modal:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,width:"100%",maxWidth:680,maxHeight:"90vh",overflowY:"auto",display:"flex",flexDirection:"column"},
  modalHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px",borderBottom:`1px solid ${C.border}`},
  modalTitle:{margin:0,fontSize:18,fontWeight:700},
  closeBtn:{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer"},
  stageRow:{display:"flex",gap:6,flexWrap:"wrap",padding:"14px 24px",borderBottom:`1px solid ${C.border}`},
  stagePill:{border:"1px solid",borderRadius:20,padding:"4px 12px",fontSize:11,cursor:"pointer",background:"none",fontFamily:"inherit"},
  modalTabs:{display:"flex",borderBottom:`1px solid ${C.border}`},
  modalTab:{flex:1,padding:"12px",background:"none",border:"none",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  modalTabActive:{color:C.accent,borderBottom:`2px solid ${C.accent}`},
  modalBody:{padding:"20px 24px",flex:1},
  modalFooter:{display:"flex",alignItems:"center",padding:"16px 24px",borderTop:`1px solid ${C.border}`,gap:8},
  fieldGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"},
  field:{marginBottom:16},
  fieldLabel:{display:"block",fontSize:11,color:C.muted,marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase"},
  fieldInput:{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:13,outline:"none",fontFamily:"inherit"},
  checkLabel:{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",color:C.text},
  followUpList:{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:12,minHeight:60,maxHeight:160,overflowY:"auto",display:"flex",flexDirection:"column",gap:8},
  followUpItem:{display:"flex",flexDirection:"column",gap:2,fontSize:13},
  followUpDate:{fontSize:11,color:C.muted},
  saveBtn:{background:C.accent,color:"#0D0F14",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,fontWeight:700,cursor:"pointer"},
  cancelBtn:{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 16px",fontSize:13,color:C.muted,cursor:"pointer"},
  deleteBtn:{background:"none",border:"1px solid #E74C3C44",borderRadius:8,padding:"9px 16px",fontSize:13,color:"#E74C3C",cursor:"pointer"},
};
