/* Releases + Bugs feature — submit/edit/detail modals, the release detail tabs
   (details / bugs / comments / checklist), and bug threads.
   Moved verbatim out of ReleaseTracker.jsx (Phase 0 mechanical split). */
import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/api.js';
import {
  card,
  inputStyle,
  labelStyle,
  ghostButton,
  primaryButton,
  ModalShell,
  StatusBadge,
  BugStatusBadge,
  SeverityBadge,
  Avatar,
  CountBadge,
  TypeBadge,
  Info,
} from '@/ui.jsx';
import { Field, sideHead, TagChip, SlaBadge, statusSince } from '@shared/ui-kit.jsx';
import { BugActions, ProposedCloseBanner } from '@shared/bug-actions.jsx';
import {
  STATUSES,
  nextStatuses,
  TRANSITION_LABELS,
  isReadOnly,
  SEVERITIES,
  SEVERITY_ORDER,
  BUG_STATUSES,
  BUG_TAGS,
  BUG_FEATURES,
  RELEASE_TYPES,
  RELEASE_TYPE_ORDER,
  RELEASE_COMPONENTS,
  ENVIRONMENTS,
  RELEASE_TYPES_BY_PLATFORM,
  platformsForProjectType,
  platformForReleaseType,
  projectTypeLabel,
  WBS_TRACKS,
  EDIT_WINDOW_HOURS,
  withinEditWindow,
  linkIssue,
  slaLevel,
  bugSlaLevel,
  humanizeSince,
} from '@/constants.js';
import { IconDownload, IconExternal } from '@/icons.jsx';

