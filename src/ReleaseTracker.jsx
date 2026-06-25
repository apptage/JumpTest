import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient.js';
import * as api from './api.js';
import {
  STATUSES,
  STATUS_ORDER,
  RELEASE_TYPES,
  RELEASE_TYPE_ORDER,
  PROJECT_TYPES,
  RELEASE_TYPES_BY_PROJECT,
  platformForProjectType,
  platformForReleaseType,
  platformLabel,
  linkIssue,
  SEVERITIES,
  SEVERITY_ORDER,
  BUG_STATUSES,
  ROLES,
  ALLOWED_EMAIL_DOMAIN,
  emailDomainOk,
} from './constants.js';
import {
  card,
  inputStyle,
  labelStyle,
  primaryButton,
  ghostButton,
  Logo,
  Wordmark,
  StatusBadge,
  BugStatusBadge,
  SeverityBadge,
  TypeBadge,
  Avatar,
  CountBadge,
  ModalShell,
  Toast,
  CenteredMessage,
  Info,
} from './ui.jsx';
import {
  HeroIllustration,
  EmptyIllustration,
  IconCode,
  IconBug,
  IconShieldCheck,
  IconRocket,
} from './illustrations.jsx';

/* ================================================================== */
/* Root                                                               */
/* ================================================================== */

