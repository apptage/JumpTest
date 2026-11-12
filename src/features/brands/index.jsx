/* Brands — Admin page to create, edit and choose the brands shown to clients.
   Each project picks a brand (Manage Projects); projects without a pick, the
   sidebar and the sign-in page use the default brand. */
import { useState, useEffect } from 'react';
import * as api from '@/api.js';
import { card, inputStyle, labelStyle, ghostButton, primaryButton, ModalShell, confirmAction } from '@/ui.jsx';
import { Pill, StatSmall } from '@shared/dashboard-kit.jsx';
import { IconPlus } from '@/icons.jsx';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
const MAX_BYTES = 2 * 1024 * 1024; // matches the brand-assets bucket limit
// fixed colours: these previews show the logo on each background whatever the theme
const PREVIEW_BG = { light: '#FFFFFF', dark: '#14161C' };

function fileError(file) {
  if (!ACCEPT.split(',').includes(file.type)) return 'Use a PNG, JPG, WebP or SVG image.';
  if (file.size > MAX_BYTES) return 'Logos must be 2 MB or smaller.';
  return '';
}

function LogoPane({ src, alt, tone, height = 72, plate }) {
  return (
    <div style={{ flex: 1, minWidth: 0, height, padding: 12, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PREVIEW_BG[tone] }}>
      {src && <img src={src} alt={alt} style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', ...(plate ? { background: '#fff', borderRadius: 6, padding: '4px 8px', boxSizing: 'border-box' } : null) }} />}
    </div>
  );
}

function ImagePicker({ label, hint, previewUrl, tone, onPick, onClear, error }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ width: 150, flexShrink: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--color-border-primary)', display: 'flex' }}>
          <LogoPane src={previewUrl} alt={`${label} preview`} tone={tone} height={60} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8, lineHeight: 1.4 }}>{hint}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ ...ghostButton, display: 'inline-flex', alignItems: 'center', padding: '4px 12px', minHeight: 0, fontSize: 12, cursor: 'pointer' }}>
              {previewUrl ? 'Replace' : 'Choose file'}
              <input
                type="file"
                accept={ACCEPT}
                aria-label={label}
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }}
              />
            </label>
            {previewUrl && onClear && (
              <button type="button" style={{ ...ghostButton, padding: '4px 12px', minHeight: 0, fontSize: 12 }} onClick={onClear}>Remove</button>
            )}
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

const SLOTS = [
  { key: 'logo', col: 'logo_url', field: 'logoUrl', label: 'Logo for light backgrounds', hint: 'Required. Used everywhere the page is light.', tone: 'light' },
  { key: 'dark', col: 'logo_dark_url', field: 'logoDarkUrl', label: 'Logo for dark backgrounds', hint: 'Optional. Without it, dark mode shows the logo on a white plate.', tone: 'dark', optional: true },
  { key: 'mark', col: 'mark_url', field: 'markUrl', label: 'Square icon', hint: 'Optional. Used in the collapsed sidebar; otherwise the first letter is shown.', tone: 'light', optional: true },
];

