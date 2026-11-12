/* Project Information (Project Hub → Project info). One place for a project's
   links, documents and credentials.
   Credential secrets stay encrypted in the database and are never loaded with the
   page: Reveal decrypts one on request (the database checks access and logs it),
   and it's dropped from memory again after REVEAL_MS. */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/api.js';
import { card, inputStyle, labelStyle, ghostButton, primaryButton, ModalShell, confirmAction } from '@/ui.jsx';
import { Pill, SkeletonList } from '@shared/dashboard-kit.jsx';
import { managesProject } from '@shared/permissions.js';

const RESOURCE_SECTIONS = [
  ['domain', 'Domain & website'],
  ['staging', 'Staging links'],
  ['landing', 'Landing pages'],
  ['server', 'Server details'],
  ['docs', 'Project documentation'],
  ['sow', 'SOW (Statement of Work)'],
  ['design', 'Design links & resources'],
  ['brand', 'Brand guidelines'],
  ['other', 'Other resources'],
];
const CREDENTIAL_CATEGORIES = [
  ['account', 'Account'],
  ['server', 'Server'],
  ['application', 'Application'],
  ['app_access', 'App access'],
  ['other', 'Other'],
];
const categoryLabel = (k) => CREDENTIAL_CATEGORIES.find(([c]) => c === k)?.[1] || k;
const LOG_ACTION = { created: 'added', updated: 'edited', secret_changed: 'changed the login of', revealed: 'revealed', deleted: 'deleted' };

const REVEAL_MS = 30_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // matches the project-files bucket limit
const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.zip,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

const smallBtn = { ...ghostButton, padding: '4px 12px', minHeight: 0, fontSize: 12 };
const fmtWhen = (iso) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// '' → null; adds https:// to a bare domain; rejects anything that isn't a web link
function normalizeUrl(raw) {
  const v = (raw || '').trim();
  if (!v) return { url: null };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) && !/^[^/]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(v) ? v : /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { error: 'Links must start with http:// or https://' };
    return { url: u.href };
  } catch {
    return { error: 'That doesn’t look like a valid link.' };
  }
}