export default function ReleaseTracker() {
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);

  const [projects, setProjects] = useState([]);
  const [releases, setReleases] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);

  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const [projectFilter, setProjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showSubmit, setShowSubmit] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [historyProject, setHistoryProject] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showNotif, setShowNotif] = useState(false);

  const showToast = useCallback((message, kind = 'success') => {
    setToast({ message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  /* run an async action with submitting flag + error toast */
  const run = useCallback(
    async (fn, successMsg) => {
      setIsSubmitting(true);
      try {
        const result = await fn();
        if (successMsg) showToast(successMsg);
        return result === undefined ? true : result;
      } catch (e) {
        showToast(e.message || 'Something went wrong', 'error');
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [showToast]
  );

  /* ---- auth session ---- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setUser(null);
      setProfileMissing(false);
      return;
    }
    setProfileMissing(false);
    api.fetchProfileById(session.user.id).then((p) => {
      if (cancelled) return;
      if (p) setUser(p);
      else setProfileMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  /* ---- refetchers ---- */
  const refetchReleases = useCallback(async () => {
    setReleases(await api.fetchReleases());
  }, []);
  const refetchBugs = useCallback(async () => {
    setBugs(await api.fetchBugs());
  }, []);
  const refetchProjects = useCallback(async () => {
    setProjects(await api.fetchProjects());
  }, []);
  const refetchProfiles = useCallback(async () => {
    setProfiles(await api.fetchProfiles());
  }, []);
  const refetchChecklist = useCallback(async () => {
    setChecklistItems(await api.fetchChecklistItems());
  }, []);
  const refetchNotifications = useCallback(async () => {
    if (!user) return;
    setNotifications(await api.fetchNotifications(user.id));
  }, [user]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, rel, bg, prof, ci] = await Promise.all([
        api.fetchProjects(),
        api.fetchReleases(),
        api.fetchBugs(),
        api.fetchProfiles(),
        api.fetchChecklistItems(),
      ]);
      setProjects(pr);
      setReleases(rel);
      setBugs(bg);
      setProfiles(prof);
      setChecklistItems(ci);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (user) {
      loadAll();
      refetchNotifications();
    }
  }, [user, loadAll, refetchNotifications]);

  /* poll notifications every 30s */
  useEffect(() => {
    if (!user) return;
    const t = setInterval(refetchNotifications, 30000);
    return () => clearInterval(t);
  }, [user, refetchNotifications]);

  /* ---- derived ---- */
  const projectsById = useMemo(() => {
    const m = {};
    projects.forEach((p) => (m[p.id] = p));
    return m;
  }, [projects]);

  const profilesById = useMemo(() => {
    const m = {};
    profiles.forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  const openBugCountByRelease = useMemo(() => {
    const m = {};
    bugs.forEach((b) => {
      if (b.status === 'open')
        m[b.releaseId] = (m[b.releaseId] || 0) + 1;
    });
    return m;
  }, [bugs]);

  const counts = STATUS_ORDER.reduce((acc, key) => {
    acc[key] = releases.filter((r) => r.status === key).length;
    return acc;
  }, {});

  const filtered = releases.filter(
    (r) =>
      (projectFilter === 'all' || r.projectId === projectFilter) &&
      (typeFilter === 'all' || r.releaseType === typeFilter) &&
      (statusFilter === 'all' || r.status === statusFilter)
  );

  const unread = notifications.filter((n) => !n.read).length;
  const selected = releases.find((r) => r.id === selectedId) || null;

  /* ---- auth actions ---- */
  async function handleSignIn({ email, password }) {
    await run(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    }, 'Signed in');
  }

  async function handleSignUp({ name, email, password }) {
    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    setIsSubmitting(false);
    if (error) return showToast(error.message, 'error');
    showToast(
      data.session
        ? 'Account created'
        : 'Account created — confirm via email, then sign in.'
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setReleases([]);
    setBugs([]);
    setSelectedId(null);
    setShowSubmit(false);
    setShowAdmin(false);
    setShowAnalytics(false);
    setHistoryProject(null);
  }

  /* ---- releases ---- */
  async function handleCreateRelease(form) {
    const issue = linkIssue(form.linkUrl);
    if (issue) {
      showToast(issue, 'error');
      return;
    }
    const ok = await run(async () => {
      await api.createRelease({
        project_id: form.projectId,
        version: form.version.trim(),
        release_type: form.releaseType,
        platform: platformForReleaseType(form.releaseType),
        file_url: '',
        link_url: form.linkUrl.trim(),
        submitted_by: user.name,
        submitted_by_role: user.role,
        submitted_by_id: user.id,
        date: new Date().toISOString().slice(0, 10),
        release_notes: form.releaseNotes.trim(),
        status: 'pending',
        qa_note: '',
      });
    }, 'Release submitted');
    if (ok) {
      setShowSubmit(false);
      refetchReleases();
    }
  }

  async function handleReleaseStatus(release, newStatus, qaNote) {
    const patch = { status: newStatus, qa_note: qaNote };
    if (newStatus === 'qa_complete')
      patch.qa_completed_at = new Date().toISOString();
    const ok = await run(
      () => api.updateRelease(release.id, patch),
      'Release updated'
    );
    if (ok) refetchReleases();
  }

  async function handleSaveNote(release, qaNote) {
    const ok = await run(
      () => api.updateRelease(release.id, { qa_note: qaNote }),
      'Note saved'
    );
    if (ok) refetchReleases();
  }

  async function handleAssignQa(release, qaId) {
    const ok = await run(
      () => api.updateRelease(release.id, { assigned_qa: qaId || null }),
      'Tester assigned'
    );
    if (ok) refetchReleases();
  }

  async function handleDeleteRelease(release) {
    if (!window.confirm('Delete this release? This cannot be undone.')) return;
    const ok = await run(
      () => api.deleteRelease(release.id),
      'Release deleted'
    );
    if (ok) {
      setSelectedId(null);
      refetchReleases();
    }
  }

  /* ---- bugs ---- */
  async function handleAddBug(release, form, file) {
    const ok = await run(async () => {
      let screenshotUrl = '';
      if (file) screenshotUrl = await api.uploadFile('screenshots', file);
      await api.createBug({
        release_id: release.id,
        title: form.title.trim(),
        description: form.description.trim(),
        severity: form.severity,
        screenshot_url: screenshotUrl,
        status: 'open',
        created_by: user.name,
        created_by_id: user.id,
      });
      // notify the developer who submitted this release
      await api.createNotification({
        user_id: release.submittedById,
        type: 'bug_filed',
        message: `${user.name} filed a bug on v${release.version}: ${form.title.trim()}`,
        release_id: release.id,
      });
    }, 'Bug reported');
    if (ok) refetchBugs();
  }

  async function handleBugStatus(release, bug, newStatus) {
    const ok = await run(async () => {
      await api.updateBugStatus(bug.id, newStatus);
      if (newStatus === 'fixed') {
        await api.createNotification({
          user_id: bug.createdById,
          type: 'bug_fixed',
          message: `${user.name} marked bug "${bug.title}" as fixed on v${release.version}`,
          release_id: release.id,
        });
      }
    });
    if (ok) refetchBugs();
  }

  async function handleDeleteBug(bug) {
    if (!window.confirm('Delete this bug?')) return;
    const ok = await run(() => api.deleteBug(bug.id));
    if (ok) refetchBugs();
  }

  /* ---- comments ---- */
  async function handleAddComment(release, body, parentId) {
    return run(() =>
      api.createComment({
        release_id: release.id,
        parent_id: parentId || null,
        author_id: user.id,
        author_name: user.name,
        author_role: user.role,
        body: body.trim(),
      })
    );
  }
  async function handleDeleteComment(id) {
    return run(() => api.deleteComment(id));
  }

  /* ---- projects + checklist (admin) ---- */
  async function handleCreateProject(p) {
    const ok = await run(() => api.createProject(p), 'Project created');
    if (ok) refetchProjects();
  }
  async function handleUpdateProject(id, patch) {
    const ok = await run(() => api.updateProject(id, patch), 'Project updated');
    if (ok) refetchProjects();
    return ok;
  }
  async function handleDeleteProject(id) {
    if (
      !window.confirm(
        'Delete this project? Its checklist items will be removed; releases stay but lose their project link.'
      )
    )
      return;
    const ok = await run(() => api.deleteProject(id), 'Project deleted');
    if (ok) {
      refetchProjects();
      refetchChecklist();
    }
  }
  async function handleAddChecklistItem(projectId, label, position) {
    const ok = await run(() =>
      api.createChecklistItem(projectId, label, position)
    );
    if (ok) refetchChecklist();
  }
  async function handleDeleteChecklistItem(id) {
    const ok = await run(() => api.deleteChecklistItem(id));
    if (ok) refetchChecklist();
  }

  /* ---- notifications ---- */
  async function handleOpenNotif() {
    setShowNotif((v) => !v);
  }
  async function handleMarkAllRead() {
    await api.markAllNotificationsRead(user.id);
    refetchNotifications();
  }
  async function handleNotifClick(n) {
    if (!n.read) {
      await api.markNotificationRead(n.id);
      refetchNotifications();
    }
    if (n.releaseId) {
      setSelectedId(n.releaseId);
      setShowNotif(false);
    }
  }

  /* ---- render gates ---- */
  if (authLoading) return <CenteredMessage>Loading…</CenteredMessage>;

  if (!session)
    return (
      <>
        <AuthScreen
          isSubmitting={isSubmitting}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
        />
        <Toast toast={toast} />
      </>
    );

  if (profileMissing)
    return (
      <>
        <CenteredMessage>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>
            No profile for this account
          </div>
          <div style={{ marginBottom: 18 }}>
            Your access may have been removed, or your email isn't confirmed yet.
          </div>
          <button style={ghostButton} onClick={handleSignOut}>
            Sign out
          </button>
        </CenteredMessage>
        <Toast toast={toast} />
      </>
    );

  if (!user) return <CenteredMessage>Loading your profile…</CenteredMessage>;

  const isAdmin = user.role === 'Admin';
  const canSubmit = user.role === 'Developer' || isAdmin;

  return (
    <div style={{ minHeight: '100%' }}>
      <Header
        user={user}
        isAdmin={isAdmin}
        canSubmit={canSubmit}
        unread={unread}
        notifOpen={showNotif}
        notifications={notifications}
        onToggleNotif={handleOpenNotif}
        onNotifClick={handleNotifClick}
        onMarkAllRead={handleMarkAllRead}
        onSubmitClick={() => setShowSubmit(true)}
        onAdminClick={() => setShowAdmin(true)}
        onAnalyticsClick={() => setShowAnalytics(true)}
        onSignOut={handleSignOut}
      />

      <div className="app-shell">
        {/* LEFT — project nav + quick stats */}
        <aside className="shell-aside shell-left">
          <Sidebar
            projects={projects}
            releases={releases}
            openBugTotal={bugs.filter((b) => b.status === 'open').length}
            projectFilter={projectFilter}
            onProject={setProjectFilter}
          />
        </aside>

        {/* CENTER — KPIs + release list */}
        <main style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0 }}>
              {greeting()}, {user.name.split(/[\s_]+/)[0]}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
              {releases.length} release{releases.length === 1 ? '' : 's'} ·{' '}
              {projects.length} project{projects.length === 1 ? '' : 's'} ·{' '}
              {bugs.filter((b) => b.status === 'open').length} open bug
              {bugs.filter((b) => b.status === 'open').length === 1 ? '' : 's'}
            </p>
          </div>

          <StatCards counts={counts} />

          <FilterBar
            projects={projects}
            projectFilter={projectFilter}
            typeFilter={typeFilter}
            statusFilter={statusFilter}
            onProject={setProjectFilter}
            onType={setTypeFilter}
            onStatus={setStatusFilter}
            count={filtered.length}
          />

          {loading ? (
            <Empty>Loading releases…</Empty>
          ) : filtered.length === 0 ? (
            <Empty>
              {releases.length === 0
                ? 'No releases yet — submit your first build.'
                : 'No releases match your filters.'}
            </Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((r) => (
                <ReleaseCard
                  key={r.id}
                  release={r}
                  project={projectsById[r.projectId]}
                  openBugs={openBugCountByRelease[r.id] || 0}
                  assignedName={
                    r.assignedQa ? profilesById[r.assignedQa]?.name : null
                  }
                  onClick={() => setSelectedId(r.id)}
                />
              ))}
            </div>
          )}
        </main>

        {/* RIGHT — activity, platform mix, quick actions */}
        <aside className="shell-aside shell-right">
          <RightPanel
            releases={releases}
            bugs={bugs}
            canSubmit={canSubmit}
            isAdmin={isAdmin}
            onSubmit={() => setShowSubmit(true)}
            onAdmin={() => setShowAdmin(true)}
            onAnalytics={() => setShowAnalytics(true)}
            onOpenRelease={(id) => setSelectedId(id)}
          />
        </aside>
      </div>

      {showSubmit && (
        <SubmitModal
          projects={projects}
          isSubmitting={isSubmitting}
          onClose={() => setShowSubmit(false)}
          onSubmit={handleCreateRelease}
        />
      )}

      {showAdmin && (
        <AdminPanel
          currentUser={user}
          profiles={profiles}
          projects={projects}
          releases={releases}
          checklistItems={checklistItems}
          isSubmitting={isSubmitting}
          showToast={showToast}
          refetchProfiles={refetchProfiles}
          onCreateProject={handleCreateProject}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          onAddChecklistItem={handleAddChecklistItem}
          onDeleteChecklistItem={handleDeleteChecklistItem}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {showAnalytics && (
        <AnalyticsModal
          projects={projects}
          releases={releases}
          bugs={bugs}
          onClose={() => setShowAnalytics(false)}
          onOpenHistory={(p) => {
            setShowAnalytics(false);
            setHistoryProject(p);
          }}
        />
      )}

      {historyProject && (
        <HistoryModal
          project={historyProject}
          releases={releases.filter((r) => r.projectId === historyProject.id)}
          showToast={showToast}
          onClose={() => setHistoryProject(null)}
        />
      )}

      {selected && (
        <DetailModal
          release={selected}
          project={projectsById[selected.projectId]}
          user={user}
          profiles={profiles}
          profilesById={profilesById}
          bugs={bugs.filter((b) => b.releaseId === selected.id)}
          checklistItems={checklistItems.filter(
            (c) => c.projectId === selected.projectId
          )}
          isSubmitting={isSubmitting}
          showToast={showToast}
          onClose={() => setSelectedId(null)}
          onStatusUpdate={handleReleaseStatus}
          onSaveNote={handleSaveNote}
          onAssignQa={handleAssignQa}
          onDelete={handleDeleteRelease}
          onAddBug={handleAddBug}
          onBugStatus={handleBugStatus}
          onDeleteBug={handleDeleteBug}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

/* ================================================================== */
/* Small bits                                                         */
/* ================================================================== */

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function Empty({ children }) {
  return (
    <div
      style={{
        ...card,
        padding: '48px 24px 52px',
        textAlign: 'center',
        color: 'var(--color-text-secondary)',
        fontSize: 13,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <EmptyIllustration size={130} />
      {children}
    </div>
  );
}

/* ================================================================== */
/* Auth                                                               */
/* ================================================================== */

function AuthScreen({ isSubmitting, onSignIn, onSignUp }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isSignup = mode === 'signup';
  const domainBad = email.trim().length > 0 && !emailDomainOk(email);
  const invalid =
    !email.trim() ||
    domainBad ||
    password.length < 6 ||
    (isSignup && !name.trim());

  function submit() {
    if (invalid || isSubmitting) return;
    if (isSignup) onSignUp({ name, email, password });
    else onSignIn({ email, password });
  }

  const tab = (active) => ({
    flex: 1,
    padding: '8px 0',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'center',
    cursor: 'pointer',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    borderBottom: `2px solid ${active ? 'var(--brand)' : 'transparent'}`,
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="anim-in"
        style={{
          ...card,
          display: 'flex',
          flexWrap: 'wrap',
          width: '100%',
          maxWidth: 840,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* brand panel — black + orange */}
        <div
          className="auth-brand grid-dots"
          style={{
            flex: '1 1 330px',
            minWidth: 0,
            padding: 36,
            background:
              'radial-gradient(420px 240px at 80% 0%, rgba(255,90,0,0.22), transparent 70%), var(--ink)',
            color: 'var(--on-ink)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Wordmark size={30} tone="ink" />

          <div style={{ margin: '20px 0 4px' }}>
            <HeroIllustration />
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <h2 style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.15, margin: 0 }}>
              Ship it. Test it.<br />
              <span style={{ color: 'var(--brand)' }}>Track every build.</span>
            </h2>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--on-ink-dim)', margin: '12px 0 18px' }}>
              From APK to TestFlight to web — one pipeline for dev and QA.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                [<IconCode size={16} />, 'Project-based release pipeline'],
                [<IconBug size={16} />, 'QA bug tracking & screenshots'],
                [<IconShieldCheck size={16} />, 'Checklists & role-based sign-off'],
              ].map(([icon, t]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 12.5 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: 'var(--brand-soft)',
                      color: 'var(--brand)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {icon}
                  </span>
                  <span style={{ color: 'var(--on-ink)' }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* form panel */}
        <div style={{ flex: '1 1 360px', minWidth: 0, padding: 36 }}>
          <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.02em' }}>
            {isSignup ? 'Create your account' : 'Welcome back'}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              marginBottom: 20,
            }}
          >
            {isSignup ? 'Join your team on GammaQuality' : 'Sign in to continue'}
          </div>

          <div
            style={{
              display: 'flex',
              marginBottom: 20,
              borderBottom: '0.5px solid var(--color-border-tertiary)',
            }}
          >
            <div style={tab(!isSignup)} onClick={() => setMode('signin')}>
              Sign in
            </div>
            <div style={tab(isSignup)} onClick={() => setMode('signup')}>
              Create account
            </div>
          </div>

        {isSignup && (
          <Field label="Name">
            <input
              style={inputStyle}
              value={name}
              autoFocus
              placeholder="e.g. dev_ali"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </Field>
        )}

        <Field label="Email">
          <input
            style={inputStyle}
            type="email"
            value={email}
            autoFocus={!isSignup}
            placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>

        <Field label="Password">
          <input
            style={inputStyle}
            type="password"
            value={password}
            placeholder="At least 6 characters"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>

        <div
          style={{
            fontSize: 11,
            color: '#dc2626',
            marginBottom: 14,
            minHeight: 14,
          }}
        >
          {domainBad
            ? `Use your @${ALLOWED_EMAIL_DOMAIN} email address.`
            : password.length > 0 && password.length < 6
            ? 'Password must be at least 6 characters.'
            : ''}
        </div>

          <button
            style={{ ...primaryButton(invalid || isSubmitting), width: '100%', padding: '11px 16px' }}
            disabled={invalid || isSubmitting}
            onClick={submit}
          >
            {isSubmitting
              ? 'Please wait…'
              : isSignup
              ? 'Create account'
              : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

/* ================================================================== */
/* Header + notifications                                             */
/* ================================================================== */

function Header({
  user,
  isAdmin,
  canSubmit,
  unread,
  notifOpen,
  notifications,
  onToggleNotif,
  onNotifClick,
  onMarkAllRead,
  onSubmitClick,
  onAdminClick,
  onAnalyticsClick,
  onSignOut,
}) {
  const inkGhost = {
    padding: '8px 13px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--on-ink)',
    background: 'rgba(255,255,255,0.06)',
    border: '0.5px solid var(--ink-border)',
    borderRadius: 'var(--r-input)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'var(--ink)',
        borderBottom: '1px solid var(--ink-border)',
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto',
          padding: '11px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1 }}>
          <Wordmark size={30} tone="ink" />
        </div>

        {/* bell */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onToggleNotif}
            style={{ ...inkGhost, padding: '8px 11px', position: 'relative', fontSize: 15 }}
            title="Notifications"
          >
            🔔
            {unread > 0 && (
              <span style={{ position: 'absolute', top: -5, right: -5 }}>
                <CountBadge count={unread} />
              </span>
            )}
          </button>
          {notifOpen && (
            <NotificationsDropdown
              notifications={notifications}
              onNotifClick={onNotifClick}
              onMarkAllRead={onMarkAllRead}
            />
          )}
        </div>

        <button style={inkGhost} onClick={onAnalyticsClick}>
          Analytics
        </button>
        {isAdmin && (
          <button style={inkGhost} onClick={onAdminClick}>
            Admin
          </button>
        )}
        {canSubmit && (
          <button style={primaryButton(false)} onClick={onSubmitClick}>
            + Submit release
          </button>
        )}

        {/* user chip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 10px 5px 6px',
            background: 'rgba(255,255,255,0.06)',
            border: '0.5px solid var(--ink-border)',
            borderRadius: 999,
          }}
        >
          <Avatar name={user.name} role={user.role} size={26} />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--on-ink)' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--on-ink-dim)' }}>{user.role}</div>
          </div>
        </div>
        <button
          style={{ ...inkGhost, padding: '8px 11px' }}
          onClick={onSignOut}
          title="Sign out"
        >
          ⏻
        </button>
      </div>
    </header>
  );
}

function NotificationsDropdown({ notifications, onNotifClick, onMarkAllRead }) {
  return (
    <div
      style={{
        ...card,
        position: 'absolute',
        top: 44,
        right: 0,
        width: 320,
        maxHeight: 400,
        overflowY: 'auto',
        zIndex: 40,
        padding: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          borderBottom: '0.5px solid var(--color-border-primary)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
          Notifications
        </div>
        <button
          onClick={onMarkAllRead}
          style={{
            ...ghostButton,
            padding: '4px 8px',
            fontSize: 11,
            border: 'none',
            background: 'transparent',
            color: 'var(--brand)',
          }}
        >
          Mark all read
        </button>
      </div>
      {notifications.length === 0 ? (
        <div
          style={{
            padding: 20,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            textAlign: 'center',
          }}
        >
          No notifications.
        </div>
      ) : (
        notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => onNotifClick(n)}
            style={{
              padding: '10px 12px',
              borderBottom: '0.5px solid var(--color-border-primary)',
              cursor: 'pointer',
              background: n.read
                ? 'transparent'
                : 'var(--color-background-secondary)',
            }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.4 }}>{n.message}</div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--color-text-secondary)',
                marginTop: 3,
              }}
            >
              {new Date(n.createdAt).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ================================================================== */
/* Stat cards + filters                                               */
/* ================================================================== */

function StatCards({ counts }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
        gap: 10,
        marginBottom: 18,
      }}
    >
      {STATUS_ORDER.map((key) => {
        const s = STATUSES[key];
        return (
          <div
            key={key}
            style={{
              ...card,
              padding: 16,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: s.color,
                opacity: 0.85,
              }}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  background: `${s.color}1a`,
                }}
              >
                {s.icon}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 28,
                  fontWeight: 700,
                  color: s.color,
                  letterSpacing: '-0.03em',
                }}
              >
                {counts[key]}
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilterBar({
  projects,
  projectFilter,
  typeFilter,
  statusFilter,
  onProject,
  onType,
  onStatus,
  count,
}) {
  const s = { ...inputStyle, width: 'auto', padding: '7px 10px' };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
        flexWrap: 'wrap',
      }}
    >
      <select style={s} value={projectFilter} onChange={(e) => onProject(e.target.value)}>
        <option value="all">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select style={s} value={typeFilter} onChange={(e) => onType(e.target.value)}>
        <option value="all">All types</option>
        {RELEASE_TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {RELEASE_TYPES[t].label}
          </option>
        ))}
      </select>
      <select style={s} value={statusFilter} onChange={(e) => onStatus(e.target.value)}>
        <option value="all">All statuses</option>
        {STATUS_ORDER.map((st) => (
          <option key={st} value={st}>
            {STATUSES[st].label}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        {count} release{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

/* ================================================================== */
/* Release card                                                       */
/* ================================================================== */

function ReleaseCard({ release, project, openBugs, assignedName, onClick }) {
  const [hover, setHover] = useState(false);
  const accent = STATUSES[release.status]?.color || '#6b7280';
  const notesPreview = (release.releaseNotes || '').split('\n')[0].trim();
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...card,
        position: 'relative',
        padding: '14px 16px 14px 18px',
        cursor: 'pointer',
        overflow: 'hidden',
        borderColor: hover ? 'var(--color-border-tertiary)' : 'var(--color-border-tertiary)',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hover ? 'translateY(-1px)' : 'none',
        transition: 'box-shadow .15s ease, transform .15s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TypeBadge type={release.releaseType} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600 }}>
          v{release.version}
        </span>
        <StatusBadge status={release.status} />
        {project && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{ opacity: 0.5 }}>📁</span>
            {project.name}
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
            padding: '2px 8px',
            background: 'var(--color-background-secondary)',
            borderRadius: 999,
          }}
        >
          {release.platform}
        </span>
        {openBugs > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <CountBadge count={openBugs} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#f43f5e' }}>
              open bug{openBugs === 1 ? '' : 's'}
            </span>
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: assignedName ? 'var(--brand)' : 'var(--color-text-tertiary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          🧪 {assignedName || 'Unassigned'}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={release.submittedBy} role={release.submittedByRole} size={28} />
          <div style={{ lineHeight: 1.2, textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{release.submittedBy}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              {release.submittedByRole} · {release.date}
            </div>
          </div>
        </div>
      </div>

      {notesPreview && !release.qaNote ? (
        <div
          style={{
            marginTop: 9,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.45,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {notesPreview}
        </div>
      ) : null}

      {release.qaNote ? (
        <div
          style={{
            marginTop: 11,
            padding: '9px 11px',
            background: 'var(--color-background-secondary)',
            borderRadius: 9,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.45,
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>QA note </span>
          {release.qaNote}
        </div>
      ) : null}
    </div>
  );
}

/* ================================================================== */
/* Sidebar (left) + Right panel                                       */
/* ================================================================== */

const sideHead = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
  marginBottom: 10,
};

function relativeTime(t) {
  if (!t) return '';
  const d = new Date(t).getTime();
  if (Number.isNaN(d)) return '';
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd}d ago`;
  return new Date(t).toLocaleDateString();
}

const PLAT_COLORS = {
  Android: '#22c55e',
  iOS: '#3b82f6',
  Web: '#f59e0b',
  Both: '#8b5cf6',
};

function NavRow({ label, count, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 9,
        cursor: 'pointer',
        background: active ? 'var(--brand-soft)' : 'transparent',
        color: active ? 'var(--brand)' : 'var(--color-text-primary)',
        fontWeight: active ? 600 : 500,
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: active ? 'var(--brand)' : 'var(--color-border-tertiary)',
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: active ? 'var(--brand)' : 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {count}
      </span>
    </div>
  );
}

function Sidebar({ projects, releases, openBugTotal, projectFilter, onProject }) {
  const countFor = (id) => releases.filter((r) => r.projectId === id).length;
  const stat = (label, value, color) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 0',
      }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          fontWeight: 700,
          color: color || 'var(--color-text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>Projects</div>
        <NavRow
          label="All projects"
          count={releases.length}
          active={projectFilter === 'all'}
          onClick={() => onProject('all')}
        />
        {projects.map((p) => (
          <NavRow
            key={p.id}
            label={p.name}
            count={countFor(p.id)}
            active={projectFilter === p.id}
            onClick={() => onProject(p.id)}
          />
        ))}
        {projects.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '6px 10px' }}>
            No projects yet.
          </div>
        )}
      </div>

      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>At a glance</div>
        {stat('Releases', releases.length)}
        {stat('Projects', projects.length)}
        {stat('Open bugs', openBugTotal, openBugTotal ? '#f43f5e' : undefined)}
      </div>
    </div>
  );
}

function RightPanel({
  releases,
  bugs,
  canSubmit,
  isAdmin,
  onSubmit,
  onAdmin,
  onAnalytics,
  onOpenRelease,
}) {
  const activity = [];
  releases.forEach((r) =>
    activity.push({
      id: 'r' + r.id,
      t: r.createdAt || r.date,
      kind: 'release',
      text: `${r.submittedBy} submitted ${RELEASE_TYPES[r.releaseType]?.label || ''} v${r.version}`,
      releaseId: r.id,
    })
  );
  bugs.forEach((b) =>
    activity.push({
      id: 'b' + b.id,
      t: b.createdAt,
      kind: 'bug',
      text: `${b.createdBy} reported “${b.title}”`,
      releaseId: b.releaseId,
    })
  );
  activity.sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime());
  const recent = activity.slice(0, 8);

  const plat = {};
  releases.forEach((r) => (plat[r.platform] = (plat[r.platform] || 0) + 1));
  const platRows = ['Android', 'iOS', 'Web', 'Both']
    .map((k) => [k, plat[k] || 0])
    .filter(([, v]) => v > 0);
  const maxPlat = Math.max(1, ...platRows.map(([, v]) => v));

  const quickBtn = {
    ...ghostButton,
    width: '100%',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* quick actions */}
      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>Quick actions</div>
        {canSubmit && (
          <button
            style={{ ...primaryButton(false), width: '100%', display: 'block', textAlign: 'center' }}
            onClick={onSubmit}
          >
            + Submit release
          </button>
        )}
        <button style={quickBtn} onClick={onAnalytics}>
          📊 View analytics
        </button>
        {isAdmin && (
          <button style={quickBtn} onClick={onAdmin}>
            ⚙️ Manage projects & users
          </button>
        )}
      </div>

      {/* platform mix */}
      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>Platform mix</div>
        {platRows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No releases yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {platRows.map(([k, v]) => (
              <div key={k}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{k}</span>
                  <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {v}
                  </span>
                </div>
                <div
                  style={{
                    height: 7,
                    borderRadius: 999,
                    background: 'var(--color-background-secondary)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(v / maxPlat) * 100}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: PLAT_COLORS[k] || 'var(--brand)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* recent activity */}
      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>Recent activity</div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Nothing yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recent.map((a) => (
              <div
                key={a.id}
                onClick={() => a.releaseId && onOpenRelease(a.releaseId)}
                style={{ display: 'flex', gap: 9, cursor: a.releaseId ? 'pointer' : 'default' }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: a.kind === 'bug' ? '#f43f5e' : 'var(--brand)',
                    background: a.kind === 'bug' ? 'rgba(244,63,94,0.12)' : 'var(--brand-soft)',
                  }}
                >
                  {a.kind === 'bug' ? <IconBug size={14} /> : <IconRocket size={14} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.4 }}>{a.text}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {relativeTime(a.t)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Submit modal                                                       */
/* ================================================================== */

function SubmitModal({ projects, isSubmitting, onClose, onSubmit }) {
  const firstProject = projects[0];
  const allowedFor = (id) => {
    const p = projects.find((x) => x.id === id);
    return RELEASE_TYPES_BY_PROJECT[p?.type] || RELEASE_TYPE_ORDER;
  };
  const [form, setForm] = useState({
    projectId: firstProject ? firstProject.id : '',
    version: '',
    releaseType: firstProject ? allowedFor(firstProject.id)[0] : 'apk',
    linkUrl: '',
    releaseNotes: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const allowedTypes = allowedFor(form.projectId);
  const linkErr = linkIssue(form.linkUrl);
  const linkLabel =
    form.releaseType === 'apk'
      ? 'APK download link'
      : form.releaseType === 'testflight'
      ? 'TestFlight link'
      : 'Web link';

  function selectProject(id) {
    // keep release type valid for the newly-selected project
    const allowed = allowedFor(id);
    setForm((f) => ({
      ...f,
      projectId: id,
      releaseType: allowed.includes(f.releaseType) ? f.releaseType : allowed[0],
    }));
  }

  const invalid =
    !form.projectId ||
    !form.version.trim() ||
    !form.releaseNotes.trim() ||
    !!linkErr;

  function submit() {
    if (invalid) return;
    onSubmit(form);
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
              {p.name} ({platformLabel(p.platform)})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Version">
        <input
          style={inputStyle}
          value={form.version}
          placeholder="e.g. 2.4.3"
          onChange={(e) => set('version', e.target.value)}
        />
      </Field>

      <Field label="Release type">
        <select
          style={inputStyle}
          value={form.releaseType}
          onChange={(e) => set('releaseType', e.target.value)}
        >
          {allowedTypes.map((t) => (
            <option key={t} value={t}>
              {RELEASE_TYPES[t].icon} {RELEASE_TYPES[t].label}
            </option>
          ))}
        </select>
      </Field>

      <Field label={linkLabel}>
        <input
          style={{
            ...inputStyle,
            borderColor:
              form.linkUrl && linkErr ? '#f43f5e' : 'var(--color-border-tertiary)',
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
            <span style={{ color: '#f43f5e' }}>{linkErr}</span>
          ) : form.releaseType === 'apk' ? (
            'Paste a permanent download link — WeTransfer and other expiring links are not allowed.'
          ) : (
            ''
          )}
        </div>
      </Field>

      <Field label="Release notes">
        <textarea
          style={{ ...inputStyle, resize: 'vertical' }}
          rows={4}
          value={form.releaseNotes}
          placeholder="What changed in this release?"
          onChange={(e) => set('releaseNotes', e.target.value)}
        />
      </Field>

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

/* ================================================================== */
/* Detail modal (tabs: Details / Bugs / Comments / Checklist)         */
/* ================================================================== */

function DetailModal({
  release,
  project,
  user,
  profiles,
  profilesById,
  bugs,
  checklistItems,
  isSubmitting,
  showToast,
  onClose,
  onStatusUpdate,
  onSaveNote,
  onAssignQa,
  onDelete,
  onAddBug,
  onBugStatus,
  onDeleteBug,
  onAddComment,
  onDeleteComment,
}) {
  const [tab, setTab] = useState('details');
  const [note, setNote] = useState(release.qaNote || '');
  const [checks, setChecks] = useState({}); // item_id -> checked

  const isAdmin = user.role === 'Admin';
  const isQA = user.role === 'QA' || isAdmin;
  const canDoQA =
    isAdmin ||
    (user.role === 'QA' &&
      (!release.assignedQa || release.assignedQa === user.id));
  const canDelete = isAdmin || release.submittedBy === user.name;

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
    if (
      newStatus === 'qa_complete' &&
      checklistItems.length > 0 &&
      !allChecked
    ) {
      showToast('Complete the checklist before marking QA Complete', 'error');
      setTab('checklist');
      return;
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
  const qaList = profiles.filter((p) => p.role === 'QA' || p.role === 'Admin');

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
          bugs.length ? <CountBadge count={openBugs || bugs.length} color={openBugs ? '#dc2626' : '#6b7280'} /> : null
        )}
        {tabBtn('comments', 'Comments')}
        {checklistItems.length > 0 && tabBtn('checklist', 'Checklist')}
      </div>

      {tab === 'details' && (
        <DetailsTab
          release={release}
          note={note}
          setNote={setNote}
          isQA={isQA}
          canDoQA={canDoQA}
          canDelete={canDelete}
          isAdmin={isAdmin}
          qaList={qaList}
          profilesById={profilesById}
          isSubmitting={isSubmitting}
          onAttemptStatus={attemptStatus}
          onSaveNote={() => onSaveNote(release, note)}
          onAssignQa={(id) => onAssignQa(release, id)}
          onDelete={() => onDelete(release)}
        />
      )}

      {tab === 'bugs' && (
        <BugsTab
          release={release}
          bugs={bugs}
          user={user}
          isQA={isQA}
          isSubmitting={isSubmitting}
          onAddBug={onAddBug}
          onBugStatus={onBugStatus}
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
  note,
  setNote,
  isQA,
  canDoQA,
  canDelete,
  isAdmin,
  qaList,
  profilesById,
  isSubmitting,
  onAttemptStatus,
  onSaveNote,
  onAssignQa,
  onDelete,
}) {
  const assigned = release.assignedQa ? profilesById[release.assignedQa] : null;
  return (
    <>
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
        <Info label="Date" value={release.date} />
        <Info label="Submitted by" value={release.submittedBy} />
        <Info label="Assigned QA" value={assigned ? assigned.name : '—'} />
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
              display: 'inline-block',
              textDecoration: 'none',
            }}
          >
            {release.releaseType === 'apk' ? '⬇ Download APK' : '↗ Open link'}
          </a>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={labelStyle}>Release notes</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {release.releaseNotes || '—'}
        </div>
      </div>

      {/* assignment (admin) */}
      {isAdmin && (
        <div
          style={{
            borderTop: '0.5px solid var(--color-border-primary)',
            paddingTop: 14,
            marginBottom: 14,
          }}
        >
          <label style={labelStyle}>Assign QA tester</label>
          <select
            style={inputStyle}
            value={release.assignedQa || ''}
            disabled={isSubmitting}
            onChange={(e) => onAssignQa(e.target.value)}
          >
            <option value="">Anyone (unassigned)</option>
            {qaList.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name} ({q.role})
              </option>
            ))}
          </select>
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12,
            }}
          >
            {STATUS_ORDER.map((key) => {
              const active = release.status === key;
              const c = STATUSES[key].color;
              return (
                <button
                  key={key}
                  disabled={isSubmitting || !canDoQA}
                  onClick={() => onAttemptStatus(key)}
                  style={{
                    padding: '9px 12px',
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 10,
                    cursor: isSubmitting || !canDoQA ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    opacity: canDoQA ? 1 : 0.5,
                    color: active ? '#fff' : c,
                    background: active ? c : `${c}14`,
                    border: `0.5px solid ${active ? c : 'transparent'}`,
                  }}
                >
                  {STATUSES[key].label}
                </button>
              );
            })}
          </div>
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

      {canDelete && (
        <div
          style={{
            borderTop: '0.5px solid var(--color-border-primary)',
            paddingTop: 14,
            marginTop: 14,
          }}
        >
          <button
            disabled={isSubmitting}
            onClick={onDelete}
            style={{ ...ghostButton, color: '#dc2626', borderColor: '#dc262644' }}
          >
            Delete release
          </button>
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
  isSubmitting,
  onAddBug,
  onBugStatus,
  onDeleteBug,
}) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', severity: 'major' });
  const [file, setFile] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const isDev = user.role === 'Developer' || user.role === 'Admin';
  const invalid = !form.title.trim();

  function submit() {
    if (invalid) return;
    onAddBug(release, form, file);
    setForm({ title: '', description: '', severity: 'major' });
    setFile(null);
    setShow(false);
  }

  return (
    <>
      {isQA && (
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
              <Field label="Severity">
                <select
                  style={inputStyle}
                  value={form.severity}
                  onChange={(e) => set('severity', e.target.value)}
                >
                  {SEVERITY_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITIES[s].label}
                    </option>
                  ))}
                </select>
              </Field>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bugs.map((bug) => (
            <BugRow
              key={bug.id}
              bug={bug}
              isDev={isDev}
              isQA={isQA}
              canDelete={user.role === 'Admin' || bug.createdById === user.id}
              isSubmitting={isSubmitting}
              onStatus={(st) => onBugStatus(release, bug, st)}
              onDelete={() => onDeleteBug(bug)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function BugRow({ bug, isDev, isQA, canDelete, isSubmitting, onStatus, onDelete }) {
  // contextual transitions
  const actions = [];
  if (isDev) {
    if (bug.status === 'open') actions.push(['in_progress', 'Start']);
    if (bug.status === 'in_progress' || bug.status === 'open')
      actions.push(['fixed', 'Mark fixed']);
  }
  if (isQA) {
    if (bug.status === 'fixed') actions.push(['verified', 'Verify']);
    if (bug.status !== 'open') actions.push(['open', 'Reopen']);
  }

  return (
    <div style={{ ...card, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{bug.title}</span>
        <SeverityBadge severity={bug.severity} />
        <BugStatusBadge status={bug.status} />
      </div>
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
      {(actions.length > 0 || canDelete) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {actions.map(([st, label]) => (
            <button
              key={st}
              disabled={isSubmitting}
              onClick={() => onStatus(st)}
              style={{
                ...ghostButton,
                padding: '6px 10px',
                fontSize: 12,
                color: BUG_STATUSES[st].color,
                borderColor: `${BUG_STATUSES[st].color}55`,
              }}
            >
              {label}
            </button>
          ))}
          {canDelete && (
            <button
              disabled={isSubmitting}
              onClick={onDelete}
              style={{
                ...ghostButton,
                padding: '6px 10px',
                fontSize: 12,
                color: '#dc2626',
                borderColor: '#dc262644',
                marginLeft: 'auto',
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
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

/* ================================================================== */
/* Admin panel (tabs: Users / Projects)                               */
/* ================================================================== */

function AdminPanel({
  currentUser,
  profiles,
  projects,
  releases,
  checklistItems,
  isSubmitting,
  showToast,
  refetchProfiles,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onAddChecklistItem,
  onDeleteChecklistItem,
  onClose,
}) {
  const [tab, setTab] = useState('users');
  const tabBtn = (key, label) => (
    <div
      onClick={() => setTab(key)}
      style={{
        padding: '8px 12px',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        color: tab === key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        borderBottom: `2px solid ${tab === key ? 'var(--brand)' : 'transparent'}`,
      }}
    >
      {label}
    </div>
  );

  return (
    <ModalShell onClose={onClose} title="Admin" maxWidth={640}>
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          borderBottom: '0.5px solid var(--color-border-primary)',
        }}
      >
        {tabBtn('users', 'Users')}
        {tabBtn('projects', 'Projects & Checklists')}
      </div>

      {tab === 'users' ? (
        <UsersTab
          currentUser={currentUser}
          profiles={profiles}
          showToast={showToast}
          refetchProfiles={refetchProfiles}
        />
      ) : (
        <ProjectsTab
          projects={projects}
          releases={releases}
          checklistItems={checklistItems}
          isSubmitting={isSubmitting}
          onCreateProject={onCreateProject}
          onUpdateProject={onUpdateProject}
          onDeleteProject={onDeleteProject}
          onAddChecklistItem={onAddChecklistItem}
          onDeleteChecklistItem={onDeleteChecklistItem}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button style={ghostButton} onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function UsersTab({ currentUser, profiles, showToast, refetchProfiles }) {
  const [busyId, setBusyId] = useState(null);

  async function changeRole(id, role) {
    setBusyId(id);
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    setBusyId(null);
    if (error) showToast(error.message, 'error');
    else {
      showToast('Role updated');
      refetchProfiles();
    }
  }

  async function removeUser(p) {
    if (!window.confirm(`Remove ${p.name}? They will lose access until re-onboarded.`))
      return;
    setBusyId(p.id);
    const { error } = await supabase.from('profiles').delete().eq('id', p.id);
    setBusyId(null);
    if (error) showToast(error.message, 'error');
    else {
      showToast('User removed');
      refetchProfiles();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {profiles.map((p) => {
        const isSelf = p.id === currentUser.id;
        return (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-primary)',
              borderRadius: 10,
            }}
          >
            <Avatar name={p.name} role={p.role} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {p.name}
                {isSelf && (
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                    (you)
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.email}
              </div>
            </div>
            <select
              style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 }}
              value={p.role}
              disabled={isSelf || busyId === p.id}
              onChange={(e) => changeRole(p.id, e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeUser(p)}
              disabled={isSelf || busyId === p.id}
              style={{
                ...ghostButton,
                padding: '6px 10px',
                fontSize: 12,
                color: isSelf ? 'var(--color-text-secondary)' : '#dc2626',
                borderColor: isSelf ? 'var(--color-border-tertiary)' : '#dc262644',
                opacity: isSelf ? 0.5 : 1,
                cursor: isSelf ? 'default' : 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
        New sign-ups join as Developer. Promote to QA or Admin here. You can't
        change or remove your own account.
      </div>
    </div>
  );
}

function ProjectsTab({
  projects,
  releases,
  checklistItems,
  isSubmitting,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onAddChecklistItem,
  onDeleteChecklistItem,
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'mobile' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const invalid = !form.name.trim();
  const releaseCount = (id) => releases.filter((r) => r.projectId === id).length;

  function create() {
    if (invalid) return;
    onCreateProject({
      name: form.name.trim(),
      type: form.type,
      platform: platformForProjectType(form.type),
    });
    setForm({ name: '', type: 'mobile' });
    setCreating(false);
  }

  return (
    <div>
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {projects.length} project{projects.length === 1 ? '' : 's'}
        </span>
        <button
          style={creating ? ghostButton : primaryButton(false)}
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? 'Cancel' : '+ New project'}
        </button>
      </div>

      {/* create form (on demand) */}
      {creating && (
        <div
          className="anim-in"
          style={{
            ...card,
            padding: 14,
            background: 'var(--color-background-secondary)',
            marginBottom: 16,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '2 1 200px' }}>
            <label style={labelStyle}>Name</label>
            <input
              style={inputStyle}
              value={form.name}
              autoFocus
              placeholder="e.g. Wellbook Mobile"
              onChange={(e) => set('name', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={form.type} onChange={(e) => set('type', e.target.value)}>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'mobile' ? 'Mobile (Android & iOS)' : 'Web'}
                </option>
              ))}
            </select>
          </div>
          <button
            style={primaryButton(invalid || isSubmitting)}
            disabled={invalid || isSubmitting}
            onClick={create}
          >
            Create
          </button>
        </div>
      )}

      {/* accordion list */}
      {projects.length === 0 ? (
        <div
          style={{
            ...card,
            padding: 28,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
          }}
        >
          No projects yet — create your first one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              releaseCount={releaseCount(p.id)}
              items={checklistItems.filter((c) => c.projectId === p.id)}
              isSubmitting={isSubmitting}
              onUpdate={onUpdateProject}
              onDelete={() => onDeleteProject(p.id)}
              onAddItem={(label, pos) => onAddChecklistItem(p.id, label, pos)}
              onDeleteItem={onDeleteChecklistItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  releaseCount,
  items,
  isSubmitting,
  onUpdate,
  onDelete,
  onAddItem,
  onDeleteItem,
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ name: project.name, type: project.type });
  const [label, setLabel] = useState('');

  const isWeb = project.type === 'web';
  const typeColor = isWeb ? '#f59e0b' : '#22c55e';

  function startEdit(e) {
    e.stopPropagation();
    setEdit({ name: project.name, type: project.type });
    setEditing(true);
    setOpen(true);
  }
  async function saveEdit() {
    if (!edit.name.trim()) return;
    const ok = await onUpdate(project.id, {
      name: edit.name.trim(),
      type: edit.type,
      platform: platformForProjectType(edit.type),
    });
    if (ok) setEditing(false);
  }
  function addItem() {
    if (!label.trim()) return;
    onAddItem(label.trim(), items.length);
    setLabel('');
  }

  const iconBtn = (color) => ({
    ...ghostButton,
    padding: '5px 9px',
    fontSize: 12,
    color,
    borderColor: `${color}44`,
    boxShadow: 'none',
  });

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      {/* header */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', cursor: 'pointer' }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            background: `${typeColor}1a`,
          }}
        >
          {isWeb ? '🌐' : '📱'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{project.name}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {platformLabel(project.platform)} · {releaseCount} release
            {releaseCount === 1 ? '' : 's'} · {items.length} checklist item
            {items.length === 1 ? '' : 's'}
          </div>
        </div>
        <button style={iconBtn('var(--brand)')} onClick={startEdit} disabled={isSubmitting}>
          Edit
        </button>
        <button
          style={iconBtn('#f43f5e')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={isSubmitting}
        >
          Delete
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 12, textAlign: 'center' }}>
          {open ? '▾' : '▸'}
        </span>
      </div>

      {/* expanded */}
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '0.5px solid var(--color-border-primary)' }}>
          {editing && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                padding: '14px 0',
                borderBottom: '0.5px solid var(--color-border-primary)',
                marginBottom: 14,
              }}
            >
              <div style={{ flex: '2 1 180px' }}>
                <label style={labelStyle}>Name</label>
                <input
                  style={inputStyle}
                  value={edit.name}
                  onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label style={labelStyle}>Type</label>
                <select
                  style={inputStyle}
                  value={edit.type}
                  onChange={(e) => setEdit((s) => ({ ...s, type: e.target.value }))}
                >
                  {PROJECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'mobile' ? 'Mobile (Android & iOS)' : 'Web'}
                    </option>
                  ))}
                </select>
              </div>
              <button style={ghostButton} onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                style={primaryButton(!edit.name.trim() || isSubmitting)}
                disabled={!edit.name.trim() || isSubmitting}
                onClick={saveEdit}
              >
                Save
              </button>
            </div>
          )}

          <div style={{ paddingTop: editing ? 0 : 14 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>QA checklist</div>
            {items.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
                No checklist items — QA can mark this release complete without a checklist.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {items.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12.5,
                      padding: '7px 10px',
                      background: 'var(--color-background-secondary)',
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ color: typeColor }}>✓</span>
                    <span style={{ flex: 1 }}>{it.label}</span>
                    <button
                      onClick={() => onDeleteItem(it.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f43f5e',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontFamily: 'inherit',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={label}
                placeholder="e.g. Smoke test passed"
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
              />
              <button style={ghostButton} disabled={!label.trim()} onClick={addItem}>
                Add item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Analytics                                                          */
/* ================================================================== */

function AnalyticsModal({ projects, releases, bugs, onClose, onOpenHistory }) {
  const bugsByRelease = useMemo(() => {
    const m = {};
    bugs.forEach((b) => {
      m[b.releaseId] = (m[b.releaseId] || 0) + 1;
    });
    return m;
  }, [bugs]);

  const rows = projects.map((p) => {
    const rel = releases.filter((r) => r.projectId === p.id);
    const bugCount = rel.reduce((sum, r) => sum + (bugsByRelease[r.id] || 0), 0);

    const completed = rel.filter((r) => r.status === 'qa_complete' && r.qaCompletedAt);
    let avgDays = null;
    if (completed.length) {
      const total = completed.reduce((sum, r) => {
        const start = new Date(r.date).getTime();
        const end = new Date(r.qaCompletedAt).getTime();
        return sum + Math.max(0, end - start);
      }, 0);
      avgDays = total / completed.length / (1000 * 60 * 60 * 24);
    }

    const repeats = rel.filter((r) => r.status === 'bug_repeat').length;
    const repeatRate = rel.length ? (repeats / rel.length) * 100 : 0;

    return { project: p, releaseCount: rel.length, bugCount, avgDays, repeatRate };
  });

  const th = {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    padding: '8px 8px',
    borderBottom: '0.5px solid var(--color-border-primary)',
  };
  const td = { fontSize: 12, padding: '10px 8px', borderBottom: '0.5px solid var(--color-border-primary)' };

  return (
    <ModalShell onClose={onClose} title="Dashboard analytics" maxWidth={620}>
      {projects.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          No projects yet.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Project</th>
                <th style={th}>Releases</th>
                <th style={th}>Bugs</th>
                <th style={th}>Avg QA time</th>
                <th style={th}>Repeat rate</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.project.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{r.project.name}</td>
                  <td style={td}>{r.releaseCount}</td>
                  <td style={td}>{r.bugCount}</td>
                  <td style={td}>
                    {r.avgDays == null ? '—' : `${r.avgDays.toFixed(1)} d`}
                  </td>
                  <td style={td}>{r.repeatRate.toFixed(0)}%</td>
                  <td style={td}>
                    <button
                      onClick={() => onOpenHistory(r.project)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--brand)',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontFamily: 'inherit',
                      }}
                    >
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button style={ghostButton} onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

/* ================================================================== */
/* History + changelog export                                         */
/* ================================================================== */

function buildChangelog(project, releases) {
  const done = releases
    .filter((r) => r.status === 'qa_complete')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const lines = [`# ${project.name} — Changelog`, ''];
  if (done.length === 0) lines.push('_No QA-complete releases yet._');
  done.forEach((r) => {
    lines.push(`## v${r.version} — ${r.date}`);
    lines.push(`Platform: ${r.platform} · Type: ${r.releaseType}`);
    lines.push('');
    lines.push(r.releaseNotes || '_No notes_');
    lines.push('');
  });
  return lines.join('\n');
}

function HistoryModal({ project, releases, showToast, onClose }) {
  const sorted = [...releases].sort((a, b) => (a.date < b.date ? 1 : -1));

  async function copyChangelog() {
    const text = buildChangelog(project, releases);
    try {
      await navigator.clipboard.writeText(text);
      showToast('Changelog copied to clipboard');
    } catch {
      showToast('Clipboard blocked — use Download instead', 'error');
    }
  }

  function downloadChangelog() {
    const text = buildChangelog(project, releases);
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '-').toLowerCase()}-changelog.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ModalShell
      onClose={onClose}
      title={`${project.name} — history`}
      maxWidth={560}
      right={
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ ...ghostButton, padding: '6px 10px', fontSize: 12 }} onClick={copyChangelog}>
            Copy changelog
          </button>
          <button style={{ ...ghostButton, padding: '6px 10px', fontSize: 12 }} onClick={downloadChangelog}>
            Download .md
          </button>
        </div>
      }
    >
      {sorted.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          No releases for this project yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sorted.map((r, i) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderBottom:
                  i === sorted.length - 1
                    ? 'none'
                    : '0.5px solid var(--color-border-primary)',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: STATUSES[r.status]?.color || '#6b7280',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  v{r.version}{' '}
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-secondary)' }}>
                    {RELEASE_TYPES[r.releaseType]?.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  {r.date} · {r.submittedBy}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button style={ghostButton} onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}
