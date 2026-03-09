import { useState, useEffect, useCallback } from "react";

// ── USERS ──────────────────────────────────────────────────────────────────
const USERS = {
  admin: { password: "VPllcoolio1+dealflowcrm", role: "admin", name: "Owner" },
  va: { password: "va123", role: "va", name: "VA" },
};

const STAGES = [
  { id: "contacted", label: "Contacted", color: "#4A90D9" },
  { id: "voicemail", label: "Voicemail / Text", color: "#9B59B6" },
  { id: "offer_made", label: "Offer Made", color: "#F39C12" },
  { id: "offer_accepted", label: "Offer Accepted", color: "#27AE60" },
  { id: "taken_off", label: "Taken Off Market", color: "#95A5A6" },
  { id: "offer_rejected", label: "Offer Rejected", color: "#E74C3C" },
];

const OFFER_TYPES = ["Sub-To", "Seller Finance", "Hybrid", "Cash", "Other"];

const EMPTY_PROPERTY = {
  id: null,
  address: "",
  link: "",
  realtorName: "",
  realtorPhone: "",
  realtorEmail: "",
  askingPrice: "",
  loanAmount: "",
  mortgagePayment: "",
  loanBalance: "",
  interestRate: "",
  rentRoll: "",
  cashFlow: "",
  monthlyInsurance: "",
  monthlyTaxes: "",
  offerType: "",
  offerToSeller: "",
  stage: "contacted",
  notes: "",
  followUps: [],
  addedBy: "",
  addedDate: "",
  loi: false,
  contractSent: false,
};

const EMPTY_KPI = {
  date: "",
  newReachOuts: 0,
  newConversations: 0,
  followUps: 0,
  loisSent: 0,
  contractsSent: 0,
  offersAccepted: 0,
};

// ── STORAGE ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "wholesaling_crm_v1";
const loadData = () => {
  try {
    const raw = window.__crmData || null;
    if (raw) return raw;
  } catch {}
  return { properties: [], kpis: [] };
};
const saveData = (data) => {
  window.__crmData = data;
};

// ── HELPERS ────────────────────────────────────────────────────────────────
const fmt = (val, prefix = "$") => {
  if (!val && val !== 0) return "—";
  const n = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(n)) return val;
  return prefix + n.toLocaleString("en-US", { minimumFractionDigits: 0 });
};
const today = () => new Date().toISOString().split("T")[0];
const uid = () => Math.random().toString(36).slice(2, 10);