function Section({ title, sub, action, children }) {
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ---- links + documents ---- */
function ResourceModal({ projectId, category, resource, userId, onClose, onSaved, showToast }) {
  const [f, setF] = useState({ title: resource?.title || '', url: resource?.url || '', notes: resource?.notes || '' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const section = RESOURCE_SECTIONS.find(([k]) => k === category)?.[1];
  const hasContent = f.url.trim() || f.notes.trim() || file || resource?.fileName;
  const invalid = !f.title.trim() || !hasContent;

  function pickFile(next) {
    if (next && next.size > MAX_FILE_BYTES) { setError('Files must be 25 MB or smaller.'); return; }
    setError('');
    setFile(next);
  }

  async function save() {
    if (invalid || saving) return;
    const { url, error: urlError } = normalizeUrl(f.url);
    if (urlError) { setError(urlError); return; }
    setSaving(true);
    try {
      const row = { title: f.title.trim(), url, notes: f.notes.trim() };
      if (file) {
        row.file_path = await api.uploadProjectFile(projectId, file);
        row.file_name = file.name;
        if (resource?.filePath) await api.removeProjectFile(resource.filePath).catch(() => {});
      }
      if (resource) await api.updateProjectResource(resource.id, row);
      else await api.createProjectResource({ ...row, project_id: projectId, category, created_by: userId });
      showToast(resource ? 'Saved' : 'Added');
      onSaved();
      onClose();
    } catch (e) {
      showToast(e.message, 'error');
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title={resource ? `Edit ${resource.title}` : `Add to ${section}`} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="res-title">Title</label>
          <input id="res-title" style={inputStyle} autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="res-url">Link</label>
          <input id="res-url" style={inputStyle} value={f.url} placeholder="example.com" onChange={(e) => set('url', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="res-file">File</label>
          <input id="res-file" type="file" accept={FILE_ACCEPT} style={{ fontSize: 13, display: 'block' }} onChange={(e) => pickFile(e.target.files?.[0] || null)} />
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {resource?.fileName && !file ? `Current file: ${resource.fileName}. ` : ''}Up to 25 MB. Only people on this project can open it.
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="res-notes">Notes</label>
          <textarea id="res-notes" style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Don’t put passwords here. Use Credentials, which are encrypted.</div>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={ghostButton} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={primaryButton(invalid || saving)} disabled={invalid || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </ModalShell>
  );
}

function ResourceRow({ r, canEdit, onEdit, onDelete, onOpenFile }) {
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--color-border-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
        {canEdit && (
          <>
            <button style={{ ...smallBtn, padding: '2px 8px', fontSize: 12 }} onClick={() => onEdit(r)}>Edit</button>
            <button style={{ ...smallBtn, padding: '2px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => onDelete(r)}>Delete</button>
          </>
        )}
      </div>
      {r.url && (
        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 12, color: 'var(--brand)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</a>
      )}
      {r.fileName && (
        <button onClick={() => onOpenFile(r)} style={{ display: 'block', background: 'none', border: 'none', padding: 0, marginTop: 2, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--brand)', textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ⬇ {r.fileName}
        </button>
      )}
      {r.notes && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{r.notes}</div>}
    </div>
  );
}

/* ---- credentials ---- */
function CredentialModal({ projectId, credential, onClose, onSaved, showToast }) {
  const [f, setF] = useState({
    category: credential?.category || 'account',
    label: credential?.label || '',
    url: credential?.url || '',
    access: credential?.accessLevel || 'managers',
    username: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const invalid = !f.label.trim() || (!credential && !f.username && !f.password);

  async function save() {
    if (invalid || saving) return;
    const { url, error: urlError } = normalizeUrl(f.url);
    if (urlError) { setError(urlError); return; }
    setSaving(true);
    try {
      await api.saveProjectCredential({
        id: credential?.id || null,
        projectId,
        category: f.category,
        label: f.label.trim(),
        url,
        accessLevel: f.access,
        // blank on edit = keep what's stored
        username: f.username || null,
        password: f.password || null,
      });
      showToast(credential ? 'Credential updated' : 'Credential added');
      onSaved();
      onClose();
    } catch (e) {
      showToast(e.message, 'error');
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title={credential ? `Edit ${credential.label}` : 'Add credential'} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="cred-label">Name</label>
            <input id="cred-label" style={inputStyle} autoFocus value={f.label} placeholder="e.g. Production server" onChange={(e) => set('label', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="cred-cat">Type</label>
            <select id="cred-cat" style={inputStyle} value={f.category} onChange={(e) => set('category', e.target.value)}>
              {CREDENTIAL_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="cred-url">Login link</label>
          <input id="cred-url" style={inputStyle} value={f.url} placeholder="example.com/login" onChange={(e) => set('url', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="cred-user">Username</label>
            <input id="cred-user" style={inputStyle} autoComplete="off" value={f.username} placeholder={credential ? 'Leave blank to keep' : ''} onChange={(e) => set('username', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="cred-pass">Password</label>
            <input id="cred-pass" type="password" style={inputStyle} autoComplete="new-password" value={f.password} placeholder={credential ? 'Leave blank to keep' : ''} onChange={(e) => set('password', e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="cred-access">Who can see this</label>
          <select id="cred-access" style={inputStyle} value={f.access} onChange={(e) => set('access', e.target.value)}>
            <option value="managers">Managers only (Team Lead, Project Manager, Admin)</option>
            <option value="team">Project members too</option>
          </select>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={ghostButton} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={primaryButton(invalid || saving)} disabled={invalid || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </ModalShell>
  );
}

function CredentialRow({ c, canManage, onEdit, onDelete, showToast }) {
  const [secret, setSecret] = useState(null); // only held while revealed
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const hide = useCallback(() => { clearTimeout(timer.current); setSecret(null); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function reveal() {
    setBusy(true);
    try {
      setSecret(await api.revealProjectCredential(c.id));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSecret(null), REVEAL_MS);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function copy(value, what) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${what} copied`);
    } catch {
      showToast('Couldn’t copy. Select the text instead.', 'error');
    }
  }
  const field = (label, value) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', width: 70, flexShrink: 0 }}>{label}</span>
      <code style={{ flex: 1, minWidth: 0, fontSize: 13, overflowWrap: 'anywhere' }}>{value || '—'}</code>
      {value && <button style={{ ...smallBtn, padding: '2px 8px', fontSize: 12 }} onClick={() => copy(value, label)}>Copy</button>}
    </div>
  );

  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--color-border-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{c.label}</span>
        <Pill label={categoryLabel(c.category)} tone="neutral" />
        <Pill label={c.accessLevel === 'team' ? 'Project members' : 'Leads & Admins'} tone={c.accessLevel === 'team' ? 'info' : 'warning'} />
        <span style={{ flex: 1 }} />
        <button style={smallBtn} disabled={busy} onClick={secret ? hide : reveal}>{secret ? 'Hide' : busy ? 'Revealing…' : 'Reveal'}</button>
        {canManage && (
          <>
            <button style={smallBtn} onClick={() => onEdit(c)}>Edit</button>
            <button style={{ ...smallBtn, color: 'var(--danger)' }} onClick={() => onDelete(c)}>Delete</button>
          </>
        )}
      </div>
      {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 12, color: 'var(--brand)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.url}</a>}
      {secret && (
        <div>
          {field('Username', secret.username)}
          {field('Password', secret.password)}
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8 }}>Hides automatically after 30 seconds.</div>
        </div>
      )}
    </div>
  );
}

function AccessLogModal({ projectId, onClose, showToast }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.fetchProjectCredentialLog(projectId).then(setRows).catch((e) => { showToast(e.message, 'error'); setRows([]); });
  }, [projectId, showToast]);
  return (
    <ModalShell onClose={onClose} title="Credential access log" subtitle="Latest 200 events. Only the project's managers can see this." maxWidth={560}>
      {rows === null ? (
        <SkeletonList rows={2} height={40} />
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Nothing yet.</div>
      ) : (
        rows.map((l) => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid var(--color-border-primary)', fontSize: 13 }}>
            <span style={{ minWidth: 0 }}><strong style={{ fontWeight: 600 }}>{l.userName}</strong> {LOG_ACTION[l.action] || l.action} <strong style={{ fontWeight: 600 }}>{l.label}</strong></span>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{fmtWhen(l.at)}</span>
          </div>
        ))
      )}
    </ModalShell>
  );
}

/* ---- the tab ---- */
export function ProjectInfoTab({ project, user, isMember, showToast }) {
  const canManage = managesProject(user, project);
  const canEdit = user.role !== 'Manager' && (canManage || isMember);
  const projectId = project.id;
  const [resources, setResources] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | missing
  const [resourceForm, setResourceForm] = useState(null); // { category, resource? }
  const [credentialForm, setCredentialForm] = useState(null); // 'new' | credential
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([api.fetchProjectResources(projectId), api.fetchProjectCredentials(projectId)]);
      if (r === null || c === null) { setState('missing'); return; }
      setResources(r);
      setCredentials(c);
      setState('ready');
    } catch (e) {
      showToast(e.message, 'error');
      setState('ready');
    }
  }, [projectId, showToast]);
  useEffect(() => { setState('loading'); load(); }, [load]);

  async function deleteResource(r) {
    if (!await confirmAction(`Delete "${r.title}"?${r.fileName ? ' Its file is deleted too.' : ''}`)) return;
    try {
      await api.deleteProjectResource(r);
      showToast('Deleted');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
  async function deleteCredential(c) {
    if (!await confirmAction(`Delete the "${c.label}" credential? This can't be undone. Change the password too if it's still in use.`)) return;
    try {
      await api.deleteProjectCredential(c.id);
      showToast('Credential deleted');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
  async function openFile(r) {
    // open first: browsers block a new tab that isn't a direct result of the click
    const win = window.open('', '_blank');
    try {
      const url = await api.getProjectFileUrl(r.filePath);
      if (win) { win.opener = null; win.location.href = url; } else window.location.href = url;
    } catch (e) {
      win?.close();
      showToast(e.message, 'error');
    }
  }

  if (state === 'loading') return <SkeletonList rows={2} height={40} />;
  if (state === 'missing') {
    return <div style={{ ...card, padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>Project information isn’t enabled yet. Run the project info migration on the database.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section
        title="Credentials"
        sub="Encrypted in the database. Only shown when someone reveals one, and every reveal is logged."
        action={canManage && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={smallBtn} onClick={() => setLogOpen(true)}>Access log</button>
            <button style={smallBtn} onClick={() => setCredentialForm('new')}>+ Add</button>
          </div>
        )}
      >
        {credentials.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border-primary)', paddingTop: 12 }}>
            {canManage ? 'No credentials yet.' : 'No credentials have been shared with you. Ask your Team Lead or Project Manager if you need access.'}
          </div>
        ) : (
          credentials.map((c) => (
            <CredentialRow key={c.id} c={c} canManage={canManage} showToast={showToast} onEdit={setCredentialForm} onDelete={deleteCredential} />
          ))
        )}
      </Section>

      <div style={{ columnWidth: 400, columnGap: 16 }}>
        {RESOURCE_SECTIONS.map(([key, title]) => {
          const rows = resources.filter((r) => r.category === key);
          return (
            <div key={key} style={{ breakInside: 'avoid', marginBottom: 16 }}>
              <Section title={title} action={canEdit && <button style={{ ...smallBtn, flexShrink: 0 }} onClick={() => setResourceForm({ category: key })}>+ Add</button>}>
                {rows.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border-primary)', paddingTop: 12 }}>Nothing added yet.</div>
                ) : (
                  rows.map((r) => (
                    <ResourceRow key={r.id} r={r} canEdit={canEdit} onEdit={(res) => setResourceForm({ category: key, resource: res })} onDelete={deleteResource} onOpenFile={openFile} />
                  ))
                )}
              </Section>
            </div>
          );
        })}
      </div>

      {resourceForm && (
        <ResourceModal
          projectId={projectId}
          category={resourceForm.category}
          resource={resourceForm.resource}
          userId={user.id}
          showToast={showToast}
          onSaved={load}
          onClose={() => setResourceForm(null)}
        />
      )}
      {credentialForm && (
        <CredentialModal
          projectId={projectId}
          credential={credentialForm === 'new' ? null : credentialForm}
          showToast={showToast}
          onSaved={load}
          onClose={() => setCredentialForm(null)}
        />
      )}
      {logOpen && <AccessLogModal projectId={projectId} showToast={showToast} onClose={() => setLogOpen(false)} />}
    </div>
  );
}