function BrandForm({ brand, isFirst, userId, onClose, onSaved, showToast }) {
  const [name, setName] = useState(brand?.name || '');
  const [urls, setUrls] = useState({ logo: brand?.logoUrl || null, dark: brand?.logoDarkUrl || null, mark: brand?.markUrl || null });
  const [files, setFiles] = useState({});
  const [errors, setErrors] = useState({});
  const [previews, setPreviews] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = {};
    Object.entries(files).forEach(([k, f]) => { next[k] = URL.createObjectURL(f); });
    setPreviews(next);
    return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const invalid = !name.trim() || !(urls.logo || files.logo);

  function pick(key, file) {
    const err = fileError(file);
    setErrors((e) => ({ ...e, [key]: err }));
    if (!err) setFiles((f) => ({ ...f, [key]: file }));
  }
  function clear(key) {
    setFiles((f) => { const n = { ...f }; delete n[key]; return n; });
    setUrls((u) => ({ ...u, [key]: null }));
  }

  async function save() {
    if (invalid || saving) return;
    setSaving(true);
    try {
      const row = { name: name.trim() };
      for (const s of SLOTS) {
        row[s.col] = files[s.key] ? await api.uploadBrandAsset(files[s.key]) : urls[s.key];
      }
      if (brand) await api.updateBrand(brand.id, row);
      else await api.createBrand({ ...row, is_default: isFirst, created_by: userId });
      showToast(brand ? 'Brand updated' : 'Brand created');
      onSaved();
      onClose();
    } catch (e) {
      // the name's unique index is the one error an admin can act on directly
      showToast(e.code === '23505' ? 'A brand with this name already exists.' : e.message, 'error');
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title={brand ? `Edit ${brand.name}` : 'New brand'} maxWidth={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="brand-name">Name</label>
          <input
            id="brand-name"
            style={inputStyle}
            value={name}
            autoFocus
            placeholder="e.g. Apptage"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {SLOTS.map((s) => (
          <ImagePicker
            key={s.key}
            label={s.label}
            hint={s.hint}
            tone={s.tone}
            previewUrl={previews[s.key] || urls[s.key]}
            error={errors[s.key]}
            onPick={(f) => pick(s.key, f)}
            onClear={s.optional ? () => clear(s.key) : null}
          />
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={ghostButton} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={primaryButton(invalid || saving)} disabled={invalid || saving} onClick={save}>
            {saving ? 'Saving…' : brand ? 'Save' : 'Create brand'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function BrandsTab({ brands, projects, userId, showToast, onChanged, onProjectsChanged }) {
  const [form, setForm] = useState(null); // null | 'new' | brand
  const [busyId, setBusyId] = useState(null);

  const usage = (id) => projects.filter((p) => p.brandId === id).length;
  const usingDefault = projects.filter((p) => !p.brandId).length;

  async function act(id, fn, done) {
    setBusyId(id);
    try {
      await fn();
      showToast(done);
      onChanged();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(b) {
    const n = usage(b.id);
    const moved = n ? ` ${n} project${n === 1 ? '' : 's'} will switch to the default brand.` : '';
    if (!await confirmAction(`Delete ${b.name}?${moved}`)) return;
    act(b.id, async () => {
      await api.deleteBrand(b.id);
      onProjectsChanged(); // brand_id on its projects was cleared
    }, 'Brand deleted');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stat-row">
        <StatSmall label="Brands" value={brands.length} />
        <StatSmall label="Projects with their own brand" value={projects.length - usingDefault} />
        <StatSmall label="Projects on the default brand" value={usingDefault} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Choose a project’s brand under Manage Projects. The default also appears on the sidebar and sign-in page.
        </span>
        <button style={{ ...primaryButton(false), display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={() => setForm('new')}>
          <IconPlus size={14} /> New brand
        </button>
      </div>

      {brands.length === 0 ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          No brands yet — create your first one.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          {brands.map((b) => {
            const n = usage(b.id) + (b.isDefault ? usingDefault : 0);
            const busy = busyId === b.id;
            return (
              <div key={b.id} className="mgr-card" style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-primary)' }}>
                  <LogoPane src={b.logoUrl} alt={`${b.name} on a light background`} tone="light" />
                  <LogoPane src={b.logoDarkUrl || b.logoUrl} alt={`${b.name} on a dark background`} tone="dark" plate={!b.logoDarkUrl} />
                </div>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    {b.isDefault && <Pill label="Default" tone="success" />}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Shown on {n} project{n === 1 ? '' : 's'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--color-border-primary)', paddingTop: 12 }}>
                    <button style={{ ...ghostButton, flex: 1, padding: '8px 12px', minHeight: 0, fontSize: 12 }} onClick={() => setForm(b)} disabled={busy}>Edit</button>
                    {!b.isDefault && (
                      <>
                        <button style={{ ...ghostButton, flex: 1.4, padding: '8px 12px', minHeight: 0, fontSize: 12 }} onClick={() => act(b.id, () => api.setDefaultBrand(b.id), `${b.name} is now the default`)} disabled={busy}>Make default</button>
                        <button style={{ ...ghostButton, flex: 1, padding: '8px 12px', minHeight: 0, fontSize: 12, color: 'var(--danger)' }} onClick={() => remove(b)} disabled={busy}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <BrandForm
          brand={form === 'new' ? null : form}
          isFirst={brands.length === 0}
          userId={userId}
          showToast={showToast}
          onSaved={onChanged}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