// ── MAIN APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState("pipeline");
  const [modal, setModal] = useState(null); // {type:'property'|'kpi', item}
  const [filterStage, setFilterStage] = useState("all");
  const [search, setSearch] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "", error: "" });

  const persist = useCallback((next) => { saveData(next); setData(next); }, []);

  // ── LOGIN ──
  const handleLogin = () => {
    const u = USERS[loginForm.username.toLowerCase()];
    if (!u || u.password !== loginForm.password) {
      setLoginForm(f => ({ ...f, error: "Invalid username or password." }));
      return;
    }
    setUser({ username: loginForm.username.toLowerCase(), ...u });
    setLoginForm({ username: "", password: "", error: "" });
  };

  // ── PROPERTY CRUD ──
  const saveProperty = (prop) => {
    const isNew = !prop.id;
    const item = isNew
      ? { ...prop, id: uid(), addedBy: user.name, addedDate: today() }
      : { ...prop };
    const properties = isNew
      ? [...data.properties, item]
      : data.properties.map(p => p.id === item.id ? item : p);
    persist({ ...data, properties });
    setModal(null);
  };

  const deleteProperty = (id) => {
    if (!confirm("Delete this property?")) return;
    persist({ ...data, properties: data.properties.filter(p => p.id !== id) });
    setModal(null);
  };

  const updateStage = (id, stage) => {
    persist({ ...data, properties: data.properties.map(p => p.id === id ? { ...p, stage } : p) });
  };

  // ── KPI CRUD ──
  const saveKpi = (kpi) => {
    const isNew = !kpi.id;
    const item = isNew ? { ...kpi, id: uid() } : { ...kpi };
    const kpis = isNew ? [...data.kpis, item] : data.kpis.map(k => k.id === item.id ? item : k);
    persist({ ...data, kpis });
    setModal(null);
  };

  // ── DERIVED ──
  const filtered = data.properties.filter(p => {
    const matchStage = filterStage === "all" || p.stage === filterStage;
    const q = search.toLowerCase();
    const matchSearch = !q || [p.address, p.realtorName, p.realtorEmail, p.offerType].some(v => v?.toLowerCase().includes(q));
    return matchStage && matchSearch;
  });

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s.id] = data.properties.filter(p => p.stage === s.id).length;
    return acc;
  }, {});

  const totalKpis = data.kpis.reduce((acc, k) => {
    ["newReachOuts","newConversations","followUps","loisSent","contractsSent","offersAccepted"].forEach(key => {
      acc[key] = (acc[key] || 0) + Number(k[key] || 0);
    });
    return acc;
  }, {});

  const exportCSV = () => {
    const headers = ["Address","Stage","Realtor","Phone","Email","Asking Price","Offer Type","Offer","LOI","Contract","Added By","Date"];
    const rows = data.properties.map(p => [
      p.address, p.stage, p.realtorName, p.realtorPhone, p.realtorEmail,
      p.askingPrice, p.offerType, p.offerToSeller, p.loi?"Yes":"No", p.contractSent?"Yes":"No", p.addedBy, p.addedDate
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v||""}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "crm_export.csv";
    a.click();
  };

  if (!user) return <LoginScreen form={loginForm} setForm={setLoginForm} onLogin={handleLogin} />;

  return (
    <div style={styles.shell}>
      <Sidebar tab={tab} setTab={setTab} user={user} onLogout={() => setUser(null)} counts={stageCounts} />
      <main style={styles.main}>
        {tab === "pipeline" && (
          <PipelineView
            properties={filtered} stages={STAGES} stageCounts={stageCounts}
            filterStage={filterStage} setFilterStage={setFilterStage}
            search={search} setSearch={setSearch}
            onAdd={() => setModal({ type: "property", item: { ...EMPTY_PROPERTY } })}
            onEdit={(item) => setModal({ type: "property", item })}
            onStageChange={updateStage}
            onExport={exportCSV}
            user={user}
          />
        )}
        {tab === "properties" && (
          <PropertiesTable
            properties={filtered} stages={STAGES}
            search={search} setSearch={setSearch}
            filterStage={filterStage} setFilterStage={setFilterStage}
            onAdd={() => setModal({ type: "property", item: { ...EMPTY_PROPERTY } })}
            onEdit={(item) => setModal({ type: "property", item })}
            onExport={exportCSV}
            user={user}
          />
        )}
        {tab === "kpis" && (
          <KpiView
            kpis={data.kpis} totals={totalKpis}
            onAdd={() => setModal({ type: "kpi", item: { ...EMPTY_KPI, id: null, date: today() } })}
            onEdit={(item) => setModal({ type: "kpi", item })}
            user={user}
          />
        )}
      </main>

      {modal?.type === "property" && (
        <PropertyModal
          item={modal.item}
          user={user}
          onSave={saveProperty}
          onDelete={user.role === "admin" ? deleteProperty : null}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "kpi" && (
        <KpiModal item={modal.item} onSave={saveKpi} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function LoginScreen({ form, setForm, onLogin }) {
  return (
    <div style={styles.loginShell}>
      <div style={styles.loginCard}>
        <div style={styles.loginLogo}>⬡</div>
        <h1 style={styles.loginTitle}>DealFlow CRM</h1>
        <p style={styles.loginSub}>Wholesaling · Creative Finance</p>
        <div style={styles.loginFields}>
          <input
            style={styles.loginInput}
            placeholder="Username"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value, error: "" }))}
            onKeyDown={e => e.key === "Enter" && onLogin()}
          />
          <input
            style={styles.loginInput}
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value, error: "" }))}
            onKeyDown={e => e.key === "Enter" && onLogin()}
          />
          {form.error && <p style={styles.loginError}>{form.error}</p>}
          <button style={styles.loginBtn} onClick={onLogin}>Sign In</button>
        </div>
        <p style={styles.loginHint}>admin / VPllcoolio1+dealflowcrm &nbsp;·&nbsp; va / va123</p>
      </div>
    </div>
  );
}