export function SubmitModal({ projects, sentBackReleases = [], bugs = [], isSubmitting, onClose, onSubmit }) {
  const projectById = (id) => projects.find((x) => x.id === id);
  const firstProject = projects[0];
  const initPlatform = firstProject
    ? platformsForProjectType(firstProject.type)[0]
    : 'Mobile';

  const [form, setForm] = useState({
    projectId: firstProject ? firstProject.id : '',
    platform: initPlatform,
    version: '',
    releaseType: RELEASE_TYPES_BY_PLATFORM[initPlatform][0],
    environment: 'Production',
    component: 'Web Application',
    componentOther: '',
    linkUrl: '',
    releaseNotes: '',
    track: 'both',
    additionalNote: '',
    wbsPlatformId: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const [wbsPlatforms, setWbsPlatforms] = useState([]);
  const [wbsTasks, setWbsTasks] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]); // task ids

  const project = projectById(form.projectId);
  const isWbs = !!project?.wbsEnabled;

  // load the project's WBS platforms; default to the first one
  useEffect(() => {
    let cancelled = false;
    setSelectedTasks([]);
    setWbsTasks([]);
    if (!project?.wbsEnabled) {
      setWbsPlatforms([]);
      setForm((f) => ({ ...f, wbsPlatformId: '' }));
      return;
    }
    api
      .fetchWbsPlatforms(project.id)
      .then((pl) => {
        if (cancelled) return;
        setWbsPlatforms(pl);
        setForm((f) => ({ ...f, wbsPlatformId: pl[0]?.id || '' }));
      })
      .catch(() => !cancelled && setWbsPlatforms([]));
    return () => {
      cancelled = true;
    };
  }, [project?.id, project?.wbsEnabled]);

  // load selectable tasks for the chosen platform
  useEffect(() => {
    let cancelled = false;
    setSelectedTasks([]);
    if (!isWbs || !form.wbsPlatformId) {
      setWbsTasks([]);
      return;
    }
    api
      .fetchWbsTasksForPlatform(project.id, form.wbsPlatformId)
      .then((ts) => {
        if (cancelled) return;
        // selectable: non-milestone tasks not already fully sent to QA / complete
        setWbsTasks(
          ts.filter(
            (t) =>
              t.type !== 'milestone' &&
              !(
                ['in_qa', 'complete'].includes(t.backendStatus) &&
                ['in_qa', 'complete'].includes(t.frontendStatus)
              )
          )
        );
      })
      .catch(() => !cancelled && setWbsTasks([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWbs, form.wbsPlatformId, project?.id]);

  const toggleTask = (id) =>
    setSelectedTasks((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const platforms = project ? platformsForProjectType(project.type) : ['Mobile'];
  const allowedTypes = RELEASE_TYPES_BY_PLATFORM[form.platform] || RELEASE_TYPE_ORDER;
  const linkErr = linkIssue(form.linkUrl);
  const linkLabel =
    form.releaseType === 'apk'
      ? 'APK download link'
      : form.releaseType === 'testflight'
      ? 'TestFlight link'
      : 'Web link';

  function selectProject(id) {
    const p = projectById(id);
    const plats = p ? platformsForProjectType(p.type) : ['Mobile'];
    const platform = plats[0];
    setForm((f) => ({
      ...f,
      projectId: id,
      platform,
      releaseType: RELEASE_TYPES_BY_PLATFORM[platform][0],
    }));
  }

  function selectPlatform(platform) {
    setForm((f) => ({
      ...f,
      platform,
      releaseType: RELEASE_TYPES_BY_PLATFORM[platform][0],
    }));
  }

  // the component value actually stored on a release (web only; '' for mobile)
  const resolvedComponent =
    form.platform === 'Web'
      ? form.component === 'Other'
        ? form.componentOther.trim()
        : form.component
      : '';

  // follow-up detection: open sent-back cycles for this project on the same
  // stream. Mobile = one stream (APK + TestFlight). Web = one stream PER
  // component (Web App / Admin Dashboard / Landing Page / Other), so a web
  // follow-up only supersedes priors of the same component.
  const priorSentBackList = sentBackReleases.filter(
    (r) =>
      r.projectId === form.projectId &&
      r.platform === form.platform &&
      (form.platform !== 'Web' || (r.component || '') === resolvedComponent)
  );
  const priorSentBack = priorSentBackList[0] || null;
  const priorOpenBugs = priorSentBackList.reduce(
    (n, r) => n + bugs.filter((b) => b.releaseId === r.id && b.status !== 'verified').length,
    0
  );
  const priorVersions = priorSentBackList.map((r) => `v${r.version}`).join(', ');

  // A WBS project with prior sent-back cycle(s) may be submitted as a
  // bug-fix-only release (no WBS task selection required).
  const bugFixEligible = isWbs && priorSentBackList.length > 0;
  const isWeb = form.platform === 'Web';
  const componentBad =
    isWeb && form.component === 'Other' && !form.componentOther.trim();
  const invalid =
    !form.projectId ||
    !form.version.trim() ||
    componentBad ||
    !!linkErr ||
    (isWbs
      ? !form.wbsPlatformId || (!bugFixEligible && selectedTasks.length === 0) // platform required; feature release needs ≥1 task
      : !form.releaseNotes.trim());

  function submit() {
    if (invalid) return;
    const picked = isWbs
      ? wbsTasks.filter((t) => selectedTasks.includes(t.id)).map((t) => ({ id: t.id, name: t.name }))
      : [];
    onSubmit({ ...form, component: resolvedComponent, wbsTasks: picked });
  }

  if (projects.length === 0) {
    return (
      <ModalShell onClose={onClose} title="Submit release">
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          No projects exist yet. Ask an admin to create a project first.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button style={ghostButton} onClick={onClose}>
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title="Submit release">
      <Field label="Project">
        <select
          style={inputStyle}
          value={form.projectId}
          onChange={(e) => selectProject(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({projectTypeLabel(p.type)})
            </option>
          ))}
        </select>
      </Field>

      {priorSentBack && (
        <div
          style={{
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--warning)',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
          }}
        >
          You have {priorSentBackList.length} open {isWeb ? resolvedComponent : form.platform} QA cycle
          {priorSentBackList.length === 1 ? '' : 's'} (<strong>{priorVersions}</strong>) with {priorOpenBugs} unresolved
          bug{priorOpenBugs === 1 ? '' : 's'}. Submitting closes {priorSentBackList.length === 1 ? 'it' : 'them all'} and
          carries every unresolved &amp; fixed-pending-verification bug into this new release.
        </div>
      )}

      {platforms.length > 1 && (
        <Field label="Platform">
          <div style={{ display: 'flex', gap: 8 }}>
            {platforms.map((pl) => {
              const active = form.platform === pl;
              return (
                <button
                  key={pl}
                  onClick={() => selectPlatform(pl)}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 'var(--r-input)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: active ? '#fff' : 'var(--color-text-primary)',
                    background: active ? 'var(--brand)' : 'var(--color-background-primary)',
                    border: `1px solid ${active ? 'var(--brand)' : 'var(--color-border-tertiary)'}`,
                  }}
                >
                  {pl}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Version">
            <input
              style={inputStyle}
              value={form.version}
              placeholder="e.g. 2.4.3"
              onChange={(e) => set('version', e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Environment">
            <select
              style={inputStyle}
              value={form.environment}
              onChange={(e) => set('environment', e.target.value)}
            >
              {ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>
                  {env}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <Field label="Release type">
        <select
          style={inputStyle}
          value={form.releaseType}
          onChange={(e) => set('releaseType', e.target.value)}
        >
          {allowedTypes.map((t) => (
            <option key={t} value={t}>
              {RELEASE_TYPES[t].label}
            </option>
          ))}
        </select>
      </Field>

      {isWeb && (
        <Field label="Component">
          <select style={inputStyle} value={form.component} onChange={(e) => set('component', e.target.value)}>
            {RELEASE_COMPONENTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {form.component === 'Other' && (
            <input
              style={{ ...inputStyle, marginTop: 8 }}
              value={form.componentOther}
              placeholder="Custom component name"
              onChange={(e) => set('componentOther', e.target.value)}
            />
          )}
        </Field>
      )}

      <Field label={linkLabel}>
        <input
          style={{
            ...inputStyle,
            borderColor:
              form.linkUrl && linkErr ? '#dc2626' : 'var(--color-border-tertiary)',
          }}
          value={form.linkUrl}
          placeholder={
            form.releaseType === 'apk'
              ? 'https://drive.google.com/…  ·  Play Console  ·  S3'
              : 'https://…'
          }
          onChange={(e) => set('linkUrl', e.target.value)}
        />
        <div style={{ fontSize: 11, marginTop: 5, minHeight: 14, color: 'var(--color-text-tertiary)' }}>
          {form.linkUrl && linkErr ? (
            <span style={{ color: '#dc2626' }}>{linkErr}</span>
          ) : form.releaseType === 'apk' ? (
            'Paste a permanent download link — WeTransfer and other expiring links are not allowed.'
          ) : (
            ''
          )}
        </div>
      </Field>

      {isWbs ? (
        <>
          <Field label="WBS platform">
            <select style={inputStyle} value={form.wbsPlatformId} onChange={(e) => set('wbsPlatformId', e.target.value)}>
              {wbsPlatforms.length === 0 && <option value="">No WBS platforms</option>}
              {wbsPlatforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 5 }}>
              This release targets one platform — only its tasks are shown, and QA/completion are tracked for it.
            </div>
          </Field>
          <Field label="QA should verify">
            <div style={{ display: 'flex', gap: 8 }}>
              {WBS_TRACKS.map((t) => {
                const active = form.track === t;
                return (
                  <button
                    key={t}
                    onClick={() => set('track', t)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      borderRadius: 'var(--r-input)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: active ? '#fff' : 'var(--color-text-primary)',
                      background: active ? 'var(--brand)' : 'var(--color-background-primary)',
                      border: `1px solid ${active ? 'var(--brand)' : 'var(--color-border-tertiary)'}`,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            label={`WBS tasks (${selectedTasks.length} selected)${bugFixEligible ? ' — optional' : ''}`}
          >
            {bugFixEligible && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                  marginBottom: 8,
                  lineHeight: 1.5,
                }}
              >
                Leave empty for a <strong>bug-fix release</strong> (only fixes carried from v
                {priorSentBack.version}). Select tasks only if this build also completes new WBS work.
              </div>
            )}
            {wbsTasks.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {bugFixEligible
                  ? 'No feature tasks available — submit as a bug-fix release.'
                  : 'No available tasks — all are already in QA or complete.'}
              </div>
            ) : (
              <div
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  border: '1px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--r-input)',
                  padding: 4,
                }}
              >
                {wbsTasks.map((t) => (
                  <label
                    key={t.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: 12.5 }}
                  >
                    <input type="checkbox" checked={selectedTasks.includes(t.id)} onChange={() => toggleTask(t.id)} />
                    <span style={{ flex: 1 }}>{t.name}</span>
                    {t.section && (
                      <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>{t.section}</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </Field>

          <Field label="Additional note (optional)">
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              rows={2}
              value={form.additionalNote}
              placeholder="Anything QA should know beyond the task list…"
              onChange={(e) => set('additionalNote', e.target.value)}
            />
          </Field>
        </>
      ) : (
        <Field label="Release notes">
          <textarea
            style={{ ...inputStyle, resize: 'vertical' }}
            rows={4}
            value={form.releaseNotes}
            placeholder="What changed in this release?"
            onChange={(e) => set('releaseNotes', e.target.value)}
          />
        </Field>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={ghostButton} onClick={onClose}>
          Cancel
        </button>
        <button
          style={primaryButton(invalid || isSubmitting)}
          disabled={invalid || isSubmitting}
          onClick={submit}
        >
          {isSubmitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </ModalShell>
  );
}

export function EditReleaseModal({ release, project, isSubmitting, onClose, onSave }) {
  const allowedTypes = RELEASE_TYPES_BY_PLATFORM[release.platform] || RELEASE_TYPE_ORDER;
  const [form, setForm] = useState({
    version: release.version,
    environment: release.environment || 'Production',
    releaseType: release.releaseType,
    linkUrl: release.linkUrl || '',
    releaseNotes: release.releaseNotes || '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const linkErr = linkIssue(form.linkUrl);
  const invalid = !form.version.trim() || !form.releaseNotes.trim() || !!linkErr;
  const linkLabel =
    form.releaseType === 'apk'
      ? 'APK download link'
      : form.releaseType === 'testflight'
      ? 'TestFlight link'
      : 'Web link';

  function save() {
    if (invalid) return;
    onSave({
      version: form.version.trim(),
      environment: form.environment,
      release_type: form.releaseType,
      link_url: form.linkUrl.trim(),
      release_notes: form.releaseNotes.trim(),
    });
  }

  return (
    <ModalShell onClose={onClose} title="Edit release">
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
        {project ? project.name : 'Project'} · {release.platform} · v{release.version}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Version">
            <input style={inputStyle} value={form.version} onChange={(e) => set('version', e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Environment">
            <select style={inputStyle} value={form.environment} onChange={(e) => set('environment', e.target.value)}>
              {ENVIRONMENTS.map((env) => (
                <option key={env} value={env}>
                  {env}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <Field label="Release type">
        <select style={inputStyle} value={form.releaseType} onChange={(e) => set('releaseType', e.target.value)}>
          {allowedTypes.map((t) => (
            <option key={t} value={t}>
              {RELEASE_TYPES[t].label}
            </option>
          ))}
        </select>
      </Field>

      <Field label={linkLabel}>
        <input
          style={{
            ...inputStyle,
            borderColor: form.linkUrl && linkErr ? '#dc2626' : 'var(--color-border-tertiary)',
          }}
          value={form.linkUrl}
          placeholder="https://…"
          onChange={(e) => set('linkUrl', e.target.value)}
        />
        {form.linkUrl && linkErr && (
          <div style={{ fontSize: 11, marginTop: 5, color: '#dc2626' }}>{linkErr}</div>
        )}
      </Field>

      <Field label="Release notes">
        <textarea
          style={{ ...inputStyle, resize: 'vertical' }}
          rows={4}
          value={form.releaseNotes}
          onChange={(e) => set('releaseNotes', e.target.value)}
        />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={ghostButton} onClick={onClose}>
          Cancel
        </button>
        <button style={primaryButton(invalid || isSubmitting)} disabled={invalid || isSubmitting} onClick={save}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ================================================================== */
/* Detail modal (tabs: Details / Bugs / Comments / Checklist)         */
/* ================================================================== */

export function DetailModal({
  release,
  project,
  user,
  isManager,
  profiles,
  profilesById,
  projectMembers,
  bugs,
  supersedesRelease,
  supersededByRelease,
  checklistItems,
  isSubmitting,
  showToast,
  onClose,
  onStatusUpdate,
  onSaveNote,
  onAssignQa,
  onDelete,
  onEdit,
  onAddBug,
  onBugStatus,
  onBugResolve,
  onBugCloseReview,
  onDeleteBug,
  onAddComment,
  onDeleteComment,
}) {
  const [tab, setTab] = useState('details');
  const [note, setNote] = useState(release.qaNote || '');
  const [checks, setChecks] = useState({}); // item_id -> checked

  // a "manager" (Admin anywhere, or Team Lead in their own team) gets full rights
  const isQA = user.role === 'QA' || isManager;
  const canDoQA =
    isManager ||
    (user.role === 'QA' &&
      (!release.assignedQa || release.assignedQa === user.id));
  // developers may edit/delete their own release only within the 8h window
  const isOwner =
    release.submittedById === user.id || release.submittedBy === user.name;
  const ownerWindow = isOwner && withinEditWindow(release);
  const readOnly = isReadOnly(release);
  const canEdit = !readOnly && (isManager || ownerWindow);
  const canDelete = !readOnly && (isManager || ownerWindow);
  const ownerLocked = isOwner && !isManager && !withinEditWindow(release);

  const loadChecks = useCallback(async () => {
    try {
      const rows = await api.fetchReleaseChecklist(release.id);
      const m = {};
      rows.forEach((r) => (m[r.item_id] = r.checked));
      setChecks(m);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }, [release.id, showToast]);

  useEffect(() => {
    loadChecks();
  }, [loadChecks]);

  const allChecked =
    checklistItems.length > 0 &&
    checklistItems.every((it) => checks[it.id]);

  function attemptStatus(newStatus) {
    if (newStatus === 'approved') {
      const blocking = bugs.filter(
        (b) => b.status !== 'verified' && (b.severity === 'critical' || b.severity === 'major')
      ).length;
      if (blocking > 0) {
        showToast(
          `Cannot approve — ${blocking} unresolved Major/Critical bug${blocking === 1 ? '' : 's'} must be verified first.`,
          'error'
        );
        setTab('bugs');
        return;
      }
      if (checklistItems.length > 0 && !allChecked) {
        showToast('Complete the checklist before approving', 'error');
        setTab('checklist');
        return;
      }
    }
    onStatusUpdate(release, newStatus, note);
  }

  async function toggleCheck(itemId, checked) {
    setChecks((c) => ({ ...c, [itemId]: checked }));
    try {
      await api.setReleaseCheck(release.id, itemId, checked);
    } catch (e) {
      showToast(e.message, 'error');
      loadChecks();
    }
  }

  const openBugs = bugs.filter((b) => b.status === 'open').length;
  // QA testers assignable to this release: QA role only (never Admin),
  // limited to the release's project team.
  // QA testers assignable to this release = active QA members of the project
  // (home members + temporary support QAs), never Admins.
  const projectQaIds = new Set(
    (projectMembers || [])
      .filter(
        (m) =>
          m.projectId === release.projectId &&
          api.membershipActive(m) &&
          (m.projectRole === 'qa' || profilesById[m.userId]?.role === 'QA')
      )
      .map((m) => m.userId)
  );
  const qaList = profiles.filter((p) => p.role === 'QA' && projectQaIds.has(p.id));

  const tabBtn = (key, label, badge) => (
    <div
      onClick={() => setTab(key)}
      style={{
        padding: '8px 12px',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: tab === key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        borderBottom: `2px solid ${tab === key ? 'var(--brand)' : 'transparent'}`,
      }}
    >
      {label}
      {badge ? badge : null}
    </div>
  );

  return (
    <ModalShell onClose={onClose} maxWidth={560}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <TypeBadge type={release.releaseType} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600 }}>
          v{release.version}
        </span>
        <StatusBadge status={release.status} />
        {project && (
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {project.name}
          </span>
        )}
      </div>

      {/* tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          borderBottom: '0.5px solid var(--color-border-primary)',
        }}
      >
        {tabBtn('details', 'Details')}
        {tabBtn(
          'bugs',
          'Bugs',
          bugs.length ? <CountBadge count={openBugs || bugs.length} color={openBugs ? '#dc2626' : '#64748b'} /> : null
        )}
        {tabBtn('comments', 'Comments')}
        {checklistItems.length > 0 && tabBtn('checklist', 'Checklist')}
      </div>

      {tab === 'details' && (
        <DetailsTab
          release={release}
          supersedesRelease={supersedesRelease}
          supersededByRelease={supersededByRelease}
          bugCount={bugs.length}
          openBugCount={openBugs}
          note={note}
          setNote={setNote}
          isQA={isQA}
          canDoQA={canDoQA}
          canDelete={canDelete}
          canEdit={canEdit}
          ownerLocked={ownerLocked}
          isAdmin={isManager}
          qaList={qaList}
          profilesById={profilesById}
          isSubmitting={isSubmitting}
          onAttemptStatus={attemptStatus}
          onSaveNote={() => onSaveNote(release, note)}
          onAssignQa={(id) => onAssignQa(release, id)}
          onDelete={() => onDelete(release)}
          onEdit={() => onEdit(release)}
        />
      )}

      {tab === 'bugs' && (
        <BugsTab
          release={release}
          bugs={bugs}
          user={user}
          isQA={isQA}
          profiles={profiles}
          projectTeamId={project?.teamId}
          wbsEnabled={!!project?.wbsEnabled}
          showToast={showToast}
          isSubmitting={isSubmitting}
          onAddBug={onAddBug}
          onBugStatus={onBugStatus}
          onBugResolve={onBugResolve}
          onBugCloseReview={onBugCloseReview}
          onDeleteBug={onDeleteBug}
        />
      )}

      {tab === 'comments' && (
        <CommentsTab
          release={release}
          user={user}
          showToast={showToast}
          onAddComment={onAddComment}
          onDeleteComment={onDeleteComment}
        />
      )}

      {tab === 'checklist' && (
        <ChecklistTab
          items={checklistItems}
          checks={checks}
          canEdit={canDoQA}
          onToggle={toggleCheck}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <button style={ghostButton} onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function DetailsTab({
  release,
  supersedesRelease,
  supersededByRelease,
  bugCount = 0,
  openBugCount = 0,
  note,
  setNote,
  isQA,
  canDoQA,
  canDelete,
  canEdit,
  ownerLocked,
  isAdmin,
  qaList,
  profilesById,
  isSubmitting,
  onAttemptStatus,
  onSaveNote,
  onAssignQa,
  onDelete,
  onEdit,
}) {
  const assigned = release.assignedQa ? profilesById[release.assignedQa] : null;
  const soleQa = qaList.length === 1 ? qaList[0] : null;
  const autoAssignedRef = useRef(null);
  const [linkedTasks, setLinkedTasks] = useState([]);
  const [wbsPlatformName, setWbsPlatformName] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .fetchReleaseTasks(release.id)
      .then((t) => !cancelled && setLinkedTasks(t))
      .catch(() => {});
    if (release.wbsPlatformId && release.projectId) {
      api
        .fetchWbsPlatforms(release.projectId)
        .then((pl) => !cancelled && setWbsPlatformName(pl.find((p) => p.id === release.wbsPlatformId)?.name || ''))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [release.id, release.wbsPlatformId, release.projectId]);

  // one QA on the team → auto-assign, no selection dialog
  useEffect(() => {
    if (
      isAdmin &&
      soleQa &&
      release.assignedQa !== soleQa.id &&
      autoAssignedRef.current !== release.id
    ) {
      autoAssignedRef.current = release.id;
      onAssignQa(soleQa.id);
    }
  }, [isAdmin, soleQa, release.assignedQa, release.id, onAssignQa]);

  return (
    <>
      {(supersedesRelease || supersededByRelease) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 12,
            fontSize: 11.5,
            color: 'var(--color-text-secondary)',
          }}
        >
          {supersedesRelease && (
            <span style={{ padding: '3px 9px', borderRadius: 999, background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)' }}>
              ↩ Supersedes v{supersedesRelease.version}
            </span>
          )}
          {supersededByRelease && (
            <span style={{ padding: '3px 9px', borderRadius: 999, background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)' }}>
              ↪ Superseded by v{supersededByRelease.version}
            </span>
          )}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          padding: 14,
          background: 'var(--color-background-secondary)',
          border: '0.5px solid var(--color-border-primary)',
          borderRadius: 10,
          marginBottom: 14,
        }}
      >
        <Info label="Platform" value={release.platform} />
        <Info label="Environment" value={release.environment || 'Production'} />
        {release.component && <Info label="Component" value={release.component} />}
        <Info label="Date" value={release.date} />
        <Info label="Submitted by" value={release.submittedBy} />
        <Info label="Assigned QA" value={assigned ? assigned.name : '—'} />
        <Info
          label="Time in status"
          value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <SlaBadge level={slaLevel(release.status, statusSince(release))} />
              {humanizeSince(statusSince(release))} in {STATUSES[release.status]?.label}
            </span>
          }
        />
      </div>

      {/* artifact */}
      {(release.fileUrl || release.linkUrl) && (
        <div style={{ marginBottom: 14 }}>
          <a
            href={release.fileUrl || release.linkUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              ...ghostButton,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              textDecoration: 'none',
            }}
          >
            {release.releaseType === 'apk' ? (
              <>
                <IconDownload size={15} /> Download APK
              </>
            ) : (
              <>
                <IconExternal size={15} /> Open link
              </>
            )}
          </a>
        </div>
      )}

      {linkedTasks.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
            borderRadius: 'var(--r-card)',
          }}
        >
          <div style={{ ...labelStyle, marginBottom: 8 }}>
            {wbsPlatformName ? `${wbsPlatformName} · ` : ''}Linked WBS tasks · verify {linkedTasks[0]?.track}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {linkedTasks.map((t) => (
              <div key={t.id} style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--brand)' }} />
                {t.taskName}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={labelStyle}>Release notes</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {release.releaseNotes || '—'}
        </div>
      </div>

      {/* QA tester assignment (managers only) */}
      {isAdmin && (
        <div
          style={{
            borderTop: '0.5px solid var(--color-border-primary)',
            paddingTop: 14,
            marginBottom: 14,
          }}
        >
          <label style={labelStyle}>Assign QA tester</label>
          {qaList.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              No QA testers on this team yet.
            </div>
          ) : qaList.length === 1 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 11px',
                background: 'var(--color-background-secondary)',
                border: '1px solid var(--color-border-tertiary)',
                borderRadius: 'var(--r-input)',
              }}
            >
              <Avatar name={qaList[0].name} size={26} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{qaList[0].name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  Auto-assigned — only QA tester on this team
                </div>
              </div>
            </div>
          ) : (
            <select
              style={inputStyle}
              value={release.assignedQa || ''}
              disabled={isSubmitting}
              onChange={(e) => onAssignQa(e.target.value)}
            >
              <option value="">Anyone (unassigned)</option>
              {qaList.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* QA actions */}
      {isQA && (
        <div
          style={{
            borderTop: '0.5px solid var(--color-border-primary)',
            paddingTop: 14,
            marginBottom: 6,
          }}
        >
          <div style={{ ...labelStyle, marginBottom: 8 }}>QA Actions</div>
          {!canDoQA && (
            <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>
              This release is assigned to another tester.
            </div>
          )}
          {/* current stage + bug summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <StatusBadge status={release.status} />
            <span style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
              {bugCount} bug{bugCount === 1 ? '' : 's'} reported
              {openBugCount ? ` · ${openBugCount} open` : ''}
            </span>
          </div>
          {/* contextual next-step actions (enforced transitions) */}
          {(() => {
            const steps = isReadOnly(release) ? [] : nextStatuses(release.status);
            if (isReadOnly(release))
              return (
                <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
                  This release is closed (superseded) and read-only.
                </div>
              );
            if (steps.length === 0)
              return (
                <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
                  {release.status === 'approved'
                    ? 'Approved — no further QA action.'
                    : release.status === 'sent_back'
                      ? 'Sent back to the developer. A follow-up release will supersede this one.'
                      : 'No actions available.'}
                </div>
              );
            return (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {steps.map((key) => {
                  const c = STATUSES[key].color;
                  return (
                    <button
                      key={key}
                      disabled={isSubmitting || !canDoQA}
                      onClick={() => onAttemptStatus(key)}
                      style={{
                        flex: 1,
                        minWidth: 130,
                        padding: '10px 12px',
                        fontSize: 12.5,
                        fontWeight: 600,
                        borderRadius: 10,
                        cursor: isSubmitting || !canDoQA ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                        opacity: canDoQA ? 1 : 0.5,
                        color: '#fff',
                        background: c,
                        border: `0.5px solid ${c}`,
                      }}
                    >
                      {TRANSITION_LABELS[key] || STATUSES[key].label}
                    </button>
                  );
                })}
              </div>
            );
          })()}
          <label style={labelStyle}>QA note (optional)</label>
          <textarea
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }}
            rows={3}
            value={note}
            disabled={!canDoQA}
            placeholder="Add a note…"
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={ghostButton} disabled={isSubmitting || !canDoQA} onClick={onSaveNote}>
            {isSubmitting ? 'Saving…' : 'Save note'}
          </button>
        </div>
      )}

      {!isQA && release.qaNote && (
        <div
          style={{
            borderTop: '0.5px solid var(--color-border-primary)',
            paddingTop: 14,
          }}
        >
          <div style={labelStyle}>QA note</div>
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-primary)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {release.qaNote}
          </div>
        </div>
      )}

      {(canEdit || canDelete || ownerLocked) && (
        <div
          style={{
            borderTop: '0.5px solid var(--color-border-primary)',
            paddingTop: 14,
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {canEdit && (
            <button style={ghostButton} disabled={isSubmitting} onClick={onEdit}>
              Edit release
            </button>
          )}
          {canDelete && (
            <button
              disabled={isSubmitting}
              onClick={onDelete}
              style={{ ...ghostButton, color: '#dc2626', borderColor: '#dc262644' }}
            >
              Delete release
            </button>
          )}
          {ownerLocked && (
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Editing closed — releases can only be changed within{' '}
              {EDIT_WINDOW_HOURS}h of submission.
            </span>
          )}
        </div>
      )}
    </>
  );
}

/* ---------- Bugs tab ---------- */

function BugsTab({
  release,
  bugs,
  user,
  isQA,
  profiles,
  projectTeamId,
  wbsEnabled,
  showToast,
  isSubmitting,
  onAddBug,
  onBugStatus,
  onBugResolve,
  onBugCloseReview,
  onDeleteBug,
}) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    severity: 'major',
    feature: '',
    tags: [],
    wbsTaskId: '',
  });
  const [file, setFile] = useState(null);
  const [commentCounts, setCommentCounts] = useState({});
  const [releaseTasks, setReleaseTasks] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleTag = (t) =>
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
    }));

  // WBS-enabled: QA reports against the release's linked WBS tasks
  useEffect(() => {
    if (!wbsEnabled) return;
    let cancelled = false;
    api
      .fetchReleaseTasks(release.id)
      .then((t) => !cancelled && setReleaseTasks(t.filter((x) => x.taskId)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wbsEnabled, release.id]);

  const isDev = user.role === 'Developer' || user.role === 'Admin';
  // only a Team Lead / Admin verifies a developer's proposed close
  const isManager = user.role === 'Team Lead' || user.role === 'Admin';
  const readOnly = isReadOnly(release);
  const wbsBug = wbsEnabled && releaseTasks.length > 0;
  const invalid = !form.title.trim() || (wbsBug && !form.wbsTaskId);

  // people a developer may tag: same team's QA + Team Lead
  const tagTeamId = user.teamId || projectTeamId || null;
  const taggable = (profiles || []).filter(
    (p) =>
      p.id !== user.id &&
      p.teamId === tagTeamId &&
      (p.role === 'QA' || p.role === 'Team Lead')
  );

  const bugIdsKey = bugs.map((b) => b.id).join(',');
  const refreshCounts = useCallback(async () => {
    try {
      setCommentCounts(await api.fetchBugCommentCounts(bugs.map((b) => b.id)));
    } catch (_) {
      /* non-critical */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bugIdsKey]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  function submit() {
    if (invalid) return;
    onAddBug(release, form, file);
    setForm({ title: '', description: '', severity: 'major', feature: '', tags: [], wbsTaskId: '' });
    setFile(null);
    setShow(false);
  }

  return (
    <>
      {readOnly && (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
          This release is closed (superseded). Bugs are shown as they were at close.
        </div>
      )}
      {isQA && !readOnly && (
        <div style={{ marginBottom: 14 }}>
          {!show ? (
            <button style={ghostButton} onClick={() => setShow(true)}>
              + Report a bug
            </button>
          ) : (
            <div
              style={{
                ...card,
                padding: 14,
                background: 'var(--color-background-secondary)',
              }}
            >
              <Field label="Title">
                <input
                  style={inputStyle}
                  value={form.title}
                  placeholder="Short summary"
                  onChange={(e) => set('title', e.target.value)}
                />
              </Field>
              <Field label="Description">
                <textarea
                  style={{ ...inputStyle, resize: 'vertical' }}
                  rows={3}
                  value={form.description}
                  placeholder="Steps to reproduce, expected vs actual…"
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Severity">
                    <select style={inputStyle} value={form.severity} onChange={(e) => set('severity', e.target.value)}>
                      {SEVERITY_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {SEVERITIES[s].label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {!wbsBug && (
                  <div style={{ flex: 1 }}>
                    <Field label="Feature / Epic">
                      <select style={inputStyle} value={form.feature} onChange={(e) => set('feature', e.target.value)}>
                        <option value="">— none —</option>
                        {BUG_FEATURES.map((ft) => (
                          <option key={ft} value={ft}>
                            {ft}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </div>

              {wbsBug ? (
                <Field label="WBS task">
                  <select style={inputStyle} value={form.wbsTaskId} onChange={(e) => set('wbsTaskId', e.target.value)}>
                    <option value="">Select the task this bug is against…</option>
                    {releaseTasks.map((t) => (
                      <option key={t.id} value={t.taskId}>
                        {t.taskName} ({t.track})
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 5 }}>
                    The bug is linked to this task; the task returns to In Progress until it's resolved &amp; re-verified.
                  </div>
                </Field>
              ) : (
                <Field label="Component tags">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {BUG_TAGS.map((t) => {
                      const on = form.tags.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTag(t)}
                          style={{
                            padding: '4px 9px',
                            fontSize: 11.5,
                            fontWeight: 600,
                            borderRadius: 999,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            border: `1px solid ${on ? 'var(--brand)' : 'var(--color-border-tertiary)'}`,
                            background: on ? 'var(--brand-soft)' : 'var(--color-background-primary)',
                            color: on ? 'var(--brand)' : 'var(--color-text-secondary)',
                          }}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}
              <Field label="Screenshot (optional)">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files[0] || null)}
                  style={{ fontSize: 12 }}
                />
              </Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button style={ghostButton} onClick={() => setShow(false)}>
                  Cancel
                </button>
                <button
                  style={primaryButton(invalid || isSubmitting)}
                  disabled={invalid || isSubmitting}
                  onClick={submit}
                >
                  {isSubmitting ? 'Saving…' : 'Add bug'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {bugs.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          No bugs reported.
        </div>
      ) : (
        <>
          <FeatureSummary bugs={bugs} />
          {(() => {
            const renderBug = (bug) => (
              <BugRow
                key={bug.id}
                bug={bug}
                user={user}
                showToast={showToast}
                taggable={taggable}
                commentCount={commentCounts[bug.id] || 0}
                onCommentsChanged={refreshCounts}
                isDev={isDev && !readOnly}
                isQA={isQA && !readOnly}
                isManager={isManager && !readOnly}
                canDelete={!readOnly && (user.role === 'Admin' || bug.createdById === user.id)}
                isSubmitting={isSubmitting}
                proposerName={
                  bug.resolutionById
                    ? profiles.find((p) => p.id === bug.resolutionById)?.name || ''
                    : ''
                }
                onStatus={(st) => onBugStatus(release, bug, st)}
                onResolve={(res) => onBugResolve(release, bug, res)}
                onCloseReview={(decision) => onBugCloseReview(release, bug, decision)}
                onDelete={() => onDeleteBug(bug)}
              />
            );
            const pendingVerify = bugs.filter((b) => b.carriedForward && b.status === 'fixed');
            const carried = bugs.filter((b) => b.carriedForward && b.status !== 'fixed');
            const fresh = bugs.filter((b) => !b.carriedForward);
            const group = (label, list, hint) =>
              list.length === 0 ? null : (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ ...sideHead, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    {label} <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>· {list.length}</span>
                    {hint && <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{hint}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{list.map(renderBug)}</div>
                </div>
              );
            // if nothing was carried, keep the original flat list
            if (!pendingVerify.length && !carried.length)
              return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{fresh.map(renderBug)}</div>;
            return (
              <>
                {group('Pending verification', pendingVerify, 'fixed on a prior build — verify on this release')}
                {group('Carried forward', carried, 'still unresolved from a prior build')}
                {group('New this release', fresh)}
              </>
            );
          })()}
        </>
      )}
    </>
  );
}

function FeatureSummary({ bugs }) {
  const groups = {};
  bugs.forEach((b) => {
    const key = b.feature || 'Unassigned';
    if (!groups[key]) groups[key] = { total: 0, resolved: 0 };
    groups[key].total += 1;
    if (b.status === 'verified') groups[key].resolved += 1;
  });
  const entries = Object.entries(groups).sort(
    (a, b) => b[1].total - b[1].resolved - (a[1].total - a[1].resolved)
  );
  if (entries.length <= 1 && entries[0]?.[0] === 'Unassigned') return null;
  return (
    <div style={{ ...card, padding: 12, marginBottom: 12 }}>
      <div style={{ ...sideHead, marginBottom: 8 }}>Feature health</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([feat, g]) => {
          const open = g.total - g.resolved;
          return (
            <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, flex: '0 0 130px' }}>{feat}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--color-background-secondary)' }}>
                <div
                  style={{
                    width: `${(g.resolved / g.total) * 100}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: 'var(--success)',
                  }}
                />
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', flex: '0 0 auto' }}>
                {g.total} bug{g.total === 1 ? '' : 's'} · {g.resolved} resolved
                {open > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · {open} open</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BugRow({
  bug,
  user,
  showToast,
  taggable,
  commentCount,
  onCommentsChanged,
  isDev,
  isQA,
  isManager,
  canDelete,
  isSubmitting,
  proposerName,
  onStatus,
  onResolve,
  onCloseReview,
  onDelete,
}) {
  const [showThread, setShowThread] = useState(false);

  return (
    <div style={{ ...card, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{bug.title}</span>
        {bug.iteration > 1 && (
          <span
            title={`Carried across ${bug.iteration} releases`}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 999,
              color: 'var(--brand)',
              background: 'var(--brand-soft)',
            }}
          >
            Carried ×{bug.iteration - 1}
          </span>
        )}
        <SlaBadge
          level={bugSlaLevel(bug.status, bug.createdAt)}
          title="This bug is aging — resolve or escalate"
        />
        <SeverityBadge severity={bug.severity} />
        <BugStatusBadge status={bug.status} />
      </div>

      {(bug.feature || bug.tags.length > 0 || (bug.resolution && bug.resolution !== 'Fixed')) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {bug.feature && <TagChip label={bug.feature} tone="brand" />}
          {bug.tags.map((t) => (
            <TagChip key={t} label={t} />
          ))}
          {bug.resolution && bug.resolution !== 'Fixed' && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                color: 'var(--warning)',
                background: 'var(--color-background-secondary)',
                border: '1px solid var(--color-border-tertiary)',
              }}
            >
              {bug.resolution}
            </span>
          )}
        </div>
      )}

      {bug.description && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            marginTop: 6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {bug.description}
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          marginTop: 6,
        }}
      >
        by {bug.createdBy} · {new Date(bug.createdAt).toLocaleDateString()}
      </div>
      {bug.screenshotUrl && (
        <a
          href={bug.screenshotUrl}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-block', marginTop: 8 }}
        >
          <img
            src={bug.screenshotUrl}
            alt="screenshot"
            style={{
              maxHeight: 120,
              borderRadius: 8,
              border: '0.5px solid var(--color-border-tertiary)',
            }}
          />
        </a>
      )}
      <ProposedCloseBanner bug={bug} proposerName={proposerName} />
      <BugActions
        bug={bug}
        isDev={isDev}
        isQA={isQA}
        isManager={isManager}
        canDelete={canDelete}
        isSubmitting={isSubmitting}
        onStatus={onStatus}
        onResolve={onResolve}
        onCloseReview={onCloseReview}
        onDelete={onDelete}
      />

      {/* comment thread */}
      <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border-primary)', paddingTop: 10 }}>
        <button
          onClick={() => setShowThread((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {showThread ? 'Hide comments' : 'Comments'}
          {commentCount > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                background: 'var(--color-background-secondary)',
                border: '1px solid var(--color-border-tertiary)',
                borderRadius: 999,
                padding: '0 7px',
                lineHeight: '16px',
              }}
            >
              {commentCount}
            </span>
          )}
        </button>
        {showThread && (
          <BugThread
            bug={bug}
            user={user}
            showToast={showToast}
            taggable={taggable}
            onChanged={onCommentsChanged}
          />
        )}
      </div>
    </div>
  );
}

const MENTION_RE = /(^|\s)@([\p{L}\p{N}_]*)$/u;

function renderCommentBody(text, names) {
  if (!names || names.length === 0) return text;
  const mentionSet = new Set(names.map((n) => '@' + n));
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(@(?:${esc.join('|')}))`, 'g');
  return text.split(re).map((part, i) =>
    mentionSet.has(part) ? (
      <span key={i} style={{ color: 'var(--brand)', fontWeight: 600 }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function BugThread({ bug, user, showToast, taggable = [], onChanged }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [mentions, setMentions] = useState([]); // selected {id,name,role}
  const [menuQuery, setMenuQuery] = useState(null); // active @query or null
  const taRef = useRef(null);

  const taggableNames = taggable.map((p) => p.name);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setComments(await api.fetchBugComments(bug.id));
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [bug.id, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  function onBodyChange(e) {
    const val = e.target.value;
    setBody(val);
    const caret = e.target.selectionStart ?? val.length;
    const m = val.slice(0, caret).match(MENTION_RE);
    setMenuQuery(m && taggable.length ? m[2].toLowerCase() : null);
  }

  function applyMention(p) {
    const ta = taRef.current;
    const caret = ta ? ta.selectionStart : body.length;
    const upto = body.slice(0, caret);
    const m = upto.match(MENTION_RE);
    if (!m) return;
    const at = caret - m[2].length - 1; // index of '@'
    const insert = `@${p.name} `;
    const next = body.slice(0, at) + insert + body.slice(caret);
    setBody(next);
    setMentions((ms) => (ms.find((x) => x.id === p.id) ? ms : [...ms, p]));
    setMenuQuery(null);
    const pos = at + insert.length;
    setTimeout(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  const suggestions =
    menuQuery == null
      ? []
      : taggable.filter((p) => p.name.toLowerCase().includes(menuQuery));

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.createBugComment({
        bug_id: bug.id,
        author_id: user.id,
        author_name: user.name,
        author_role: user.role,
        body: body.trim(),
      });
      // notify only tagged people that are still referenced in the text
      const tagged = mentions.filter((p) => body.includes('@' + p.name));
      await Promise.all(
        tagged.map((p) =>
          api.createNotification({
            user_id: p.id,
            type: 'bug_mention',
            message: `${user.name} mentioned you on bug "${bug.title}"`,
            release_id: bug.releaseId,
          })
        )
      );
      setBody('');
      setMentions([]);
      setMenuQuery(null);
      await load();
      onChanged && onChanged();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await api.deleteBugComment(id);
      await load();
      onChanged && onChanged();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : comments.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
          No comments yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 9 }}>
              <Avatar name={c.authorName} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.authorName}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
                    {c.authorRole} · {new Date(c.createdAt).toLocaleString()}
                  </span>
                  {(user.role === 'Admin' || c.authorId === user.id) && (
                    <button
                      onClick={() => remove(c.id)}
                      style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 11,
                        color: 'var(--color-text-tertiary)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 13, marginTop: 3, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                  {renderCommentBody(c.body, taggableNames)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Avatar name={user.name} size={26} />
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={taRef}
            style={{ ...inputStyle, resize: 'vertical' }}
            rows={2}
            value={body}
            placeholder={
              taggable.length ? 'Add a comment… use @ to tag QA / Team Lead' : 'Add a comment…'
            }
            onChange={onBodyChange}
            onKeyDown={(e) => e.key === 'Escape' && setMenuQuery(null)}
          />

          {menuQuery != null && (
            <div
              style={{
                ...card,
                position: 'absolute',
                left: 0,
                right: 0,
                top: '100%',
                marginTop: 4,
                zIndex: 60,
                maxHeight: 180,
                overflowY: 'auto',
                boxShadow: 'var(--shadow-md)',
                padding: 4,
              }}
            >
              {suggestions.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '8px 10px' }}>
                  No teammates to tag.
                </div>
              ) : (
                suggestions.map((p) => (
                  <div
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyMention(p);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Avatar name={p.name} size={24} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>{p.role}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              style={primaryButton(!body.trim() || busy)}
              disabled={!body.trim() || busy}
              onClick={add}
            >
              {busy ? 'Saving…' : 'Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Comments tab ---------- */

function CommentsTab({ release, user, showToast, onAddComment, onDeleteComment }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setComments(await api.fetchComments(release.id));
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [release.id, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(text, parentId, reset) {
    if (!text.trim()) return;
    const ok = await onAddComment(release, text, parentId);
    if (ok) {
      reset();
      load();
    }
  }

  async function del(id) {
    const ok = await onDeleteComment(id);
    if (ok) load();
  }

  const top = comments.filter((c) => !c.parentId);
  const repliesOf = (id) => comments.filter((c) => c.parentId === id);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <textarea
          style={{ ...inputStyle, resize: 'vertical' }}
          rows={2}
          value={body}
          placeholder="Write a comment…"
          onChange={(e) => setBody(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            style={primaryButton(!body.trim())}
            disabled={!body.trim()}
            onClick={() => add(body, null, () => setBody(''))}
          >
            Comment
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Loading…
        </div>
      ) : top.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          No comments yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {top.map((c) => (
            <div key={c.id}>
              <CommentRow
                c={c}
                user={user}
                onReply={() => {
                  setReplyTo(replyTo === c.id ? null : c.id);
                  setReplyBody('');
                }}
                onDelete={() => del(c.id)}
              />
              <div style={{ marginLeft: 24, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {repliesOf(c.id).map((r) => (
                  <CommentRow key={r.id} c={r} user={user} onDelete={() => del(r.id)} />
                ))}
                {replyTo === c.id && (
                  <div>
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2}
                      value={replyBody}
                      placeholder="Reply…"
                      onChange={(e) => setReplyBody(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                      <button style={ghostButton} onClick={() => setReplyTo(null)}>
                        Cancel
                      </button>
                      <button
                        style={primaryButton(!replyBody.trim())}
                        disabled={!replyBody.trim()}
                        onClick={() =>
                          add(replyBody, c.id, () => {
                            setReplyBody('');
                            setReplyTo(null);
                          })
                        }
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CommentRow({ c, user, onReply, onDelete }) {
  const canDelete = user.role === 'Admin' || c.authorId === user.id;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Avatar name={c.authorName} role={c.authorRole} size={26} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{c.authorName}</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
            {c.authorRole} · {new Date(c.createdAt).toLocaleString()}
          </span>
        </div>
        <div style={{ fontSize: 13, marginTop: 2, whiteSpace: 'pre-wrap' }}>
          {c.body}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {onReply && (
            <button
              onClick={onReply}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 11,
                color: 'var(--brand)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Reply
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 11,
                color: '#dc2626',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Checklist tab ---------- */

function ChecklistTab({ items, checks, canEdit, onToggle }) {
  const done = items.filter((it) => checks[it.id]).length;
  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
        {done}/{items.length} complete
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => (
          <label
            key={it.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-primary)',
              borderRadius: 10,
              cursor: canEdit ? 'pointer' : 'default',
            }}
          >
            <input
              type="checkbox"
              checked={!!checks[it.id]}
              disabled={!canEdit}
              onChange={(e) => onToggle(it.id, e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>{it.label}</span>
          </label>
        ))}
      </div>
    </>
  );
}