// ── SIDEBAR ────────────────────────────────────────────────────────────────
function Sidebar({ tab, setTab, user, onLogout, counts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const navItems = [
    { id: "pipeline", icon: "◈", label: "Pipeline" },
    { id: "properties", icon: "⊞", label: "Properties" },
    { id: "kpis", icon: "◎", label: "VA KPIs" },
  ];
  return (
    <aside style={styles.sidebar}>
      <div>
        <div style={styles.sidebarLogo}>
          <span style={styles.sidebarLogoIcon}>⬡</span>
          <span style={styles.sidebarLogoText}>DealFlow</span>
        </div>
        <div style={styles.sidebarBadge}>{total} properties</div>
        <nav style={{ marginTop: 24 }}>
          {navItems.map(n => (
            <button key={n.id} style={{ ...styles.navBtn, ...(tab === n.id ? styles.navBtnActive : {}) }}
              onClick={() => setTab(n.id)}>
              <span style={styles.navIcon}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 32 }}>
          <p style={styles.sidebarSectionLabel}>PIPELINE</p>
          {STAGES.map(s => (
            <div key={s.id} style={styles.sidebarStageRow}>
              <span style={{ ...styles.sidebarDot, background: s.color }} />
              <span style={styles.sidebarStageLabel}>{s.label}</span>
              <span style={styles.sidebarStageCount}>{counts[s.id] || 0}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={styles.sidebarFooter}>
        <div style={styles.sidebarUser}>
          <div style={styles.sidebarAvatar}>{user.name[0]}</div>
          <div>
            <div style={styles.sidebarUserName}>{user.name}</div>
            <div style={styles.sidebarUserRole}>{user.role === "admin" ? "Owner" : "VA"}</div>
          </div>
        </div>
        <button style={styles.logoutBtn} onClick={onLogout}>↩</button>
      </div>
    </aside>
  );
}

// ── PIPELINE VIEW ──────────────────────────────────────────────────────────
function PipelineView({ properties, stages, stageCounts, filterStage, setFilterStage, search, setSearch, onAdd, onEdit, onStageChange, onExport, user }) {
  return (
    <div style={styles.viewWrap}>
      <div style={styles.viewHeader}>
        <div>
          <h2 style={styles.viewTitle}>Pipeline</h2>
          <p style={styles.viewSub}>{properties.length} properties shown</p>
        </div>
        <div style={styles.headerActions}>
          <input style={styles.searchInput} placeholder="Search address, realtor…" value={search} onChange={e => setSearch(e.target.value)} />
          <button style={styles.exportBtn} onClick={onExport}>↓ CSV</button>
          <button style={styles.addBtn} onClick={onAdd}>+ Add Property</button>
        </div>
      </div>

      {/* Stage filter pills */}
      <div style={styles.stagePills}>
        <button style={{ ...styles.pill, ...(filterStage === "all" ? styles.pillActive : {}) }} onClick={() => setFilterStage("all")}>All ({properties.length})</button>
        {stages.map(s => (
          <button key={s.id} style={{ ...styles.pill, ...(filterStage === s.id ? { ...styles.pillActive, borderColor: s.color, color: s.color } : {}) }}
            onClick={() => setFilterStage(s.id)}>
            <span style={{ ...styles.dot, background: s.color }} />{s.label} ({stageCounts[s.id] || 0})
          </button>
        ))}
      </div>

      {/* Kanban columns */}
      <div style={styles.kanban}>
        {stages.map(s => {
          const cols = properties.filter(p => p.stage === s.id);
          return (
            <div key={s.id} style={styles.kanbanCol}>
              <div style={{ ...styles.kanbanHeader, borderTop: `3px solid ${s.color}` }}>
                <span style={styles.kanbanTitle}>{s.label}</span>
                <span style={{ ...styles.kanbanCount, background: s.color }}>{cols.length}</span>
              </div>
              <div style={styles.kanbanCards}>
                {cols.map(p => <PropertyCard key={p.id} property={p} stages={stages} onEdit={onEdit} onStageChange={onStageChange} />)}
                {cols.length === 0 && <div style={styles.emptyCol}>No deals here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PropertyCard({ property: p, stages, onEdit, onStageChange }) {
  const stage = stages.find(s => s.id === p.stage);
  return (
    <div style={styles.card} onClick={() => onEdit(p)}>
      <div style={styles.cardTop}>
        <span style={styles.cardAddr}>{p.address || "No address"}</span>
        {p.offerType && <span style={styles.cardTag}>{p.offerType}</span>}
      </div>
      {p.realtorName && <div style={styles.cardRealtor}>👤 {p.realtorName}</div>}
      <div style={styles.cardMeta}>
        {p.askingPrice && <span>{fmt(p.askingPrice)}</span>}
        {p.loi && <span style={styles.badge}>LOI</span>}
        {p.contractSent && <span style={{ ...styles.badge, background: "#27AE60" }}>Contract</span>}
      </div>
      <select style={styles.stageSelect} value={p.stage}
        onClick={e => e.stopPropagation()}
        onChange={e => { e.stopPropagation(); onStageChange(p.id, e.target.value); }}>
        {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </div>
  );
}

// ── PROPERTIES TABLE ───────────────────────────────────────────────────────
function PropertiesTable({ properties, stages, search, setSearch, filterStage, setFilterStage, onAdd, onEdit, onExport, user }) {
  return (
    <div style={styles.viewWrap}>
      <div style={styles.viewHeader}>
        <div>
          <h2 style={styles.viewTitle}>All Properties</h2>
          <p style={styles.viewSub}>{properties.length} records</p>
        </div>
        <div style={styles.headerActions}>
          <input style={styles.searchInput} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={styles.filterSelect} value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="all">All Stages</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button style={styles.exportBtn} onClick={onExport}>↓ CSV</button>
          <button style={styles.addBtn} onClick={onAdd}>+ Add</button>
        </div>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Address","Stage","Realtor","Asking Price","Offer Type","Offer","LOI","Contract","Added By"].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {properties.map(p => {
              const stage = stages.find(s => s.id === p.stage);
              return (
                <tr key={p.id} style={styles.tr} onClick={() => onEdit(p)}>
                  <td style={styles.td}><span style={styles.tdAddr}>{p.address || "—"}</span></td>
                  <td style={styles.td}><span style={{ ...styles.stageChip, background: stage?.color + "22", color: stage?.color, border: `1px solid ${stage?.color}44` }}>{stage?.label}</span></td>
                  <td style={styles.td}>{p.realtorName || "—"}</td>
                  <td style={styles.td}>{fmt(p.askingPrice)}</td>
                  <td style={styles.td}>{p.offerType || "—"}</td>
                  <td style={styles.td}>{fmt(p.offerToSeller)}</td>
                  <td style={styles.td}>{p.loi ? "✓" : ""}</td>
                  <td style={styles.td}>{p.contractSent ? "✓" : ""}</td>
                  <td style={styles.td}>{p.addedBy || "—"}</td>
                </tr>
              );
            })}
            {properties.length === 0 && (
              <tr><td colSpan={9} style={{ ...styles.td, textAlign: "center", color: "#666", padding: 40 }}>No properties yet — add one!</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── KPI VIEW ───────────────────────────────────────────────────────────────
function KpiView({ kpis, totals, onAdd, onEdit, user }) {
  const KPI_KEYS = [
    { key: "newReachOuts", label: "New Reach Outs", icon: "📞" },
    { key: "newConversations", label: "New Conversations", icon: "💬" },
    { key: "followUps", label: "Follow Ups", icon: "🔁" },
    { key: "loisSent", label: "LOIs Sent", icon: "📄" },
    { key: "contractsSent", label: "Contracts Sent", icon: "📝" },
    { key: "offersAccepted", label: "Offers Accepted", icon: "🤝" },
  ];
  const sorted = [...kpis].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={styles.viewWrap}>
      <div style={styles.viewHeader}>
        <div>
          <h2 style={styles.viewTitle}>VA KPI Tracker</h2>
          <p style={styles.viewSub}>All-time performance</p>
        </div>
        <button style={styles.addBtn} onClick={onAdd}>+ Log Day</button>
      </div>

      {/* Summary cards */}
      <div style={styles.kpiGrid}>
        {KPI_KEYS.map(k => (
          <div key={k.key} style={styles.kpiCard}>
            <div style={styles.kpiIcon}>{k.icon}</div>
            <div style={styles.kpiValue}>{totals[k.key] || 0}</div>
            <div style={styles.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Log table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              {KPI_KEYS.map(k => <th key={k.key} style={styles.th}>{k.icon} {k.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map(k => (
              <tr key={k.id} style={styles.tr} onClick={() => onEdit(k)}>
                <td style={styles.td}>{k.date}</td>
                {KPI_KEYS.map(kk => <td key={kk.key} style={{ ...styles.td, textAlign: "center" }}>{k[kk.key] || 0}</td>)}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={7} style={{ ...styles.td, textAlign: "center", color: "#666", padding: 40 }}>No KPI logs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── PROPERTY MODAL ─────────────────────────────────────────────────────────
function PropertyModal({ item, user, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(item);
  const [tab, setTab] = useState("info");
  const [newFollowUp, setNewFollowUp] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addFollowUp = () => {
    if (!newFollowUp.trim()) return;
    set("followUps", [...(form.followUps || []), { text: newFollowUp, date: today(), by: user.name }]);
    setNewFollowUp("");
  };

  const Field = ({ label, field, type = "text", placeholder = "" }) => (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      <input style={styles.fieldInput} type={type} placeholder={placeholder} value={form[field] || ""}
        onChange={e => set(field, e.target.value)} />
    </div>
  );

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{form.id ? "Edit Property" : "Add Property"}</h3>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Stage quick-change */}
        <div style={styles.stageRow}>
          {STAGES.map(s => (
            <button key={s.id}
              style={{ ...styles.stagePill, ...(form.stage === s.id ? { background: s.color, color: "#fff", borderColor: s.color } : { borderColor: s.color + "66", color: s.color }) }}
              onClick={() => set("stage", s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div style={styles.modalTabs}>
          {["info", "financials", "offer", "notes"].map(t => (
            <button key={t} style={{ ...styles.modalTab, ...(tab === t ? styles.modalTabActive : {}) }} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div style={styles.modalBody}>
          {tab === "info" && (
            <div style={styles.fieldGrid}>
              <Field label="Property Address" field="address" placeholder="123 Main St, City, ST 12345" />
              <Field label="MLS / Listing Link" field="link" placeholder="https://..." />
              <Field label="Realtor Name" field="realtorName" />
              <Field label="Realtor Phone" field="realtorPhone" type="tel" />
              <Field label="Realtor Email" field="realtorEmail" type="email" />
              <div style={styles.field}>
                <label style={styles.fieldLabel}>Checkboxes</label>
                <div style={{ display: "flex", gap: 16 }}>
                  <label style={styles.checkLabel}><input type="checkbox" checked={!!form.loi} onChange={e => set("loi", e.target.checked)} /> LOI Sent</label>
                  <label style={styles.checkLabel}><input type="checkbox" checked={!!form.contractSent} onChange={e => set("contractSent", e.target.checked)} /> Contract Sent</label>
                </div>
              </div>
            </div>
          )}

          {tab === "financials" && (
            <div style={styles.fieldGrid}>
              <Field label="Asking Price" field="askingPrice" placeholder="350000" />
              <Field label="Initial Loan Amount" field="loanAmount" placeholder="280000" />
              <Field label="Est. Mortgage Payment" field="mortgagePayment" placeholder="1850" />
              <Field label="Est. Loan Balance" field="loanBalance" placeholder="260000" />
              <Field label="Est. Interest Rate (%)" field="interestRate" placeholder="4.5" />
              <Field label="Rent Roll (monthly)" field="rentRoll" placeholder="2400" />
              <Field label="Cash Flow (monthly)" field="cashFlow" placeholder="550" />
              <Field label="Monthly Insurance" field="monthlyInsurance" placeholder="120" />
              <Field label="Monthly Taxes" field="monthlyTaxes" placeholder="310" />
            </div>
          )}

          {tab === "offer" && (
            <div style={styles.fieldGrid}>
              <div style={styles.field}>
                <label style={styles.fieldLabel}>Offer Type</label>
                <select style={styles.fieldInput} value={form.offerType || ""} onChange={e => set("offerType", e.target.value)}>
                  <option value="">Select type…</option>
                  {OFFER_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <Field label="Offer to Seller ($)" field="offerToSeller" placeholder="310000" />
            </div>
          )}

          {tab === "notes" && (
            <div>
              <textarea
                style={{ ...styles.fieldInput, height: 120, resize: "vertical", fontFamily: "inherit" }}
                placeholder="Notes about this deal…"
                value={form.notes || ""}
                onChange={e => set("notes", e.target.value)}
              />
              <div style={{ marginTop: 20 }}>
                <label style={styles.fieldLabel}>Follow-Up Log</label>
                <div style={styles.followUpList}>
                  {(form.followUps || []).map((fu, i) => (
                    <div key={i} style={styles.followUpItem}>
                      <span style={styles.followUpDate}>{fu.date} · {fu.by}</span>
                      <span>{fu.text}</span>
                    </div>
                  ))}
                  {(!form.followUps || form.followUps.length === 0) && <div style={{ color: "#666", fontSize: 13 }}>No follow-ups logged yet.</div>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input style={{ ...styles.fieldInput, flex: 1 }} placeholder="Add follow-up note…"
                    value={newFollowUp} onChange={e => setNewFollowUp(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addFollowUp()} />
                  <button style={styles.addBtn} onClick={addFollowUp}>Add</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={styles.modalFooter}>
          {onDelete && form.id && (
            <button style={styles.deleteBtn} onClick={() => onDelete(form.id)}>Delete</button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={styles.saveBtn} onClick={() => onSave(form)}>Save Property</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KPI MODAL ──────────────────────────────────────────────────────────────
function KpiModal({ item, onSave, onClose }) {
  const [form, setForm] = useState(item);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const KPI_KEYS = [
    { key: "newReachOuts", label: "New Reach Outs" },
    { key: "newConversations", label: "New Conversations" },
    { key: "followUps", label: "Follow Ups" },
    { key: "loisSent", label: "LOIs Sent" },
    { key: "contractsSent", label: "Contracts Sent" },
    { key: "offersAccepted", label: "Offers Accepted" },
  ];
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Log KPIs</h3>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Date</label>
            <input style={styles.fieldInput} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
          </div>
          {KPI_KEYS.map(k => (
            <div key={k.key} style={styles.field}>
              <label style={styles.fieldLabel}>{k.label}</label>
              <input style={styles.fieldInput} type="number" min="0" value={form[k.key] || 0}
                onChange={e => set(k.key, parseInt(e.target.value) || 0)} />
            </div>
          ))}
        </div>
        <div style={styles.modalFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn} onClick={() => onSave(form)}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── STYLES ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#0D0F14",
  surface: "#161920",
  border: "#232733",
  text: "#E8EAF0",
  muted: "#6B7280",
  accent: "#C8A96E",
  accentDim: "#C8A96E22",
};

const styles = {
  shell: { display: "flex", minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Georgia', serif" },
  main: { flex: 1, overflowY: "auto", minWidth: 0 },

  // Login
  loginShell: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: C.bg },
  loginCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "48px 40px", width: 360, textAlign: "center" },
  loginLogo: { fontSize: 40, color: C.accent, marginBottom: 12 },
  loginTitle: { margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: "-0.5px" },
  loginSub: { margin: "0 0 32px", fontSize: 13, color: C.muted },
  loginFields: { display: "flex", flexDirection: "column", gap: 12 },
  loginInput: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none" },
  loginBtn: { background: C.accent, color: "#0D0F14", border: "none", borderRadius: 8, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4 },
  loginError: { color: "#E74C3C", fontSize: 13, margin: 0 },
  loginHint: { fontSize: 11, color: C.muted, marginTop: 20 },

  // Sidebar
  sidebar: { width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "24px 0", flexShrink: 0, minHeight: "100vh" },
  sidebarLogo: { display: "flex", alignItems: "center", gap: 10, padding: "0 20px 0" },
  sidebarLogoIcon: { fontSize: 22, color: C.accent },
  sidebarLogoText: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" },
  sidebarBadge: { margin: "12px 20px 0", background: C.accentDim, border: `1px solid ${C.accent}33`, borderRadius: 6, padding: "4px 10px", fontSize: 11, color: C.accent, display: "inline-block" },
  navBtn: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 20px", background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", textAlign: "left" },
  navBtnActive: { color: C.text, background: `${C.accent}14`, borderRight: `2px solid ${C.accent}` },
  navIcon: { fontSize: 16 },
  sidebarSectionLabel: { padding: "0 20px", fontSize: 10, color: C.muted, letterSpacing: "0.1em", marginBottom: 6 },
  sidebarStageRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 20px" },
  sidebarDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  sidebarStageLabel: { flex: 1, fontSize: 12, color: C.muted },
  sidebarStageCount: { fontSize: 12, color: C.text },
  sidebarFooter: { padding: "0 20px", display: "flex", alignItems: "center", gap: 10 },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  sidebarAvatar: { width: 32, height: 32, borderRadius: "50%", background: C.accent, color: "#0D0F14", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 },
  sidebarUserName: { fontSize: 13, fontWeight: 600 },
  sidebarUserRole: { fontSize: 11, color: C.muted },
  logoutBtn: { background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16 },

  // View
  viewWrap: { padding: "32px 32px 80px" },
  viewHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  viewTitle: { margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px" },
  viewSub: { margin: 0, fontSize: 13, color: C.muted },
  headerActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  searchInput: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none", width: 200 },
  filterSelect: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13, outline: "none" },
  addBtn: { background: C.accent, color: "#0D0F14", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  exportBtn: { background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.muted, fontSize: 13, cursor: "pointer" },

  // Stage pills
  stagePills: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 },
  pill: { background: "none", border: `1px solid ${C.border}`, borderRadius: 20, padding: "5px 12px", color: C.muted, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
  pillActive: { background: C.accentDim, borderColor: C.accent, color: C.accent },
  dot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block" },

  // Kanban
  kanban: { display: "flex", gap: 14, overflowX: "auto", paddingBottom: 16 },
  kanbanCol: { minWidth: 200, flex: "0 0 200px", background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" },
  kanbanHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" },
  kanbanTitle: { fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", color: C.muted },
  kanbanCount: { fontSize: 11, color: "#fff", borderRadius: 10, padding: "2px 7px", fontWeight: 700 },
  kanbanCards: { padding: "8px", display: "flex", flexDirection: "column", gap: 8, minHeight: 80 },
  emptyCol: { color: C.muted, fontSize: 12, textAlign: "center", padding: "20px 0" },
  card: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px", cursor: "pointer" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6 },
  cardAddr: { fontSize: 12, fontWeight: 600, lineHeight: 1.4 },
  cardTag: { background: C.accentDim, color: C.accent, fontSize: 10, borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" },
  cardRealtor: { fontSize: 11, color: C.muted, marginBottom: 6 },
  cardMeta: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 },
  badge: { background: "#27AE6022", color: "#27AE60", border: "1px solid #27AE6044", borderRadius: 4, fontSize: 10, padding: "1px 5px" },
  stageSelect: { width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", color: C.text, fontSize: 11, outline: "none", cursor: "pointer" },

  // Table
  tableWrap: { overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}` },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { background: C.surface, padding: "12px 14px", textAlign: "left", color: C.muted, fontSize: 11, letterSpacing: "0.05em", fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" },
  tr: { borderBottom: `1px solid ${C.border}`, cursor: "pointer" },
  td: { padding: "11px 14px", color: C.text, verticalAlign: "middle" },
  tdAddr: { fontWeight: 600 },
  stageChip: { borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 },

  // KPI
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 28 },
  kpiCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px", textAlign: "center" },
  kpiIcon: { fontSize: 24, marginBottom: 8 },
  kpiValue: { fontSize: 32, fontWeight: 700, color: C.accent },
  kpiLabel: { fontSize: 12, color: C.muted, marginTop: 4 },

  // Modal
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modal: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column" },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.border}` },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  closeBtn: { background: "none", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" },
  stageRow: { display: "flex", gap: 6, flexWrap: "wrap", padding: "14px 24px", borderBottom: `1px solid ${C.border}` },
  stagePill: { border: "1px solid", borderRadius: 20, padding: "4px 12px", fontSize: 11, cursor: "pointer", background: "none", fontFamily: "inherit" },
  modalTabs: { display: "flex", borderBottom: `1px solid ${C.border}` },
  modalTab: { flex: 1, padding: "12px", background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  modalTabActive: { color: C.accent, borderBottom: `2px solid ${C.accent}` },
  modalBody: { padding: "20px 24px", flex: 1 },
  modalFooter: { display: "flex", alignItems: "center", padding: "16px 24px", borderTop: `1px solid ${C.border}`, gap: 8 },

  // Fields
  fieldGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" },
  field: { marginBottom: 16 },
  fieldLabel: { display: "block", fontSize: 11, color: C.muted, marginBottom: 5, letterSpacing: "0.05em", textTransform: "uppercase" },
  fieldInput: { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit" },
  checkLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: C.text },

  // Follow ups
  followUpList: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, minHeight: 60, maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 },
  followUpItem: { display: "flex", flexDirection: "column", gap: 2, fontSize: 13 },
  followUpDate: { fontSize: 11, color: C.muted },

  saveBtn: { background: C.accent, color: "#0D0F14", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  cancelBtn: { background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 16px", fontSize: 13, color: C.muted, cursor: "pointer" },
  deleteBtn: { background: "none", border: "1px solid #E74C3C44", borderRadius: 8, padding: "9px 16px", fontSize: 13, color: "#E74C3C", cursor: "pointer" },
};
