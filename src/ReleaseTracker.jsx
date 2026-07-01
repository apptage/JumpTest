import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient.js';
import * as api from './api.js';
import {
  STATUSES,
  STATUS_ORDER,
  nextStatuses,
  TRANSITION_LABELS,
  isReadOnly,
  isActiveStatus,
  isClosedStatus,
  RELEASE_TYPES,
  RELEASE_TYPE_ORDER,
  PROJECT_TYPES,
  projectTypeLabel,
  RELEASE_PLATFORMS,
  platformsForProjectType,
  RELEASE_TYPES_BY_PLATFORM,
  platformForReleaseType,
  ENVIRONMENTS,
  EDIT_WINDOW_HOURS,
  withinEditWindow,
  slaLevel,
  bugSlaLevel,
  SLA_COLORS,
  SLA_HOURS,
  BUG_SLA_DAYS,
  humanizeSince,
  linkIssue,
  SEVERITIES,
  SEVERITY_ORDER,
  BUG_STATUSES,
  BUG_STATUS_ORDER,
  RELEASE_COMPONENTS,
  BUG_TAGS,
  BUG_FEATURES,
  BUG_RESOLUTIONS,
  WBS_STATUSES,
  WBS_STATUS_ORDER,
  WBS_DEV_STATUSES,
  WBS_TRACKS,
  ROLES,
  TEAM_ASSIGNABLE_ROLES,
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
  IconShieldCheck,
} from './illustrations.jsx';
import { parseWbsFile } from './wbs.js';
import {
  IconSearch,
  IconClock,
  IconCheck,
  IconBug,
  IconPackage,
  IconFolder,
  IconBell,
  IconPower,
  IconPlus,
  IconChart,
  IconSliders,
  IconUpload,
  IconSmartphone,
  IconGlobe,
  IconDownload,
  IconExternal,
  IconUsers,
  IconGrid,
  IconLayers,
  IconTree,
  IconCog,
} from './icons.jsx';

/* ================================================================== */
/* Root                                                               */
/* ================================================================== */

export default function ReleaseTracker() {
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [recovery, setRecovery] = useState(false);

  const [projects, setProjects] = useState([]);
  const [releases, setReleases] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);

  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const [projectFilter, setProjectFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [page, setPage] = useState('dashboard');
  const [showSubmit, setShowSubmit] = useState(false);
  const [editingRelease, setEditingRelease] = useState(null);
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
    // a recovery link sets type=recovery in the URL hash
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      setRecovery(true);
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
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
    api.ensureProfile(session).then((p) => {
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

  const refetchTeams = useCallback(async () => {
    setTeams(await api.fetchTeams());
  }, []);
  const refetchProjectMembers = useCallback(async () => {
    setProjectMembers(await api.fetchProjectMembers());
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, rel, bg, prof, ci, tm, pm] = await Promise.all([
        api.fetchProjects(),
        api.fetchReleases(),
        api.fetchBugs(),
        api.fetchProfiles(),
        api.fetchChecklistItems(),
        api.fetchTeams(),
        api.fetchProjectMembers(),
      ]);
      setProjects(pr);
      setReleases(rel);
      setBugs(bg);
      setProfiles(prof);
      setChecklistItems(ci);
      setTeams(tm);
      setProjectMembers(pm);
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

  /* ---- project-membership scoping (app-level) ----
     Non-admins see only projects they're an active member of (home members of
     their team's projects + temporary support grants on other teams' projects).
     Admins see everything. Expired support grants drop out automatically. */
  const adminScope = user?.role === 'Admin';
  const myTeamId = user?.teamId ?? null;

  const myProjectIds = useMemo(() => {
    const s = new Set();
    projectMembers.forEach((m) => {
      if (m.userId === user?.id && api.membershipActive(m)) s.add(m.projectId);
    });
    return s;
  }, [projectMembers, user?.id]);

  const scopedProjects = useMemo(
    () => (adminScope ? projects : projects.filter((p) => myProjectIds.has(p.id))),
    [projects, adminScope, myProjectIds]
  );
  const scopedProjectIds = useMemo(
    () => new Set(scopedProjects.map((p) => p.id)),
    [scopedProjects]
  );
  const releaseProjectId = useMemo(() => {
    const m = {};
    releases.forEach((r) => (m[r.id] = r.projectId));
    return m;
  }, [releases]);
  const scopedReleases = useMemo(
    () =>
      adminScope
        ? releases
        : releases.filter((r) => scopedProjectIds.has(r.projectId)),
    [releases, adminScope, scopedProjectIds]
  );
  const scopedBugs = useMemo(
    () =>
      adminScope
        ? bugs
        : bugs.filter((b) => scopedProjectIds.has(releaseProjectId[b.releaseId])),
    [bugs, adminScope, scopedProjectIds, releaseProjectId]
  );

  const openBugCountByRelease = useMemo(() => {
    const m = {};
    scopedBugs.forEach((b) => {
      if (b.status === 'open') m[b.releaseId] = (m[b.releaseId] || 0) + 1;
    });
    return m;
  }, [scopedBugs]);

  // releases in the current project + platform + type context (no status filter)
  const contextReleases = scopedReleases.filter(
    (r) =>
      (projectFilter === 'all' || r.projectId === projectFilter) &&
      (platformFilter === 'all' || r.platform === platformFilter) &&
      (typeFilter === 'all' || r.releaseType === typeFilter)
  );

  // stat cards reflect the active context
  const counts = STATUS_ORDER.reduce((acc, key) => {
    acc[key] = contextReleases.filter((r) => r.status === key).length;
    return acc;
  }, {});

  // hide closed (superseded) iterations from the active board unless explicitly filtered
  const filtered = contextReleases.filter((r) =>
    statusFilter === 'all' ? r.status !== 'closed' : r.status === statusFilter
  );

  const unread = notifications.filter((n) => !n.read).length;
  const selected = scopedReleases.find((r) => r.id === selectedId) || null;

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

  async function handleResetRequest(email) {
    await run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
    }, 'Reset link sent — check your email.');
  }

  async function handleSetPassword(password) {
    const ok = await run(async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    }, 'Password updated — you are signed in.');
    if (ok) {
      setRecovery(false);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }

  async function handleSignUp({ name, email, password, role }) {
    setIsSubmitting(true);
    // only Developer / QA are allowed at signup; Admin & Team Lead are
    // assigned later by an admin
    const safeRole = role === 'QA' ? 'QA' : 'Developer';
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim(), role: safeRole },
        // confirmation link returns to wherever the app is running
        // (your Vercel domain in prod, localhost in dev)
        emailRedirectTo: window.location.origin,
      },
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
    setPage('dashboard');
    setHistoryProject(null);
  }

  /* ---- releases ---- */
  async function handleCreateRelease(form) {
    const issue = linkIssue(form.linkUrl);
    if (issue) {
      showToast(issue, 'error');
      return;
    }
    const wbsItems = form.wbsTasks || [];
    const wbsEnabled = !!projectsById[form.projectId]?.wbsEnabled;
    const extraNote = form.additionalNote?.trim() ? `\n\n${form.additionalNote.trim()}` : '';

    const ok = await run(async () => {
      // Follow-up detection: if this developer has a sent-back release for the
      // project, the new submission supersedes it (close it + carry bugs).
      const priorSentBack = await api.fetchSentBackRelease(form.projectId, user.id);

      // Release notes:
      //  - tasks selected → generated from the tasks (feature release)
      //  - WBS project, no tasks, but a prior sent-back release → bug-fix release
      //  - otherwise → the manually-entered notes
      let notes;
      if (wbsItems.length) {
        notes = wbsItems.map((t) => `- ${t.name}`).join('\n') + extraNote;
      } else if (wbsEnabled && priorSentBack) {
        notes = `Bug fixes for v${priorSentBack.version}` + extraNote;
      } else {
        notes = form.releaseNotes.trim();
      }

      const releaseId = await api.createRelease({
        project_id: form.projectId,
        version: form.version.trim(),
        release_type: form.releaseType,
        platform: form.platform || platformForReleaseType(form.releaseType),
        environment: form.environment || 'Production',
        component: form.component || '',
        file_url: '',
        link_url: form.linkUrl.trim(),
        submitted_by: user.name,
        submitted_by_role: user.role,
        submitted_by_id: user.id,
        date: new Date().toISOString().slice(0, 10),
        release_notes: notes,
        status: 'qa_pending',
        qa_note: '',
        supersedes_release_id: priorSentBack ? priorSentBack.id : null,
      });

      if (wbsItems.length) {
        await api.createReleaseTasks(
          releaseId,
          wbsItems.map((t) => ({ taskId: t.id, taskName: t.name, track: form.track || 'both' }))
        );
        // selected tasks move to In QA (locked for developers)
        await api.setWbsTrackStatus(
          wbsItems.map((t) => t.id),
          form.track || 'both',
          'in_qa'
        );
      }

      // Close the superseded release and carry its unresolved bugs forward.
      if (priorSentBack) {
        await api.closeRelease(priorSentBack.id);
        const summary = await api.carryForwardBugs(priorSentBack.id, releaseId);
        if (priorSentBack.assignedQa) {
          await api.createNotification({
            user_id: priorSentBack.assignedQa,
            type: 'release_followup',
            message: `${user.name} submitted a follow-up v${form.version.trim()} for QA — ${summary.pendingVerify} fix(es) to verify, ${summary.unresolved} still open.`,
            release_id: releaseId,
          });
        }
      }
    }, 'Release submitted');
    if (ok) {
      setShowSubmit(false);
      refetchReleases();
      refetchBugs();
    }
  }

  async function handleEditRelease(release, patch) {
    const ok = await run(() => api.updateRelease(release.id, patch), 'Release updated');
    if (ok) {
      setEditingRelease(null);
      refetchReleases();
    }
  }

  async function handleReleaseStatus(release, newStatus, qaNote) {
    const now = new Date().toISOString();
    const patch = { status: newStatus, status_changed_at: now };
    if (qaNote != null) patch.qa_note = qaNote;
    if (newStatus === 'approved') patch.qa_completed_at = now;
    const ok = await run(async () => {
      await api.updateRelease(release.id, patch);
      // WBS reconciliation on the terminal QA outcomes:
      //  approved  → linked tasks Complete (unless they still carry open bugs)
      //  sent_back → linked tasks back to In Progress
      if (newStatus === 'approved' || newStatus === 'sent_back') {
        const links = (await api.fetchReleaseTasks(release.id)).filter((l) => l.taskId);
        const taskIds = [...new Set(links.map((l) => l.taskId))];
        const openByTask =
          newStatus === 'approved' ? await api.fetchOpenBugCountsByTask(taskIds) : {};
        for (const l of links) {
          const target =
            newStatus === 'sent_back' || (openByTask[l.taskId] || 0) > 0
              ? 'in_progress'
              : 'complete';
          await api.setWbsTrackStatus([l.taskId], l.track, target);
        }
      }
    }, 'Release updated');
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
    const patch = { assigned_qa: qaId || null };
    // stamp the first time a tester is assigned (for cycle-time analytics)
    if (qaId && !release.qaAssignedAt) patch.qa_assigned_at = new Date().toISOString();
    const ok = await run(
      () => api.updateRelease(release.id, patch),
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
        feature: form.feature || null,
        tags: form.tags || [],
        wbs_task_id: form.wbsTaskId || null,
        origin_release_id: release.id,
        created_by: user.name,
        created_by_id: user.id,
      });
      // WBS: a bug against a task means it isn't done — pull the
      // verified track(s) back to In Progress.
      if (form.wbsTaskId) {
        const links = await api.fetchReleaseTasks(release.id);
        const tracks = new Set(links.filter((l) => l.taskId === form.wbsTaskId).map((l) => l.track));
        for (const track of tracks) {
          await api.setWbsTrackStatus([form.wbsTaskId], track, 'in_progress');
        }
      }
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

  // When a WBS-linked bug is verified/closed, complete its track(s) if the task
  // no longer has any open bugs across active releases.
  async function reconcileWbsTaskForBug(release, bug) {
    if (!bug.wbsTaskId) return;
    const open = await api.fetchOpenBugCountsByTask([bug.wbsTaskId]);
    if ((open[bug.wbsTaskId] || 0) > 0) return;
    const links = await api.fetchReleaseTasks(release.id);
    const tracks = new Set(links.filter((l) => l.taskId === bug.wbsTaskId).map((l) => l.track));
    for (const track of tracks) {
      await api.setWbsTrackStatus([bug.wbsTaskId], track, 'complete');
    }
  }

  async function handleBugStatus(release, bug, newStatus) {
    const ok = await run(async () => {
      const patch = { status: newStatus };
      if (newStatus === 'verified') {
        patch.resolution = 'Fixed';
        patch.verified_at = new Date().toISOString();
        patch.verified_by_id = user.id;
      }
      await api.updateBug(bug.id, patch);
      if (newStatus === 'verified') await reconcileWbsTaskForBug(release, bug);
      if (newStatus === 'fixed') {
        await api.createNotification({
          user_id: bug.createdById,
          type: 'bug_fixed',
          message: `${user.name} marked bug "${bug.title}" as fixed on v${release.version}`,
          release_id: release.id,
        });
      }
      if (newStatus === 'disputed') {
        // ping the other side that clarification is needed
        const other = bug.createdById === user.id ? release.submittedById : bug.createdById;
        await api.createNotification({
          user_id: other,
          type: 'bug_disputed',
          message: `${user.name} needs clarification on bug "${bug.title}" (v${release.version})`,
          release_id: release.id,
        });
      }
    });
    if (ok) refetchBugs();
  }

  async function handleBugResolve(release, bug, resolution) {
    const ok = await run(async () => {
      await api.updateBug(bug.id, {
        status: 'verified',
        resolution,
        verified_at: new Date().toISOString(),
        verified_by_id: user.id,
      });
      await reconcileWbsTaskForBug(release, bug);
    }, 'Bug closed');
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
    const ok = await run(async () => {
      const projectId = await api.createProject(p);
      // creator becomes the project's first (home) member so it's visible to them
      if (projectId && user.role !== 'Admin') {
        await api.addProjectMember({
          project_id: projectId,
          user_id: user.id,
          project_role: user.role === 'Team Lead' ? 'lead' : 'developer',
          access_type: 'home',
          granted_by: user.id,
        });
      }
    }, 'Project created');
    if (ok) {
      refetchProjects();
      refetchProjectMembers();
    }
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
  /* ---- project members ---- */
  async function handleAddMember(payload) {
    const ok = await run(
      () => api.addProjectMember({ ...payload, granted_by: user.id }),
      'Member added'
    );
    if (ok) refetchProjectMembers();
  }
  async function handleUpdateMember(id, patch) {
    const ok = await run(() => api.updateProjectMember(id, patch), 'Member updated');
    if (ok) refetchProjectMembers();
  }
  async function handleRemoveMember(id) {
    const ok = await run(() => api.removeProjectMember(id), 'Member removed');
    if (ok) refetchProjectMembers();
  }
  async function handleDeleteChecklistItem(id) {
    const ok = await run(() => api.deleteChecklistItem(id));
    if (ok) refetchChecklist();
  }

  /* ---- teams + members (admin / team lead) ---- */
  async function handleCreateTeam(name) {
    const ok = await run(() => api.createTeam(name), 'Team created');
    if (ok) refetchTeams();
  }
  async function handleDeleteTeam(id) {
    if (
      !window.confirm(
        'Delete this team? Its members and projects become unassigned (visible only to admins).'
      )
    )
      return;
    const ok = await run(() => api.deleteTeam(id), 'Team deleted');
    if (ok) {
      refetchTeams();
      refetchProfiles();
      refetchProjects();
    }
  }
  async function handleCreateUser(payload) {
    const ok = await run(() => api.adminCreateUser(payload), 'Account created');
    if (ok) refetchProfiles();
    return ok;
  }
  async function handleUpdateMember(id, patch) {
    const ok = await run(() => api.updateProfile(id, patch), 'Member updated');
    if (ok) refetchProfiles();
    return ok;
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

  if (recovery)
    return (
      <>
        <SetPasswordScreen isSubmitting={isSubmitting} onSetPassword={handleSetPassword} />
        <Toast toast={toast} />
      </>
    );

  if (!session)
    return (
      <>
        <AuthScreen
          isSubmitting={isSubmitting}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onResetRequest={handleResetRequest}
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
  const isLead = user.role === 'Team Lead';
  const canManage = isAdmin || isLead; // can open the Manage panel
  const canSubmit = user.role === 'Developer' || isLead || isAdmin;
  const myTeam = teams.find((t) => t.id === myTeamId) || null;

  // manager rights on the selected release (admin everywhere; lead in own team)
  const selProjectTeam = selected ? projectsById[selected.projectId]?.teamId : null;
  const isManagerOfSelected =
    isAdmin || (isLead && selProjectTeam && selProjectTeam === myTeamId);

  const teamsById = {};
  teams.forEach((t) => (teamsById[t.id] = t));
  const visibleProfiles = isAdmin ? profiles : profiles.filter((p) => p.teamId === myTeamId);

  return (
    <div className="nav-layout">
      <NavRail
        page={page}
        onNavigate={setPage}
        user={user}
        teamName={isAdmin ? null : myTeam?.name}
        canManage={canManage}
        isAdmin={isAdmin}
      />

      <div className="nav-main">
        <Header
          user={user}
          page={page}
          canSubmit={canSubmit}
          canManage={canManage}
          isAdmin={isAdmin}
          unread={unread}
          notifOpen={showNotif}
          notifications={notifications}
          projects={scopedProjects}
          releases={scopedReleases}
          bugs={scopedBugs}
          projectsById={projectsById}
          onToggleNotif={handleOpenNotif}
          onNotifClick={(n) => {
            handleNotifClick(n);
            if (n.releaseId) setPage('dashboard');
          }}
          onMarkAllRead={handleMarkAllRead}
          onSubmitClick={() => setShowSubmit(true)}
          onNewProject={() => setPage('projects')}
          onInviteUser={() => setPage('users')}
          onOpenRelease={(id) => {
            setSelectedId(id);
            setPage('dashboard');
          }}
          onNavigate={setPage}
          onSettings={() => setPage('settings')}
          onSignOut={handleSignOut}
        />

        {page === 'dashboard' && (
          <div className="app-shell">
            <aside className="shell-aside shell-left">
              <Sidebar
                projects={scopedProjects}
                releases={scopedReleases}
                teamName={isAdmin ? null : myTeam?.name}
                openBugTotal={scopedBugs.filter((b) => b.status === 'open').length}
                disputedTotal={scopedBugs.filter((b) => b.status === 'disputed').length}
                projectFilter={projectFilter}
                platformFilter={platformFilter}
                onSelect={(pid, plat) => {
                  setProjectFilter(pid);
                  setPlatformFilter(plat);
                }}
              />
            </aside>

            <main style={{ minWidth: 0 }}>
              <div style={{ marginBottom: 18 }}>
                <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0 }}>
                  {greeting()}, {user.name.split(/[\s_]+/)[0]}
                </h1>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                  {scopedReleases.length} release{scopedReleases.length === 1 ? '' : 's'} ·{' '}
                  {scopedProjects.length} project{scopedProjects.length === 1 ? '' : 's'} ·{' '}
                  {scopedBugs.filter((b) => b.status === 'open').length} open bug
                  {scopedBugs.filter((b) => b.status === 'open').length === 1 ? '' : 's'}
                </p>
              </div>

              <StatCards counts={counts} />

              <FilterBar
                projects={scopedProjects}
                projectFilter={projectFilter}
                platformFilter={platformFilter}
                typeFilter={typeFilter}
                statusFilter={statusFilter}
                onProject={setProjectFilter}
                onPlatform={setPlatformFilter}
                onType={setTypeFilter}
                onStatus={setStatusFilter}
                count={filtered.length}
              />

              {loading ? (
                <Empty>Loading releases…</Empty>
              ) : filtered.length === 0 ? (
                <Empty>
                  {scopedReleases.length === 0
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
                      assignedName={r.assignedQa ? profilesById[r.assignedQa]?.name : null}
                      onClick={() => setSelectedId(r.id)}
                    />
                  ))}
                </div>
              )}
            </main>

            <aside className="shell-aside shell-right">
              <RightPanel
                releases={scopedReleases}
                bugs={scopedBugs}
                canSubmit={canSubmit}
                canManage={canManage}
                onSubmit={() => setShowSubmit(true)}
                onAdmin={() => setPage('projects')}
                onAnalytics={() => setPage('analytics')}
                onOpenRelease={(id) => setSelectedId(id)}
              />
            </aside>
          </div>
        )}

        {page !== 'dashboard' && (
          <div className="page-area anim-in">
            {page === 'projects' && canManage && (
              <>
                <PageHeader title="Projects" subtitle="Create and manage projects and QA checklists" />
                <ProjectsTab
                  isAdmin={isAdmin}
                  user={user}
                  myTeamId={myTeamId}
                  teams={teams}
                  teamsById={teamsById}
                  projects={scopedProjects}
                  releases={scopedReleases}
                  checklistItems={checklistItems}
                  profiles={profiles}
                  projectMembers={projectMembers}
                  isSubmitting={isSubmitting}
                  onCreateProject={handleCreateProject}
                  onUpdateProject={handleUpdateProject}
                  onDeleteProject={handleDeleteProject}
                  onAddChecklistItem={handleAddChecklistItem}
                  onDeleteChecklistItem={handleDeleteChecklistItem}
                  onAddMember={handleAddMember}
                  onUpdateMember={handleUpdateMember}
                  onRemoveMember={handleRemoveMember}
                />
              </>
            )}

            {page === 'bugs' && (
              <BugsPage
                bugs={scopedBugs}
                releases={scopedReleases}
                projects={scopedProjects}
                projectsById={projectsById}
                profilesById={profilesById}
                profiles={profiles}
                teams={isAdmin ? teams : teams.filter((t) => t.id === myTeamId)}
                isAdmin={isAdmin}
                onOpenRelease={(id) => {
                  setSelectedId(id);
                  setPage('dashboard');
                }}
              />
            )}

            {page === 'wbs' && (
              <WbsPage user={user} projects={scopedProjects} showToast={showToast} />
            )}

            {page === 'analytics' && canManage && (
              <AnalyticsModal
                embedded
                projects={scopedProjects}
                releases={scopedReleases}
                bugs={scopedBugs}
                profiles={profiles}
                teams={isAdmin ? teams : teams.filter((t) => t.id === myTeamId)}
                isAdmin={isAdmin}
                onOpenHistory={(p) => setHistoryProject(p)}
              />
            )}

            {page === 'users' && canManage && (
              <>
                <PageHeader title={isAdmin ? 'Users' : 'Team members'} subtitle="Manage roles, teams and accounts" />
                <UsersTab
                  currentUser={user}
                  isAdmin={isAdmin}
                  myTeamId={myTeamId}
                  profiles={visibleProfiles}
                  teams={teams}
                  teamsById={teamsById}
                  isSubmitting={isSubmitting}
                  showToast={showToast}
                  onUpdateMember={handleUpdateMember}
                  onCreateUser={handleCreateUser}
                  refetchProfiles={refetchProfiles}
                />
              </>
            )}

            {page === 'teams' && isAdmin && (
              <>
                <PageHeader title="Teams" subtitle="Create teams and assign leads" />
                <TeamsTab
                  teams={teams}
                  profiles={profiles}
                  projects={projects}
                  isSubmitting={isSubmitting}
                  onCreateTeam={handleCreateTeam}
                  onDeleteTeam={handleDeleteTeam}
                />
              </>
            )}

            {page === 'settings' && (
              <SettingsPage user={user} team={myTeam} onSignOut={handleSignOut} />
            )}
          </div>
        )}

      {showSubmit && (
        <SubmitModal
          projects={scopedProjects}
          sentBackReleases={releases.filter(
            (r) => r.status === 'sent_back' && r.submittedById === user.id
          )}
          bugs={bugs}
          isSubmitting={isSubmitting}
          onClose={() => setShowSubmit(false)}
          onSubmit={handleCreateRelease}
        />
      )}

      {editingRelease && (
        <EditReleaseModal
          release={editingRelease}
          project={projectsById[editingRelease.projectId]}
          isSubmitting={isSubmitting}
          onClose={() => setEditingRelease(null)}
          onSave={(patch) => handleEditRelease(editingRelease, patch)}
        />
      )}

      {historyProject && (
        <HistoryModal
          project={historyProject}
          releases={scopedReleases.filter((r) => r.projectId === historyProject.id)}
          showToast={showToast}
          onClose={() => setHistoryProject(null)}
        />
      )}

      {selected && (
        <DetailModal
          release={selected}
          project={projectsById[selected.projectId]}
          user={user}
          isManager={isManagerOfSelected}
          profiles={profiles}
          profilesById={profilesById}
          projectMembers={projectMembers}
          bugs={bugs.filter((b) => b.releaseId === selected.id)}
          supersedesRelease={releases.find((r) => r.id === selected.supersedesReleaseId) || null}
          supersededByRelease={releases.find((r) => r.supersedesReleaseId === selected.id) || null}
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
          onEdit={(r) => setEditingRelease(r)}
          onAddBug={handleAddBug}
          onBugStatus={handleBugStatus}
          onBugResolve={handleBugResolve}
          onDeleteBug={handleDeleteBug}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
        />
      )}

        <Toast toast={toast} />
      </div>
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
/* Navigation rail + pages                                            */
/* ================================================================== */

function NavRail({ page, onNavigate, teamName, canManage, isAdmin }) {
  const items = [
    { key: 'dashboard', label: 'Dashboard', Icon: IconGrid, show: true },
    { key: 'bugs', label: 'Bugs', Icon: IconBug, show: true },
    { key: 'wbs', label: 'WBS', Icon: IconTree, show: true },
    { key: 'projects', label: 'Projects', Icon: IconFolder, show: canManage },
    { key: 'analytics', label: 'Analytics', Icon: IconChart, show: canManage },
    { key: 'users', label: isAdmin ? 'Users' : 'Team', Icon: IconUsers, show: canManage },
    { key: 'teams', label: 'Teams', Icon: IconLayers, show: isAdmin },
    { key: 'settings', label: 'Settings', Icon: IconCog, show: true },
  ].filter((i) => i.show);

  return (
    <nav className="nav-rail">
      <div style={{ padding: '2px 8px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <Logo size={26} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15.5 }}>
          Jump<span style={{ color: 'var(--brand)' }}>Test</span>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((it) => {
          const active = page === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onNavigate(it.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 11px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                textAlign: 'left',
                background: active ? 'var(--brand-soft)' : 'transparent',
                color: active ? 'var(--brand)' : 'var(--color-text-secondary)',
              }}
            >
              <it.Icon size={17} />
              {it.label}
            </button>
          );
        })}
      </div>
      {teamName && (
        <div
          style={{
            marginTop: 14,
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            padding: '0 11px',
          }}
        >
          Team · <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{teamName}</span>
        </div>
      )}
    </nav>
  );
}

function PageHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>
      {subtitle && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>{subtitle}</p>
      )}
    </div>
  );
}

function BugsPage({ bugs, releases, projects, projectsById, profilesById, profiles, teams, isAdmin, onOpenRelease }) {
  const relById = useMemo(() => {
    const m = {};
    releases.forEach((r) => (m[r.id] = r));
    return m;
  }, [releases]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [sev, setSev] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [tag, setTag] = useState('all');
  const [feature, setFeature] = useState('all');
  const [project, setProject] = useState('all');
  const [team, setTeam] = useState('all');
  const [developer, setDeveloper] = useState('all');
  const [qa, setQa] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [visible, setVisible] = useState(20);

  const devs = (profiles || []).filter((p) => p.role !== 'QA');
  const qas = (profiles || []).filter((p) => p.role === 'QA');

  const term = q.trim().toLowerCase();
  const filtered = bugs
    .filter((b) => {
      const rel = relById[b.releaseId];
      if (!rel) return false;
      const proj = projectsById[rel.projectId];
      if (status !== 'all' && b.status !== status) return false;
      if (sev !== 'all' && b.severity !== sev) return false;
      if (platform !== 'all' && rel.platform !== platform) return false;
      if (tag !== 'all' && !b.tags.includes(tag)) return false;
      if (feature !== 'all' && (b.feature || 'Unassigned') !== feature) return false;
      if (project !== 'all' && rel.projectId !== project) return false;
      if (team !== 'all' && (proj?.teamId || '') !== team) return false;
      if (developer !== 'all' && rel.submittedById !== developer) return false;
      if (qa !== 'all' && rel.assignedQa !== qa) return false;
      if (from && (b.createdAt || '').slice(0, 10) < from) return false;
      if (to && (b.createdAt || '').slice(0, 10) > to) return false;
      if (term) {
        const name = proj?.name || '';
        if (!b.title.toLowerCase().includes(term) && !name.toLowerCase().includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) =>
      sort === 'oldest'
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  const pageBugs = filtered.slice(0, visible);

  // aging: open bugs sorted oldest-first, those at/over SLA highlighted
  const aging = bugs
    .filter((b) => {
      const rel = relById[b.releaseId];
      return rel && b.status !== 'verified' && bugSlaLevel(b.status, b.createdAt);
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 6);

  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };
  const th = {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    padding: '8px 10px',
    borderBottom: '1px solid var(--color-border-primary)',
  };
  const td = { fontSize: 12.5, padding: '10px', borderBottom: '1px solid var(--color-border-primary)' };

  return (
    <>
      <PageHeader title="Bugs" subtitle={`${filtered.length} bug${filtered.length === 1 ? '' : 's'} across your releases`} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          style={{ ...inputStyle, flex: '1 1 200px', width: 'auto' }}
          value={q}
          placeholder="Search bugs or projects…"
          onChange={(e) => {
            setQ(e.target.value);
            setVisible(20);
          }}
        />
        <select style={fSel} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {BUG_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {BUG_STATUSES[s].label}
            </option>
          ))}
        </select>
        <select style={fSel} value={sev} onChange={(e) => setSev(e.target.value)}>
          <option value="all">All severities</option>
          {SEVERITY_ORDER.map((s) => (
            <option key={s} value={s}>
              {SEVERITIES[s].label}
            </option>
          ))}
        </select>
        <select style={fSel} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="all">All platforms</option>
          {RELEASE_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select style={fSel} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="all">All tags</option>
          {BUG_TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select style={fSel} value={feature} onChange={(e) => setFeature(e.target.value)}>
          <option value="all">All features</option>
          {BUG_FEATURES.map((ft) => (
            <option key={ft} value={ft}>
              {ft}
            </option>
          ))}
        </select>
        <select style={fSel} value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="all">All projects</option>
          {(projects || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {isAdmin && (
          <select style={fSel} value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All teams</option>
            {(teams || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select style={fSel} value={developer} onChange={(e) => setDeveloper(e.target.value)}>
          <option value="all">All developers</option>
          {devs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select style={fSel} value={qa} onChange={(e) => setQa(e.target.value)}>
          <option value="all">All QA</option>
          {qas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input style={fSel} type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <input style={fSel} type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        <select style={fSel} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {aging.length > 0 && (
        <div style={{ ...card, padding: 14, marginBottom: 16 }}>
          <div style={{ ...sideHead, marginBottom: 10, color: 'var(--danger)' }}>
            Aging issues — needs immediate attention
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aging.map((b) => {
              const rel = relById[b.releaseId];
              return (
                <div
                  key={b.id}
                  onClick={() => onOpenRelease(b.releaseId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '9px 11px',
                    background: 'var(--color-background-secondary)',
                    border: '1px solid var(--color-border-tertiary)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <SlaBadge level={bugSlaLevel(b.status, b.createdAt)} />
                  <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, minWidth: 0 }}>{b.title}</span>
                  <SeverityBadge severity={b.severity} />
                  <BugStatusBadge status={b.status} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    open {humanizeSince(b.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <Empty>No bugs match your filters.</Empty>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Bug</th>
                <th style={th}>Severity</th>
                <th style={th}>Status</th>
                <th style={th}>Feature · Tags</th>
                <th style={th}>Project · Platform</th>
                <th style={th}>Release</th>
                <th style={th}>Reported</th>
              </tr>
            </thead>
            <tbody>
              {pageBugs.map((b) => {
                const rel = relById[b.releaseId];
                const proj = projectsById[rel.projectId];
                return (
                  <tr
                    key={b.id}
                    onClick={() => onOpenRelease(b.releaseId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ ...td, fontWeight: 500 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <SlaBadge level={bugSlaLevel(b.status, b.createdAt)} />
                        {b.title}
                      </span>
                    </td>
                    <td style={td}>
                      <SeverityBadge severity={b.severity} />
                    </td>
                    <td style={td}>
                      <BugStatusBadge status={b.status} />
                    </td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                        {b.feature && <TagChip label={b.feature} tone="brand" />}
                        {b.tags.slice(0, 2).map((t) => (
                          <TagChip key={t} label={t} />
                        ))}
                        {b.tags.length > 2 && (
                          <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
                            +{b.tags.length - 2}
                          </span>
                        )}
                        {!b.feature && b.tags.length === 0 && (
                          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                      </span>
                    </td>
                    <td style={td}>
                      {proj?.name || '—'} · {rel.platform}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>v{rel.version}</td>
                    <td style={td}>{humanizeSince(b.createdAt)} ago</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible < filtered.length && (
            <div style={{ padding: 10 }}>
              <button style={{ ...ghostButton, width: '100%' }} onClick={() => setVisible((v) => v + 20)}>
                Load more ({filtered.length - visible} left)
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SettingsPage({ user, team, onSignOut }) {
  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--color-border-primary)' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and workspace" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ ...sideHead, marginBottom: 10 }}>Profile</div>
          {row('Name', user.name)}
          {row('Email', user.email)}
          {row('Role', user.role)}
          {row('Team', team ? team.name : '—')}
          <button
            style={{ ...ghostButton, color: '#dc2626', borderColor: '#dc262644', marginTop: 14 }}
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ ...sideHead, marginBottom: 10 }}>About SLAs</div>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Releases pending more than {SLA_HOURS.pending}h or in QA beyond {SLA_HOURS.in_qa}h, and bugs open longer
            than {BUG_SLA_DAYS} days, are flagged with amber (approaching) or red (overdue) indicators across the app.
            Developers can edit or delete their own releases for {EDIT_WINDOW_HOURS}h after submission.
          </p>
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/* WBS page (internal view + import + developer editing)              */
/* ================================================================== */

function WbsBadge({ status }) {
  const s = WBS_STATUSES[status] || { label: status, color: '#64748b' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        color: s.color,
        background: `${s.color}1a`,
        border: `1px solid ${s.color}33`,
        padding: '2px 8px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}

function wbsPct(tasks) {
  // each task counts backend + frontend as two units
  let done = 0;
  let total = 0;
  tasks.forEach((t) => {
    total += 2;
    if (t.backendStatus === 'complete') done += 1;
    if (t.frontendStatus === 'complete') done += 1;
  });
  return total ? Math.round((done / total) * 100) : 0;
}

// derive a section/group target date = the latest parseable est date of its tasks
function latestEst(tasks) {
  let best = null;
  let bestStr = '';
  tasks.forEach((t) => {
    const s = t.estDate || t.est_date || t.est || '';
    if (!s) return;
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) {
      if (!best && !bestStr) bestStr = s; // keep a free-form target if nothing parses
      return;
    }
    if (best == null || ms > best) {
      best = ms;
      bestStr = s;
    }
  });
  return bestStr;
}

function WbsTrackCell({ status, locked, canEdit, onChange }) {
  if (locked || !canEdit) return <WbsBadge status={status} />;
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, width: 'auto', padding: '4px 6px', fontSize: 11.5 }}
    >
      {WBS_DEV_STATUSES.map((s) => (
        <option key={s} value={s}>
          {WBS_STATUSES[s].label}
        </option>
      ))}
    </select>
  );
}

function WbsTaskRow({ task, canEdit, onUpdate, bugs = [] }) {
  const [editing, setEditing] = useState(false);
  const [c, setC] = useState(task.devComments);
  const beLocked = task.backendStatus === 'in_qa' || task.backendStatus === 'complete';
  const feLocked = task.frontendStatus === 'in_qa' || task.frontendStatus === 'complete';
  return (
    <div style={{ padding: '9px 12px', borderTop: '1px solid var(--color-border-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 140 }}>
          {task.name}
          {bugs.length > 0 && (
            <span
              title={`${bugs.length} open bug(s) on this task`}
              style={{
                marginLeft: 8,
                fontSize: 10.5,
                fontWeight: 700,
                color: 'var(--danger)',
                background: '#dc26261a',
                borderRadius: 999,
                padding: '1px 7px',
              }}
            >
              {bugs.length} bug{bugs.length === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--color-text-secondary)', width: 56 }}>BE</span>
        <WbsTrackCell
          status={task.backendStatus}
          locked={beLocked}
          canEdit={canEdit}
          onChange={(v) => onUpdate(task, { backend_status: v })}
        />
        <span style={{ fontSize: 10.5, color: 'var(--color-text-secondary)', width: 56 }}>FE</span>
        <WbsTrackCell
          status={task.frontendStatus}
          locked={feLocked}
          canEdit={canEdit}
          onChange={(v) => onUpdate(task, { frontend_status: v })}
        />
        {task.estDate && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{task.estDate}</span>
        )}
      </div>
      <div style={{ marginTop: 6 }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', fontSize: 12 }}
              rows={2}
              value={c}
              placeholder="Developer comment (internal)…"
              onChange={(e) => setC(e.target.value)}
            />
            <button
              style={ghostButton}
              onClick={() => {
                onUpdate(task, { dev_comments: c });
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
            {task.devComments ? (
              <span>
                <span style={{ fontWeight: 600 }}>Note: </span>
                {task.devComments}{' '}
              </span>
            ) : null}
            {canEdit && (
              <button
                onClick={() => {
                  setC(task.devComments);
                  setEditing(true);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', padding: 0 }}
              >
                {task.devComments ? 'edit' : '+ add note'}
              </button>
            )}
          </div>
        )}
      </div>
      {bugs.length > 0 && (
        <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bugs.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: (SEVERITIES[b.severity] || {}).color || 'var(--danger)',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--color-text-secondary)', flex: 1 }}>{b.title}</span>
              <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
                {(BUG_STATUSES[b.status] || {}).label || b.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WbsPage({ user, projects, showToast }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [tasks, setTasks] = useState([]);
  const [bugsByTask, setBugsByTask] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [q, setQ] = useState('');
  const fileRef = useRef(null);

  const project = projects.find((p) => p.id === projectId) || null;
  const canUpload = user.role === 'Team Lead' && project && project.teamId === user.teamId;
  const isManager =
    user.role === 'Admin' || (user.role === 'Team Lead' && project && project.teamId === user.teamId);
  const canEdit = user.role === 'Developer' || isManager;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const t = await api.fetchWbsTasks(projectId);
      setTasks(t);
      try {
        const linked = await api.fetchBugsByTaskIds(t.map((x) => x.id));
        const m = {};
        linked.forEach((b) => (m[b.wbsTaskId] = m[b.wbsTaskId] || []).push(b));
        setBugsByTask(m);
      } catch (_) {
        setBugsByTask({});
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseWbsFile(file);
      if (!parsed.length) throw new Error('No tasks detected in the spreadsheet.');
      const n = await api.importWbs(projectId, parsed);
      showToast(`Imported ${n} WBS rows`);
      await load();
    } catch (err) {
      showToast(err.message || 'Import failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(task, patch) {
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...mapPatch(patch) } : t)));
    try {
      await api.updateWbsTask(task.id, patch);
    } catch (e) {
      showToast(e.message, 'error');
      load();
    }
  }
  function mapPatch(p) {
    const m = {};
    if ('backend_status' in p) m.backendStatus = p.backend_status;
    if ('frontend_status' in p) m.frontendStatus = p.frontend_status;
    if ('dev_comments' in p) m.devComments = p.dev_comments;
    return m;
  }

  const platforms = Array.from(new Set(tasks.map((t) => t.platform).filter(Boolean)));
  const matches = (t) =>
    (platform === 'all' || t.platform === platform) &&
    (statusF === 'all' || t.backendStatus === statusF || t.frontendStatus === statusF) &&
    (!q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()));

  const workTasks = tasks.filter((t) => t.type !== 'milestone' && matches(t));
  const milestones = tasks.filter((t) => t.type === 'milestone' && matches(t));

  // group by platform → section
  const groups = {};
  workTasks.forEach((t) => {
    const pk = t.platform || 'General';
    const sk = t.section || 'General';
    groups[pk] = groups[pk] || {};
    groups[pk][sk] = groups[pk][sk] || [];
    groups[pk][sk].push(t);
  });

  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };

  return (
    <>
      <PageHeader title="WBS" subtitle="Work breakdown structure & live progress" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <select style={fSel} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.wbsEnabled ? '• WBS' : ''}
            </option>
          ))}
        </select>
        {platforms.length > 1 && (
          <select style={fSel} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="all">All platforms</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        <select style={fSel} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="all">All statuses</option>
          {WBS_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {WBS_STATUSES[s].label}
            </option>
          ))}
        </select>
        <input style={{ ...fSel, flex: '1 1 160px' }} value={q} placeholder="Search tasks…" onChange={(e) => setQ(e.target.value)} />
        {canUpload && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
            <button style={primaryButton(busy)} disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Importing…' : tasks.length ? 'Re-import WBS' : 'Upload WBS'}
            </button>
          </>
        )}
      </div>

      {/* overall progress */}
      {tasks.length > 0 && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Overall progress</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>
              {wbsPct(tasks.filter((t) => t.type !== 'milestone'))}%
            </span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${wbsPct(tasks.filter((t) => t.type !== 'milestone'))}%`,
                height: '100%',
                borderRadius: 999,
                background: 'var(--brand)',
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : tasks.length === 0 ? (
        <Empty>
          {canUpload
            ? 'No WBS yet — upload an Excel/CSV to get started.'
            : project?.wbsEnabled
            ? 'No tasks match your filters.'
            : 'This project does not use a WBS. The Team Lead can upload one.'}
        </Empty>
      ) : (
        <>
          {Object.entries(groups).map(([pk, sections]) => (
            <div key={pk} style={{ marginBottom: 18 }}>
              {platforms.length > 1 && (
                <div style={{ ...sideHead, marginBottom: 8 }}>{pk}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(sections).map(([sk, ts]) => (
                  <WbsSection key={sk} name={sk} tasks={ts} canEdit={canEdit} onUpdate={updateTask} bugsByTask={bugsByTask} />
                ))}
              </div>
            </div>
          ))}

          {milestones.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ ...sideHead, marginBottom: 8 }}>Milestones</div>
              <div style={{ ...card, padding: '4px 0' }}>
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 14px',
                      borderTop: '1px solid var(--color-border-primary)',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{m.name}</span>
                    {m.estDate && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{m.estDate}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function WbsSection({ name, tasks, canEdit, onUpdate, bugsByTask }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 10 }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{name}</span>
        {latestEst(tasks) && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            Target {latestEst(tasks)}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · {wbsPct(tasks)}%
        </span>
      </div>
      {open &&
        tasks.map((t) => (
          <WbsTaskRow key={t.id} task={t} canEdit={canEdit} onUpdate={onUpdate} bugs={(bugsByTask || {})[t.id] || []} />
        ))}
    </div>
  );
}

/* ================================================================== */
/* Auth                                                               */
/* ================================================================== */

function AuthScreen({ isSubmitting, onSignIn, onSignUp, onResetRequest }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Developer');

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';
  const domainBad = email.trim().length > 0 && !emailDomainOk(email);
  const invalid = isReset
    ? !email.trim() || domainBad
    : !email.trim() || domainBad || password.length < 6 || (isSignup && !name.trim());

  function submit() {
    if (invalid || isSubmitting) return;
    if (isReset) onResetRequest(email);
    else if (isSignup) onSignUp({ name, email, password, role });
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
            background: 'var(--ink-2)',
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
            {isReset ? 'Reset password' : isSignup ? 'Create your account' : 'Welcome back'}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              marginBottom: 20,
            }}
          >
            {isReset
              ? 'We’ll email you a link to set a new password.'
              : isSignup
              ? 'Join your team on JumpTest'
              : 'Sign in to continue'}
          </div>

          {!isReset && (
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
          )}

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

        {isSignup && (
          <Field label="Role">
            <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="Developer">Developer</option>
              <option value="QA">QA</option>
            </select>
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

        {!isReset && (
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
        )}

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
            : !isReset && password.length > 0 && password.length < 6
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
              : isReset
              ? 'Send reset link'
              : isSignup
              ? 'Create account'
              : 'Sign in'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12.5 }}>
            {isReset ? (
              <button onClick={() => setMode('signin')} style={authLink}>
                ← Back to sign in
              </button>
            ) : (
              !isSignup && (
                <button onClick={() => setMode('reset')} style={authLink}>
                  Forgot password?
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const authLink = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--brand)',
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function SetPasswordScreen({ isSubmitting, onSetPassword }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const mismatch = pw2.length > 0 && pw !== pw2;
  const invalid = pw.length < 6 || pw !== pw2;
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
      <div className="anim-in" style={{ ...card, width: '100%', maxWidth: 380, padding: 32, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Logo size={28} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
            Jump<span style={{ color: 'var(--brand)' }}>Test</span>
          </span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Set a new password</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
          Choose a new password for your account.
        </div>
        <Field label="New password">
          <input
            style={inputStyle}
            type="password"
            value={pw}
            autoFocus
            placeholder="At least 6 characters"
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        <Field label="Confirm password">
          <input
            style={{ ...inputStyle, borderColor: mismatch ? '#dc2626' : 'var(--color-border-tertiary)' }}
            type="password"
            value={pw2}
            placeholder="Re-enter password"
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !invalid && onSetPassword(pw)}
          />
        </Field>
        <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 14, minHeight: 14 }}>
          {mismatch ? 'Passwords do not match.' : pw.length > 0 && pw.length < 6 ? 'At least 6 characters.' : ''}
        </div>
        <button
          style={{ ...primaryButton(invalid || isSubmitting), width: '100%', padding: '11px 16px' }}
          disabled={invalid || isSubmitting}
          onClick={() => onSetPassword(pw)}
        >
          {isSubmitting ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Public client dashboard (read-only, no login)                      */
/* ================================================================== */

const CLIENT_STATUS = {
  qa_pending: { label: 'In development', color: '#d97706' },
  qa_in_progress: { label: 'In testing', color: '#2563eb' },
  qa_done: { label: 'In review', color: '#7c3aed' },
  approved: { label: 'Completed', color: '#16a34a' },
  sent_back: { label: 'Resolving issues', color: '#dc2626' },
  closed: { label: 'Superseded', color: '#64748b' },
};

function publicWbsPct(items) {
  let done = 0;
  let total = 0;
  items.forEach((t) => {
    total += 2;
    if (t.backend === 'complete') done += 1;
    if (t.frontend === 'complete') done += 1;
  });
  return total ? Math.round((done / total) * 100) : 0;
}

function ClientWbsView({ wbs }) {
  const work = wbs.filter((t) => t.type !== 'milestone');
  const milestones = wbs.filter((t) => t.type === 'milestone');
  const pct = publicWbsPct(work);
  const platforms = Array.from(new Set(work.map((t) => t.platform).filter(Boolean)));

  const groups = {};
  work.forEach((t) => {
    const pk = t.platform || 'General';
    const sk = t.section || 'General';
    (groups[pk] = groups[pk] || {});
    (groups[pk][sk] = groups[pk][sk] || []).push(t);
  });

  const taskRow = (t, i, arr) => (
    <div
      key={i}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 0',
        borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--color-border-primary)',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 13, flex: 1, minWidth: 140 }}>{t.name}</span>
      <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>Backend</span>
      <WbsBadge status={t.backend} />
      <span style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>Frontend</span>
      <WbsBadge status={t.frontend} />
      {t.est && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{t.est}</span>}
    </div>
  );

  return (
    <div>
      <div style={{ ...card, padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Overall progress</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{pct}%</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--brand)' }} />
        </div>
      </div>

      {Object.entries(groups).map(([pk, sections]) => (
        <div key={pk} style={{ marginBottom: 18 }}>
          {platforms.length > 1 && <div style={{ ...sideHead, marginBottom: 8 }}>{pk}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(sections).map(([sk, ts]) => (
              <div key={sk} style={{ ...card, padding: '4px 16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '11px 0 6px',
                    borderBottom: '1px solid var(--color-border-primary)',
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{sk}</span>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    {latestEst(ts) && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Target {latestEst(ts)}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{publicWbsPct(ts)}%</span>
                  </span>
                </div>
                {ts.map(taskRow)}
              </div>
            ))}
          </div>
        </div>
      ))}

      {milestones.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ ...sideHead, marginBottom: 8 }}>Milestones</div>
          <div style={{ ...card, padding: '4px 16px' }}>
            {milestones.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i === milestones.length - 1 ? 'none' : '1px solid var(--color-border-primary)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                {m.est && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{m.est}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ClientDashboard({ token }) {
  const [data, setData] = useState(undefined); // undefined=loading, null=invalid
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .fetchPublicStatus(token)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (data === undefined && !error) return <CenteredMessage>Loading project status…</CenteredMessage>;
  if (error || data === null)
    return (
      <CenteredMessage>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Link not found</div>
        <div>This client link is invalid or has been revoked.</div>
      </CenteredMessage>
    );

  const wbs = data.wbs || [];
  const showWbs = data.wbsEnabled && wbs.length > 0;
  // hide superseded (closed) iterations from the client
  const releases = (data.releases || []).filter((r) => r.status !== 'closed');
  const total = releases.length;
  const completed = releases.filter((r) => r.status === 'approved');
  const inProgress = releases.filter((r) => r.status !== 'approved');
  const pct = total ? Math.round((completed.length / total) * 100) : 0;
  const current = inProgress[0]; // most recent non-complete
  const cs = (s) => CLIENT_STATUS[s] || { label: s, color: '#64748b' };

  const statCard = (label, value, color) => (
    <div style={{ ...card, padding: 16, flex: '1 1 150px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: color || 'var(--color-text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );

  const relRow = (r, i, arr) => (
    <div
      key={i}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 0',
        borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--color-border-primary)',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: cs(r.status).color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
          v{r.version}{' '}
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
            {r.platform}
            {r.component ? ` · ${r.component}` : ''} · {r.environment}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>{r.date}</div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: cs(r.status).color,
          background: `${cs(r.status).color}1a`,
          padding: '3px 10px',
          borderRadius: 999,
        }}
      >
        {cs(r.status).label}
      </span>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-app-bg)' }}>
      <header
        style={{
          background: 'var(--ink)',
          borderBottom: '1px solid var(--ink-border)',
          padding: '14px 0',
        }}
      >
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={28} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
            Jump<span style={{ color: 'var(--brand)' }}>Test</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>Client portal</span>
        </div>
      </header>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 20px 64px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{data.project.name}</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 20px' }}>
          Project status overview
        </p>

        {showWbs && <ClientWbsView wbs={wbs} />}

        {!showWbs && (
        <>
        {/* progress */}
        <div style={{ ...card, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Overall progress</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>{pct}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--brand)' }} />
          </div>
          {current && (
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 12 }}>
              Current: <strong>v{current.version}</strong> — {cs(current.status).label}
            </div>
          )}
        </div>

        {/* summary */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          {statCard('Completed', completed.length, 'var(--success)')}
          {statCard('In progress', inProgress.length, 'var(--warning)')}
          {statCard('Resolved bugs', data.bugs?.resolved ?? 0, 'var(--success)')}
          {data.showOpenBugs && statCard('Open bugs', data.bugs?.open ?? 0, (data.bugs?.open ?? 0) ? 'var(--danger)' : undefined)}
        </div>

        {inProgress.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <div style={{ ...sideHead, marginBottom: 10 }}>In progress</div>
            <div style={{ ...card, padding: '4px 16px' }}>{inProgress.map(relRow)}</div>
          </section>
        )}

        {completed.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <div style={{ ...sideHead, marginBottom: 10 }}>Completed</div>
            <div style={{ ...card, padding: '4px 16px' }}>{completed.map(relRow)}</div>
          </section>
        )}

        <section>
          <div style={{ ...sideHead, marginBottom: 10 }}>Release history</div>
          {releases.length === 0 ? (
            <div style={{ ...card, padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              No releases yet.
            </div>
          ) : (
            <div style={{ ...card, padding: '4px 16px' }}>{releases.map(relRow)}</div>
          )}
        </section>
        </>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 32 }}>
          Read-only project status · powered by JumpTest
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Header + notifications                                             */
/* ================================================================== */

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  bugs: 'Bugs',
  projects: 'Projects',
  analytics: 'Analytics',
  users: 'Users',
  teams: 'Teams',
  settings: 'Settings',
};

function Header({
  user,
  page,
  canSubmit,
  canManage,
  isAdmin,
  unread,
  notifOpen,
  notifications,
  projects,
  releases,
  bugs,
  projectsById,
  onToggleNotif,
  onNotifClick,
  onMarkAllRead,
  onSubmitClick,
  onNewProject,
  onInviteUser,
  onOpenRelease,
  onNavigate,
  onSettings,
  onSignOut,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const inkGhost = {
    padding: '8px 13px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    background: 'var(--color-background-primary)',
    border: '1px solid var(--color-border-tertiary)',
    borderRadius: 'var(--r-input)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  const menuItem = {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    padding: '9px 11px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    borderRadius: 6,
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
          margin: '0 auto',
          padding: '11px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {/* breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}>
          <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>JumpTest</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>/</span>
          <span style={{ fontWeight: 700 }}>{PAGE_TITLES[page] || 'Dashboard'}</span>
        </div>

        {/* global search */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 180 }}>
          <GlobalSearch
            projects={projects}
            releases={releases}
            bugs={bugs}
            projectsById={projectsById}
            onNavigate={onNavigate}
            onOpenRelease={onOpenRelease}
          />
        </div>

        {/* bell */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onToggleNotif}
            style={{ ...inkGhost, padding: 9, position: 'relative', display: 'inline-flex' }}
            title="Notifications"
          >
            <IconBell size={17} />
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

        {/* quick actions */}
        <div style={{ position: 'relative' }}>
          <button
            style={{ ...primaryButton(false), display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setActionsOpen((v) => !v)}
          >
            <IconPlus size={15} />
            New
          </button>
          {actionsOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setActionsOpen(false)} />
              <div
                style={{
                  ...card,
                  position: 'absolute',
                  top: 42,
                  right: 0,
                  width: 210,
                  zIndex: 40,
                  padding: 4,
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                {canSubmit && (
                  <button
                    style={menuItem}
                    onClick={() => {
                      setActionsOpen(false);
                      onSubmitClick();
                    }}
                  >
                    <IconUpload size={15} /> Submit release
                  </button>
                )}
                {canManage && (
                  <button
                    style={menuItem}
                    onClick={() => {
                      setActionsOpen(false);
                      onNewProject();
                    }}
                  >
                    <IconFolder size={15} /> New project
                  </button>
                )}
                {canManage && (
                  <button
                    style={menuItem}
                    onClick={() => {
                      setActionsOpen(false);
                      onInviteUser();
                    }}
                  >
                    <IconUsers size={15} /> {isAdmin ? 'Add user' : 'Manage team'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* user chip */}
        <div
          onClick={onSettings}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 10px 5px 6px',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
            borderRadius: 999,
            cursor: 'pointer',
          }}
        >
          <Avatar name={user.name} size={26} />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--color-text-secondary)' }}>{user.role}</div>
          </div>
        </div>
        <button
          style={{ ...inkGhost, padding: 9, display: 'inline-flex' }}
          onClick={onSignOut}
          title="Sign out"
        >
          <IconPower size={17} />
        </button>
      </div>
    </header>
  );
}

function GlobalSearch({ projects, releases, bugs, projectsById, onNavigate, onOpenRelease }) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const term = q.trim().toLowerCase();

  const results =
    term.length >= 2
      ? [
          ...releases
            .filter(
              (r) =>
                `v${r.version}`.toLowerCase().includes(term) ||
                (projectsById[r.projectId]?.name || '').toLowerCase().includes(term)
            )
            .slice(0, 5)
            .map((r) => ({
              key: 'r' + r.id,
              type: 'release',
              id: r.id,
              label: `v${r.version} · ${projectsById[r.projectId]?.name || ''}`,
              sub: `${r.platform} release`,
            })),
          ...bugs
            .filter((b) => b.title.toLowerCase().includes(term))
            .slice(0, 5)
            .map((b) => ({ key: 'b' + b.id, type: 'bug', id: b.releaseId, label: b.title, sub: 'Bug' })),
          ...projects
            .filter((p) => p.name.toLowerCase().includes(term))
            .slice(0, 4)
            .map((p) => ({ key: 'p' + p.id, type: 'project', id: p.id, label: p.name, sub: 'Project' })),
        ]
      : [];

  function pick(r) {
    setQ('');
    setFocused(false);
    if (r.type === 'project') onNavigate('projects');
    else onOpenRelease(r.id);
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 440 }}>
      <span
        style={{
          position: 'absolute',
          left: 11,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--color-text-tertiary)',
          pointerEvents: 'none',
        }}
      >
        <IconSearch size={15} />
      </span>
      <input
        value={q}
        placeholder="Search releases, bugs, projects…"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        style={{ ...inputStyle, paddingLeft: 34, height: 36 }}
      />
      {focused && results.length > 0 && (
        <div
          style={{
            ...card,
            position: 'absolute',
            top: 42,
            left: 0,
            right: 0,
            zIndex: 40,
            padding: 4,
            maxHeight: 360,
            overflowY: 'auto',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {results.map((r) => (
            <div
              key={r.key}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: 'var(--color-text-tertiary)', display: 'inline-flex' }}>
                {r.type === 'bug' ? (
                  <IconBug size={15} />
                ) : r.type === 'project' ? (
                  <IconFolder size={15} />
                ) : (
                  <IconUpload size={15} />
                )}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.sub}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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

const STATUS_ICONS = {
  qa_pending: IconClock,
  qa_in_progress: IconSearch,
  qa_done: IconCheck,
  approved: IconCheck,
  sent_back: IconBug,
  closed: IconPackage,
};

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
        const Ico = STATUS_ICONS[key];
        const n = counts[key];
        const active = n > 0;
        // zero-state cards stay fully neutral; only non-empty cards carry color
        const accent = active ? s.color : 'var(--color-text-tertiary)';
        return (
          <div key={key} style={{ ...card, padding: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <span style={{ color: accent, display: 'inline-flex' }}>
                <Ico size={18} />
              </span>
              <span
                className="tnum"
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                }}
              >
                {n}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: accent,
                  flexShrink: 0,
                }}
              />
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
  platformFilter,
  typeFilter,
  statusFilter,
  onProject,
  onPlatform,
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
      <select style={s} value={platformFilter} onChange={(e) => onPlatform(e.target.value)}>
        <option value="all">All platforms</option>
        {RELEASE_PLATFORMS.map((pl) => (
          <option key={pl} value={pl}>
            {pl}
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

function statusSince(release) {
  return release.statusChangedAt || release.createdAt || release.date;
}

// small amber/red SLA dot; renders nothing when within SLA
function SlaBadge({ level, title }) {
  if (!level) return null;
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 999,
        background: SLA_COLORS[level],
        boxShadow: level === 'over' ? `0 0 0 3px ${SLA_COLORS.over}22` : 'none',
        flexShrink: 0,
      }}
    />
  );
}

function StatusAge({ release }) {
  const since = statusSince(release);
  const level = slaLevel(release.status, since);
  const color = level ? SLA_COLORS[level] : 'var(--color-text-tertiary)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color }}>
      <SlaBadge
        level={level}
        title={
          level === 'over'
            ? 'Past SLA — needs attention'
            : level === 'warn'
            ? 'Approaching SLA'
            : ''
        }
      />
      {humanizeSince(since)} in {STATUSES[release.status]?.label || release.status}
    </span>
  );
}

function EnvBadge({ environment }) {
  const env = environment || 'Production';
  const color = env === 'Staging' ? 'var(--warning)' : 'var(--success)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        background: 'var(--color-background-secondary)',
        border: '1px solid var(--color-border-tertiary)',
        padding: '2px 8px',
        borderRadius: 999,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {env}
    </span>
  );
}

function ReleaseCard({ release, project, openBugs, assignedName, onClick }) {
  const [hover, setHover] = useState(false);
  const notesPreview = (release.releaseNotes || '').split('\n')[0].trim();
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...card,
        padding: 15,
        cursor: 'pointer',
        borderColor: hover ? 'var(--brand)' : 'var(--color-border-tertiary)',
        transition: 'border-color .12s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TypeBadge type={release.releaseType} />
        <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600 }}>
          v{release.version}
        </span>
        <StatusBadge status={release.status} />
        <StatusAge release={release} />
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
            <IconFolder size={13} />
            {project.name}
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
            padding: '1px 7px',
            borderRadius: 999,
          }}
        >
          {release.platform}
        </span>
        <EnvBadge environment={release.environment} />
        {openBugs > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <CountBadge count={openBugs} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)' }}>
              open bug{openBugs === 1 ? '' : 's'}
            </span>
          </span>
        )}
        <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
          {assignedName ? `QA: ${assignedName}` : 'Unassigned'}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={release.submittedBy} size={28} />
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
  Android: '#10b981',
  iOS: '#3b82f6',
  Web: '#f59e0b',
  Both: '#0c5cab',
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

function Sidebar({
  projects,
  releases,
  teamName,
  openBugTotal,
  disputedTotal,
  projectFilter,
  platformFilter,
  onSelect,
}) {
  const [q, setQ] = useState('');
  const countFor = (id, plat) =>
    releases.filter(
      (r) => r.projectId === id && (!plat || r.platform === plat)
    ).length;
  const shown = projects.filter((p) =>
    p.name.toLowerCase().includes(q.trim().toLowerCase())
  );
  const atRisk = releases.filter((r) => slaLevel(r.status, statusSince(r))).length;
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <span style={{ ...sideHead, marginBottom: 0 }}>Projects</span>
          {teamName && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--brand)',
                background: 'var(--brand-soft)',
                padding: '2px 7px',
                borderRadius: 999,
              }}
            >
              {teamName}
            </span>
          )}
        </div>
        <input
          style={{ ...inputStyle, padding: '7px 10px', marginBottom: 8 }}
          value={q}
          placeholder="Search projects…"
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ maxHeight: 360, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
          <NavRow
            label="All projects"
            count={releases.length}
            active={projectFilter === 'all'}
            onClick={() => onSelect('all', 'all')}
          />
          {shown.map((p) => {
            const plats = platformsForProjectType(p.type);
            const both = plats.length > 1;
            const projActive = projectFilter === p.id;
            return (
              <div key={p.id}>
                <NavRow
                  label={p.name}
                  count={countFor(p.id)}
                  active={projActive && platformFilter === 'all'}
                  onClick={() => onSelect(p.id, 'all')}
                />
                {both && (
                  <div style={{ marginLeft: 16 }}>
                    {plats.map((pl) => (
                      <NavRow
                        key={pl}
                        label={pl}
                        count={countFor(p.id, pl)}
                        active={projActive && platformFilter === pl}
                        onClick={() => onSelect(p.id, pl)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {shown.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '6px 10px' }}>
              {projects.length === 0 ? 'No projects yet.' : 'No matches.'}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: 14 }}>
        <div style={sideHead}>At a glance</div>
        {stat('Releases', releases.length)}
        {stat('Projects', projects.length)}
        {stat('Open bugs', openBugTotal, openBugTotal ? '#dc2626' : undefined)}
        {stat('Needs clarification', disputedTotal, disputedTotal ? '#7c3aed' : undefined)}
        {stat('Needs attention', atRisk, atRisk ? '#dc2626' : undefined)}
      </div>
    </div>
  );
}

function RightPanel({
  releases,
  bugs,
  canSubmit,
  canManage,
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
            style={{
              ...primaryButton(false),
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
            onClick={onSubmit}
          >
            <IconPlus size={15} />
            Submit release
          </button>
        )}
        <button style={quickBtn} onClick={onAnalytics}>
          <IconChart size={15} />
          View analytics
        </button>
        {canManage && (
          <button style={quickBtn} onClick={onAdmin}>
            <IconSliders size={15} />
            Manage projects &amp; users
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
                      background: 'var(--brand)',
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
                    borderRadius: 6,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-background-secondary)',
                    border: '1px solid var(--color-border-tertiary)',
                  }}
                >
                  {a.kind === 'bug' ? <IconBug size={13} /> : <IconUpload size={13} />}
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

function SubmitModal({ projects, sentBackReleases = [], bugs = [], isSubmitting, onClose, onSubmit }) {
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
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const [wbsTasks, setWbsTasks] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState([]); // task ids

  const project = projectById(form.projectId);
  const isWbs = !!project?.wbsEnabled;

  useEffect(() => {
    let cancelled = false;
    setSelectedTasks([]);
    if (!project?.wbsEnabled) {
      setWbsTasks([]);
      return;
    }
    api
      .fetchWbsTasks(project.id)
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
  }, [project?.id, project?.wbsEnabled]);

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

  // follow-up detection: an open sent-back release for the selected project
  const priorSentBack = sentBackReleases.find((r) => r.projectId === form.projectId) || null;
  const priorOpenBugs = priorSentBack
    ? bugs.filter((b) => b.releaseId === priorSentBack.id && b.status !== 'verified').length
    : 0;

  // A WBS project with a prior sent-back release may be submitted as a
  // bug-fix-only release (no WBS task selection required).
  const bugFixEligible = isWbs && !!priorSentBack;
  const isWeb = form.platform === 'Web';
  const componentBad =
    isWeb && form.component === 'Other' && !form.componentOther.trim();
  const invalid =
    !form.projectId ||
    !form.version.trim() ||
    componentBad ||
    !!linkErr ||
    (isWbs
      ? !bugFixEligible && selectedTasks.length === 0 // feature release still needs ≥1 task
      : !form.releaseNotes.trim());

  function submit() {
    if (invalid) return;
    const component = isWeb
      ? form.component === 'Other'
        ? form.componentOther.trim()
        : form.component
      : '';
    const picked = isWbs
      ? wbsTasks.filter((t) => selectedTasks.includes(t.id)).map((t) => ({ id: t.id, name: t.name }))
      : [];
    onSubmit({ ...form, component, wbsTasks: picked });
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
          You have an open QA cycle on <strong>v{priorSentBack.version}</strong> with {priorOpenBugs} unresolved
          bug{priorOpenBugs === 1 ? '' : 's'}. Submitting closes v{priorSentBack.version} and carries its
          unresolved &amp; fixed-pending-verification bugs into this new release.
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

function EditReleaseModal({ release, project, isSubmitting, onClose, onSave }) {
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

function DetailModal({
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

  useEffect(() => {
    let cancelled = false;
    api
      .fetchReleaseTasks(release.id)
      .then((t) => !cancelled && setLinkedTasks(t))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [release.id]);

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
            Linked WBS tasks · verify {linkedTasks[0]?.track}
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
                canDelete={!readOnly && (user.role === 'Admin' || bug.createdById === user.id)}
                isSubmitting={isSubmitting}
                onStatus={(st) => onBugStatus(release, bug, st)}
                onResolve={(res) => onBugResolve(release, bug, res)}
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

function TagChip({ label, tone }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        color: tone === 'brand' ? 'var(--brand)' : 'var(--color-text-secondary)',
        background: tone === 'brand' ? 'var(--brand-soft)' : 'var(--color-background-secondary)',
        border: '1px solid var(--color-border-tertiary)',
      }}
    >
      {label}
    </span>
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
  canDelete,
  isSubmitting,
  onStatus,
  onResolve,
  onDelete,
}) {
  const [showThread, setShowThread] = useState(false);
  // contextual transitions
  const actions = [];
  if (isDev) {
    if (bug.status === 'open') actions.push(['in_progress', 'Start']);
    if (['in_progress', 'open', 'disputed'].includes(bug.status))
      actions.push(['fixed', 'Mark fixed']);
  }
  if (isQA) {
    if (bug.status === 'fixed') actions.push(['verified', 'Verify']);
    if (bug.status !== 'open') actions.push(['open', 'Reopen']);
  }
  // either side can flag for clarification
  if (bug.status !== 'verified' && bug.status !== 'disputed')
    actions.push(['disputed', 'Needs clarification']);

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
      {(actions.length > 0 || canDelete || (isQA && bug.status !== 'verified')) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
          {isQA && bug.status !== 'verified' && (
            <select
              value=""
              disabled={isSubmitting}
              onChange={(e) => e.target.value && onResolve(e.target.value)}
              style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 }}
              title="Close without a code fix"
            >
              <option value="">Close as…</option>
              {BUG_RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
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

/* ================================================================== */
/* Admin panel (tabs: Users / Projects)                               */
/* ================================================================== */

function AdminPanel({
  currentUser,
  isAdmin,
  myTeamId,
  teams,
  profiles,
  projects,
  releases,
  checklistItems,
  isSubmitting,
  showToast,
  onCreateTeam,
  onDeleteTeam,
  onUpdateMember,
  onCreateUser,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onAddChecklistItem,
  onDeleteChecklistItem,
  refetchProfiles,
  onClose,
}) {
  const [tab, setTab] = useState(isAdmin ? 'teams' : 'projects');

  const visibleProjects = isAdmin
    ? projects
    : projects.filter((p) => p.teamId === myTeamId);
  const visibleProfiles = isAdmin
    ? profiles
    : profiles.filter((p) => p.teamId === myTeamId);
  const teamsById = {};
  teams.forEach((t) => (teamsById[t.id] = t));

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
    <ModalShell onClose={onClose} title={isAdmin ? 'Manage' : 'Manage team'} maxWidth={680}>
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          borderBottom: '0.5px solid var(--color-border-primary)',
        }}
      >
        {isAdmin && tabBtn('teams', 'Teams')}
        {tabBtn('users', isAdmin ? 'Users' : 'Team members')}
        {tabBtn('projects', 'Projects & Checklists')}
      </div>

      {tab === 'teams' && isAdmin && (
        <TeamsTab
          teams={teams}
          profiles={profiles}
          projects={projects}
          isSubmitting={isSubmitting}
          onCreateTeam={onCreateTeam}
          onDeleteTeam={onDeleteTeam}
        />
      )}

      {tab === 'users' && (
        <UsersTab
          currentUser={currentUser}
          isAdmin={isAdmin}
          myTeamId={myTeamId}
          profiles={visibleProfiles}
          teams={teams}
          teamsById={teamsById}
          isSubmitting={isSubmitting}
          showToast={showToast}
          onUpdateMember={onUpdateMember}
          onCreateUser={onCreateUser}
          refetchProfiles={refetchProfiles}
        />
      )}

      {tab === 'projects' && (
        <ProjectsTab
          isAdmin={isAdmin}
          myTeamId={myTeamId}
          teams={teams}
          teamsById={teamsById}
          projects={visibleProjects}
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

function TeamsTab({ teams, profiles, projects, isSubmitting, onCreateTeam, onDeleteTeam }) {
  const [name, setName] = useState('');
  const members = (id) => profiles.filter((p) => p.teamId === id);
  const leadOf = (id) => members(id).find((p) => p.role === 'Team Lead');
  const projCount = (id) => projects.filter((p) => p.teamId === id).length;
  function add() {
    if (!name.trim()) return;
    onCreateTeam(name.trim());
    setName('');
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={name}
          placeholder="New team name (e.g. Team B)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button style={primaryButton(!name.trim() || isSubmitting)} disabled={!name.trim() || isSubmitting} onClick={add}>
          Add team
        </button>
      </div>

      {teams.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No teams yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {teams.map((t) => {
            const lead = leadOf(t.id);
            return (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 13px',
                  background: 'var(--color-background-secondary)',
                  border: '0.5px solid var(--color-border-primary)',
                  borderRadius: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {lead ? (
                      <span>
                        Lead: <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{lead.name}</span>
                      </span>
                    ) : (
                      <span style={{ color: '#dc2626' }}>No team lead</span>
                    )}{' '}
                    · {members(t.id).length} member{members(t.id).length === 1 ? '' : 's'} · {projCount(t.id)} project
                    {projCount(t.id) === 1 ? '' : 's'}
                  </div>
                </div>
                <button
                  onClick={() => onDeleteTeam(t.id)}
                  disabled={isSubmitting}
                  style={{ ...ghostButton, padding: '6px 10px', fontSize: 12, color: '#dc2626', borderColor: '#dc262644' }}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 12, lineHeight: 1.5 }}>
        Assign each team a Team Lead in the Users tab. Team Leads manage their own
        team's projects and members; Developers and QA only see their team's work.
      </div>
    </div>
  );
}

function CreateUserForm({ teams, isSubmitting, onCreateUser }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Developer',
    teamId: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const domainBad = form.email.trim().length > 0 && !emailDomainOk(form.email);
  const invalid =
    !form.name.trim() ||
    !form.email.trim() ||
    domainBad ||
    form.password.length < 6;

  async function submit() {
    if (invalid) return;
    const ok = await onCreateUser({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      teamId: form.teamId || null,
    });
    if (ok) {
      setForm({ name: '', email: '', password: '', role: 'Developer', teamId: '' });
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 6 }}>
        <button
          style={{ ...primaryButton(false), display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => setOpen(true)}
        >
          <IconPlus size={15} />
          Create account
        </button>
      </div>
    );
  }

  return (
    <div
      className="anim-in"
      style={{
        ...card,
        padding: 14,
        background: 'var(--color-background-secondary)',
        marginBottom: 8,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>New account</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px' }}>
          <Field label="Name">
            <input
              style={inputStyle}
              value={form.name}
              placeholder="e.g. Sara Khan"
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <Field label="Email">
            <input
              style={{
                ...inputStyle,
                borderColor: domainBad ? 'var(--danger)' : 'var(--color-border-tertiary)',
              }}
              type="email"
              value={form.email}
              placeholder={`name@${ALLOWED_EMAIL_DOMAIN}`}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px' }}>
          <Field label="Temporary password">
            <input
              style={inputStyle}
              type="text"
              value={form.password}
              placeholder="At least 6 characters"
              onChange={(e) => set('password', e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <Field label="Role">
            <select style={inputStyle} value={form.role} onChange={(e) => set('role', e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <Field label="Team">
            <select style={inputStyle} value={form.teamId} onChange={(e) => set('teamId', e.target.value)}>
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
        The account is created already-confirmed (no email sent). Share the
        temporary password with the user.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={ghostButton} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          style={primaryButton(invalid || isSubmitting)}
          disabled={invalid || isSubmitting}
          onClick={submit}
        >
          {isSubmitting ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </div>
  );
}

function UsersTab({
  currentUser,
  isAdmin,
  myTeamId,
  profiles,
  teams,
  teamsById,
  isSubmitting,
  showToast,
  onUpdateMember,
  onCreateUser,
  refetchProfiles,
}) {
  const [busyId, setBusyId] = useState(null);
  const roleOptions = isAdmin ? ROLES : TEAM_ASSIGNABLE_ROLES;

  async function patch(id, p) {
    setBusyId(id);
    await onUpdateMember(id, p);
    setBusyId(null);
  }

  async function removeUser(p) {
    if (
      !window.confirm(
        `Permanently delete ${p.name}? This removes them from both the app and the authentication system.`
      )
    )
      return;
    setBusyId(p.id);
    try {
      await api.adminDeleteUser(p.id);
      showToast('User deleted');
      refetchProfiles();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  const selStyle = { ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 };

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [visible, setVisible] = useState(15);
  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };

  const term = q.trim().toLowerCase();
  const filteredUsers = profiles.filter(
    (p) =>
      (p.name.toLowerCase().includes(term) ||
        (p.email || '').toLowerCase().includes(term)) &&
      (roleFilter === 'all' || p.role === roleFilter) &&
      (teamFilter === 'all' ||
        (teamFilter === 'none' ? !p.teamId : p.teamId === teamFilter))
  );
  const pageUsers = filteredUsers.slice(0, visible);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {isAdmin && (
        <CreateUserForm teams={teams} isSubmitting={isSubmitting} onCreateUser={onCreateUser} />
      )}

      {/* search + filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, flex: '1 1 180px', width: 'auto' }}
          value={q}
          placeholder="Search by name or email…"
          onChange={(e) => {
            setQ(e.target.value);
            setVisible(15);
          }}
        />
        <select style={fSel} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {isAdmin && (
          <select style={fSel} value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All teams</option>
            <option value="none">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            alignSelf: 'center',
          }}
        >
          {filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'}
        </span>
      </div>

      {pageUsers.map((p) => {
        const isSelf = p.id === currentUser.id;
        // a team lead may only adjust Developers/QA in their own team
        const leadLocked =
          !isAdmin && (p.role === 'Admin' || p.role === 'Team Lead');
        const roleDisabled = isSelf || leadLocked || busyId === p.id;
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
              flexWrap: 'wrap',
            }}
          >
            <Avatar name={p.name} role={p.role} />
            <div style={{ flex: 1, minWidth: 120 }}>
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

            {isAdmin ? (
              <select
                style={selStyle}
                value={p.teamId || ''}
                disabled={busyId === p.id}
                onChange={(e) => patch(p.id, { team_id: e.target.value || null })}
                title="Team"
              >
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                {p.teamId ? teamsById[p.teamId]?.name : '—'}
              </span>
            )}

            <select
              style={selStyle}
              value={p.role}
              disabled={roleDisabled}
              onChange={(e) => patch(p.id, { role: e.target.value })}
              title={leadLocked ? 'Only an admin can change this role' : 'Role'}
            >
              {/* keep the current role visible even if outside a lead's options */}
              {(roleOptions.includes(p.role) ? roleOptions : [p.role, ...roleOptions]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {isAdmin && (
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
            )}
          </div>
        );
      })}
      {filteredUsers.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: '8px 2px' }}>
          No users match.
        </div>
      )}
      {visible < filteredUsers.length && (
        <button
          style={{ ...ghostButton, width: '100%', marginTop: 4 }}
          onClick={() => setVisible((v) => v + 15)}
        >
          Load more ({filteredUsers.length - visible} left)
        </button>
      )}
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
        {isAdmin
          ? 'New sign-ups join as Developer. Set each user’s team and role here; one Team Lead per team.'
          : 'You can set your team members between Developer and QA. Ask an admin to add or remove people.'}
      </div>
    </div>
  );
}

function ProjectsTab({
  isAdmin,
  user,
  myTeamId,
  teams,
  teamsById,
  projects,
  releases,
  checklistItems,
  profiles,
  projectMembers,
  isSubmitting,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onAddChecklistItem,
  onDeleteChecklistItem,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'mobile',
    team: isAdmin ? teams[0]?.id || '' : myTeamId || '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const needsTeam = isAdmin && teams.length > 0;
  const invalid = !form.name.trim() || (needsTeam && !form.team);
  const releaseCount = (id) => releases.filter((r) => r.projectId === id).length;

  const [q, setQ] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [visible, setVisible] = useState(12);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(q.trim().toLowerCase()) &&
      (teamFilter === 'all' ||
        (teamFilter === 'none' ? !p.teamId : p.teamId === teamFilter)) &&
      (typeFilter === 'all' || p.type === typeFilter)
  );
  const pageProjects = filteredProjects.slice(0, visible);
  const fSel = { ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 12 };

  function create() {
    if (invalid) return;
    onCreateProject({
      name: form.name.trim(),
      type: form.type,
      platform: projectTypeLabel(form.type),
      team_id: isAdmin ? form.team || null : myTeamId || null,
    });
    setForm({ name: '', type: 'mobile', team: isAdmin ? teams[0]?.id || '' : myTeamId || '' });
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
          {filteredProjects.length === projects.length
            ? `${projects.length} project${projects.length === 1 ? '' : 's'}`
            : `${filteredProjects.length} of ${projects.length}`}
        </span>
        <button
          style={creating ? ghostButton : primaryButton(false)}
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? 'Cancel' : '+ New project'}
        </button>
      </div>

      {/* search + filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }}
          value={q}
          placeholder="Search projects…"
          onChange={(e) => {
            setQ(e.target.value);
            setVisible(12);
          }}
        />
        {isAdmin && (
          <select style={fSel} value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All teams</option>
            <option value="none">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select style={fSel} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All platforms</option>
          {PROJECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {projectTypeLabel(t)}
            </option>
          ))}
        </select>
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
                  {projectTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <div style={{ flex: '1 1 150px' }}>
              <label style={labelStyle}>Team</label>
              <select style={inputStyle} value={form.team} onChange={(e) => set('team', e.target.value)}>
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
      {filteredProjects.length === 0 ? (
        <div
          style={{
            ...card,
            padding: 28,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
          }}
        >
          {projects.length === 0 ? 'No projects yet — create your first one above.' : 'No projects match.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pageProjects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              isAdmin={isAdmin}
              user={user}
              teams={teams}
              teamName={p.teamId ? teamsById[p.teamId]?.name : null}
              releaseCount={releaseCount(p.id)}
              items={checklistItems.filter((c) => c.projectId === p.id)}
              profiles={profiles}
              members={projectMembers.filter((m) => m.projectId === p.id)}
              isSubmitting={isSubmitting}
              onUpdate={onUpdateProject}
              onDelete={() => onDeleteProject(p.id)}
              onAddItem={(label, pos) => onAddChecklistItem(p.id, label, pos)}
              onDeleteItem={onDeleteChecklistItem}
              onAddMember={onAddMember}
              onUpdateMember={onUpdateMember}
              onRemoveMember={onRemoveMember}
            />
          ))}
          {visible < filteredProjects.length && (
            <button
              style={{ ...ghostButton, width: '100%', marginTop: 4 }}
              onClick={() => setVisible((v) => v + 12)}
            >
              Load more ({filteredProjects.length - visible} left)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  isAdmin,
  user,
  teams,
  teamName,
  releaseCount,
  items,
  profiles,
  members,
  isSubmitting,
  onUpdate,
  onDelete,
  onAddItem,
  onDeleteItem,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    name: project.name,
    type: project.type,
    team: project.teamId || '',
  });
  const [label, setLabel] = useState('');

  const isWeb = project.type === 'web';
  const typeColor = isWeb ? '#f59e0b' : '#10b981';

  function startEdit(e) {
    e.stopPropagation();
    setEdit({ name: project.name, type: project.type, team: project.teamId || '' });
    setEditing(true);
    setOpen(true);
  }
  async function saveEdit() {
    if (!edit.name.trim()) return;
    const patch = {
      name: edit.name.trim(),
      type: edit.type,
      platform: projectTypeLabel(edit.type),
    };
    if (isAdmin) patch.team_id = edit.team || null;
    const ok = await onUpdate(project.id, patch);
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
            borderRadius: 8,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
          }}
        >
          {isWeb ? <IconGlobe size={17} /> : <IconSmartphone size={17} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            {project.name}
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: teamName ? 'var(--brand)' : 'var(--color-text-tertiary)',
                background: teamName ? 'var(--brand-soft)' : 'var(--color-background-secondary)',
                padding: '2px 7px',
                borderRadius: 999,
              }}
            >
              {teamName || 'No team'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {projectTypeLabel(project.type)} · {releaseCount} release
            {releaseCount === 1 ? '' : 's'} · {items.length} checklist item
            {items.length === 1 ? '' : 's'}
          </div>
        </div>
        <button style={iconBtn('var(--brand)')} onClick={startEdit} disabled={isSubmitting}>
          Edit
        </button>
        <button
          style={iconBtn('#dc2626')}
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
                      {projectTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              {isAdmin && (
                <div style={{ flex: '1 1 140px' }}>
                  <label style={labelStyle}>Team</label>
                  <select
                    style={inputStyle}
                    value={edit.team}
                    onChange={(e) => setEdit((s) => ({ ...s, team: e.target.value }))}
                  >
                    <option value="">No team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                        color: '#dc2626',
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

          <ProjectMembersSection
            project={project}
            profiles={profiles}
            members={members}
            canManage={isAdmin || (user?.role === 'Team Lead' && user?.teamId === project.teamId)}
            currentUser={user}
            isSubmitting={isSubmitting}
            onAddMember={onAddMember}
            onUpdateMember={onUpdateMember}
            onRemoveMember={onRemoveMember}
          />

          {isAdmin && <ClientLinkSection projectId={project.id} />}
        </div>
      )}
    </div>
  );
}

function ProjectMembersSection({
  project,
  profiles,
  members,
  canManage,
  currentUser,
  isSubmitting,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}) {
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const [role, setRole] = useState('developer');
  const [expires, setExpires] = useState('');

  const profileById = useMemo(() => {
    const m = {};
    (profiles || []).forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  const memberUserIds = new Set(members.map((m) => m.userId));
  // anyone (from any team) who isn't already a member and isn't an Admin
  const addable = (profiles || [])
    .filter((p) => p.role !== 'Admin' && !memberUserIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const home = members.filter((m) => m.accessType !== 'support');
  const support = members.filter((m) => m.accessType === 'support');

  const active = (m) => !m.expiresAt || new Date(m.expiresAt).getTime() > Date.now();
  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString() : null);

  function submitAdd() {
    if (!pick) return;
    const picked = profileById[pick];
    // a member from another team is a temporary "support" grant
    const accessType = picked && picked.teamId === project.teamId ? 'home' : 'support';
    onAddMember({
      project_id: project.id,
      user_id: pick,
      project_role: role,
      access_type: accessType,
      expires_at: accessType === 'support' && expires ? new Date(expires).toISOString() : null,
    });
    setPick('');
    setRole('developer');
    setExpires('');
    setAdding(false);
  }

  function extend(m) {
    const base = m.expiresAt && new Date(m.expiresAt) > new Date() ? new Date(m.expiresAt) : new Date();
    base.setDate(base.getDate() + 30);
    onUpdateMember(m.id, { expires_at: base.toISOString() });
  }

  const chip = (text, color) => (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: 999,
        color,
        background: `${color}1a`,
      }}
    >
      {text}
    </span>
  );

  const roleColor = { qa: '#2563eb', lead: '#d97706', developer: '#16a34a', viewer: '#64748b' };

  const memberRow = (m) => {
    const p = profileById[m.userId];
    const expired = !active(m);
    return (
      <div
        key={m.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '7px 0',
          borderTop: '1px solid var(--color-border-primary)',
          opacity: expired ? 0.5 : 1,
        }}
      >
        <Avatar name={p?.name || '?'} size={24} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p?.name || 'Unknown user'}</div>
          <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>
            {p?.email}
          </div>
        </div>
        {chip((m.projectRole || 'developer').toUpperCase(), roleColor[m.projectRole] || '#64748b')}
        {m.accessType === 'support' &&
          chip(m.expiresAt ? `until ${fmt(m.expiresAt)}` : 'no end date', expired ? '#dc2626' : '#7c3aed')}
        {canManage && (
          <div style={{ display: 'flex', gap: 6 }}>
            {m.accessType === 'support' && (
              <button
                style={{ ...ghostButton, padding: '3px 8px', fontSize: 11 }}
                disabled={isSubmitting}
                onClick={() => extend(m)}
                title="Extend access by 30 days"
              >
                +30d
              </button>
            )}
            <button
              style={{ ...ghostButton, padding: '3px 8px', fontSize: 11, color: '#dc2626', borderColor: '#dc262644' }}
              disabled={isSubmitting || m.userId === currentUser?.id}
              onClick={() => onRemoveMember(m.id)}
              title={m.userId === currentUser?.id ? "You can't remove yourself" : 'Remove from project'}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 14, borderTop: '0.5px solid var(--color-border-primary)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ ...labelStyle, margin: 0 }}>
          Members <span style={{ color: 'var(--color-text-tertiary)' }}>· {members.length}</span>
        </div>
        {canManage && (
          <button style={{ ...ghostButton, padding: '4px 10px', fontSize: 12 }} onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cancel' : '+ Add member'}
          </button>
        )}
      </div>

      {adding && (
        <div style={{ ...card, padding: 12, marginBottom: 10, background: 'var(--color-background-secondary)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 180px' }}>
              <div style={{ ...labelStyle }}>Person (any team)</div>
              <select style={inputStyle} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Select…</option>
                {addable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.role}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 110px' }}>
              <div style={{ ...labelStyle }}>Role here</div>
              <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="developer">Developer</option>
                <option value="qa">QA</option>
                <option value="lead">Lead</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          {pick && profileById[pick]?.teamId !== project.teamId && (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...labelStyle }}>
                Support access ends <span style={{ color: 'var(--color-text-tertiary)' }}>(blank = no end date)</span>
              </div>
              <input type="date" style={{ ...inputStyle, width: 'auto' }} value={expires} onChange={(e) => setExpires(e.target.value)} />
              <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                This person is from another team — they'll get temporary <strong>support</strong> access that expires on this date.
              </div>
            </div>
          )}
          <button style={{ ...primaryButton(!pick), marginTop: 10 }} disabled={!pick || isSubmitting} onClick={submitAdd}>
            Add to project
          </button>
        </div>
      )}

      {members.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
          No members yet — only Admins can see this project until members are added.
        </div>
      ) : (
        <>
          {home.map(memberRow)}
          {support.length > 0 && (
            <>
              <div style={{ ...labelStyle, marginTop: 10, marginBottom: 0 }}>
                Support (temporary) <span style={{ color: 'var(--color-text-tertiary)' }}>· {support.length}</span>
              </div>
              {support.map(memberRow)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ClientLinkSection({ projectId }) {
  const [link, setLink] = useState(undefined); // undefined=loading, null=none
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchClientLink(projectId)
      .then((l) => !cancelled && setLink(l || null))
      .catch(() => !cancelled && setLink(null));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const url = link ? `${window.location.origin}/?client=${link.token}` : '';

  async function create() {
    setBusy(true);
    try {
      setLink(await api.createClientLink(projectId));
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    if (!link) return;
    const v = !link.show_open_bugs;
    await api.updateClientLink(link.id, { show_open_bugs: v });
    setLink({ ...link, show_open_bugs: v });
  }
  async function revoke() {
    if (!link || !window.confirm('Revoke this client link? The shared URL will stop working.')) return;
    await api.deleteClientLink(link.id);
    setLink(null);
  }
  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border-primary)' }}>
      <div style={{ ...labelStyle, marginBottom: 8 }}>Client portal link</div>
      {link === undefined ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Loading…</div>
      ) : !link ? (
        <button style={ghostButton} disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create client link'}
        </button>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={url} style={{ ...inputStyle, flex: 1, fontSize: 11.5 }} onFocus={(e) => e.target.select()} />
            <button style={ghostButton} onClick={copy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={link.show_open_bugs} onChange={toggle} />
            Show open bug count to the client
          </label>
          <button
            onClick={revoke}
            style={{ ...ghostButton, marginTop: 10, padding: '5px 10px', fontSize: 12, color: '#dc2626', borderColor: '#dc262644' }}
          >
            Revoke link
          </button>
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* Analytics                                                          */
/* ================================================================== */

const DAY = 86_400_000;
function avgDaysBetween(items, startKey, endKey) {
  const vals = items
    .map((r) => {
      const s = r[startKey] ? new Date(r[startKey]).getTime() : null;
      const e = r[endKey] ? new Date(r[endKey]).getTime() : null;
      return s && e && e >= s ? e - s : null;
    })
    .filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length / DAY;
}

function AnSection({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ ...sideHead, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ ...card, padding: 12, flex: '1 1 120px', minWidth: 110 }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 700,
          color: color || 'var(--color-text-primary)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginTop: 2 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function DistBars({ items }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((i) => (
        <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, flex: '0 0 110px' }}>{i.label}</span>
          <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--color-background-secondary)' }}>
            <div style={{ width: `${(i.n / max) * 100}%`, height: '100%', borderRadius: 999, background: i.color }} />
          </div>
          <span className="tnum" style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: '0 0 28px', textAlign: 'right' }}>
            {i.n}
          </span>
        </div>
      ))}
    </div>
  );
}

function AnalyticsModal({ projects, releases, bugs, profiles, teams, isAdmin, embedded, onClose, onOpenHistory }) {
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

  const [f, setF] = useState({
    team: 'all',
    project: 'all',
    platform: 'all',
    environment: 'all',
    developer: 'all',
    qa: 'all',
    version: '',
    from: '',
    to: '',
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const reset = () =>
    setF({ team: 'all', project: 'all', platform: 'all', environment: 'all', developer: 'all', qa: 'all', version: '', from: '', to: '' });

  const relF = releases.filter((r) => {
    const proj = projectsById[r.projectId];
    if (f.team !== 'all' && (proj?.teamId || '') !== f.team) return false;
    if (f.project !== 'all' && r.projectId !== f.project) return false;
    if (f.platform !== 'all' && r.platform !== f.platform) return false;
    if (f.environment !== 'all' && (r.environment || 'Production') !== f.environment) return false;
    if (f.developer !== 'all' && r.submittedById !== f.developer) return false;
    if (f.qa !== 'all' && r.assignedQa !== f.qa) return false;
    if (f.version.trim() && !r.version.toLowerCase().includes(f.version.trim().toLowerCase())) return false;
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    return true;
  });
  const relIds = new Set(relF.map((r) => r.id));
  // bugs on closed (superseded) releases were carried onto their successor —
  // exclude them from bug metrics so carried bugs aren't counted twice.
  const closedRelIds = new Set(relF.filter((r) => isClosedStatus(r.status)).map((r) => r.id));
  const bugsF = bugs.filter((b) => relIds.has(b.releaseId) && !closedRelIds.has(b.releaseId));

  // a release is "blocked" while it still has open Major/Critical bugs
  const blockedReleaseIds = new Set(
    bugsF
      .filter((b) => b.status !== 'verified' && (b.severity === 'critical' || b.severity === 'major'))
      .map((b) => b.releaseId)
  );

  // ---- QA quality (based on real outcome, not just submission) ----
  const submitted = relF.length;
  const approved = relF.filter((r) => r.status === 'approved' && !blockedReleaseIds.has(r.id)).length;
  // bug_repeat, or "approved" releases that still carry blocking bugs, count as not-passed
  const rejected = relF.filter(
    (r) => r.status === 'sent_back' || (r.status === 'approved' && blockedReleaseIds.has(r.id))
  ).length;
  const decided = approved + rejected;
  const passRate = decided ? Math.round((approved / decided) * 100) : 0;
  const rejRate = decided ? Math.round((rejected / decided) * 100) : 0;

  // ---- velocity ----
  const completed = relF.filter((r) => r.status === 'approved' && r.qaCompletedAt);
  // total cycle is only meaningful once a release has gone through QA assignment
  const cycleDays = avgDaysBetween(
    completed.filter((r) => r.qaAssignedAt),
    'createdAt',
    'qaCompletedAt'
  );
  const toAssign = avgDaysBetween(
    relF.filter((r) => r.qaAssignedAt),
    'createdAt',
    'qaAssignedAt'
  );
  const assignToDone = avgDaysBetween(
    completed.filter((r) => r.qaAssignedAt),
    'qaAssignedAt',
    'qaCompletedAt'
  );

  // completed per month (last 6)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: d.toLocaleString(undefined, { month: 'short' }), n: 0 });
  }
  completed.forEach((r) => {
    const k = (r.qaCompletedAt || '').slice(0, 7);
    const m = months.find((x) => x.key === k);
    if (m) m.n += 1;
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.n));

  // ---- production defects (bugs reported against Production-env releases) ----
  const prodBugs = bugsF.filter((b) => (relById(b.releaseId)?.environment || 'Production') === 'Production').length;
  function relById(id) {
    return relF.find((r) => r.id === id);
  }

  // ---- bug lineage: carry-forward rate + avg iterations to verify ----
  const carriedBugs = bugsF.filter((b) => b.carriedForward).length;
  const carryRate = bugsF.length ? Math.round((carriedBugs / bugsF.length) * 100) : 0;
  const verifiedIters = bugsF.filter((b) => b.status === 'verified').map((b) => b.iteration || 1);
  const avgIterations = verifiedIters.length
    ? (verifiedIters.reduce((s, n) => s + n, 0) / verifiedIters.length).toFixed(1)
    : null;

  // ---- workload ----
  const wlMembers = profiles
    .filter((p) => p.role !== 'Admin' && (f.team === 'all' || p.teamId === f.team))
    .map((m) => {
      const mine = new Set(relF.filter((r) => r.submittedById === m.id).map((r) => r.id));
      return {
        m,
        activeReleases: relF.filter((r) => r.submittedById === m.id && isActiveStatus(r.status)).length,
        pendingReviews: relF.filter(
          (r) => r.assignedQa === m.id && (r.status === 'qa_pending' || r.status === 'qa_in_progress')
        ).length,
        openBugs: bugsF.filter(
          (b) => (b.createdById === m.id || mine.has(b.releaseId)) && b.status !== 'verified'
        ).length,
      };
    })
    .filter((w) => w.activeReleases || w.pendingReviews || w.openBugs)
    .sort((a, b) => b.pendingReviews + b.activeReleases - (a.pendingReviews + a.activeReleases));

  // ---- bottlenecks ----
  const bottlenecks = [];
  const overSla = relF.filter((r) => slaLevel(r.status, statusSince(r)) === 'over');
  if (overSla.length)
    bottlenecks.push({ level: 'over', text: `${overSla.length} release(s) past their SLA (Pending/In QA).` });
  const reviewerLoad = {};
  relF.forEach((r) => {
    if (r.assignedQa && (r.status === 'qa_pending' || r.status === 'qa_in_progress'))
      reviewerLoad[r.assignedQa] = (reviewerLoad[r.assignedQa] || 0) + 1;
  });
  Object.entries(reviewerLoad)
    .filter(([, n]) => n > 3)
    .forEach(([id, n]) =>
      bottlenecks.push({
        level: 'warn',
        text: `${profilesById[id]?.name || 'A tester'} has ${n} active reviews — possibly overloaded.`,
      })
    );
  const qaCountByTeam = {};
  profiles.forEach((p) => {
    if (p.role === 'QA') qaCountByTeam[p.teamId] = (qaCountByTeam[p.teamId] || 0) + 1;
  });
  (f.team === 'all' ? teams : teams.filter((t) => t.id === f.team)).forEach((t) => {
    const waiting = relF.some(
      (r) => projectsById[r.projectId]?.teamId === t.id && (r.status === 'qa_pending' || r.status === 'qa_in_progress')
    );
    if (waiting && !qaCountByTeam[t.id])
      bottlenecks.push({ level: 'over', text: `${t.name} has releases waiting but no QA testers.` });
  });
  const disputedBugs = bugsF.filter((b) => b.status === 'disputed');
  if (disputedBugs.length) {
    const rels = new Set(disputedBugs.map((b) => b.releaseId)).size;
    bottlenecks.push({
      level: 'warn',
      text: `${disputedBugs.length} bug(s) need clarification across ${rels} release(s) — blocked communication.`,
    });
  }
  // releases drowning in open bugs / blocking bugs
  const OPEN_BUG_THRESHOLD = 5;
  const BLOCKING_THRESHOLD = 3;
  relF.forEach((r) => {
    const rbugs = bugsF.filter((b) => b.releaseId === r.id && b.status !== 'verified');
    const blocking = rbugs.filter((b) => b.severity === 'critical' || b.severity === 'major').length;
    const label = `v${r.version} · ${projectsById[r.projectId]?.name || ''}`;
    if (rbugs.length >= OPEN_BUG_THRESHOLD)
      bottlenecks.push({ level: 'over', text: `${label} has ${rbugs.length} open bugs — stuck in QA.` });
    else if (blocking >= BLOCKING_THRESHOLD)
      bottlenecks.push({ level: 'over', text: `${label} has ${blocking} unresolved Major/Critical bugs.` });
  });
  // developers overloaded with open bugs on their releases
  const devOpen = {};
  bugsF
    .filter((b) => b.status !== 'verified')
    .forEach((b) => {
      const dev = relById(b.releaseId)?.submittedById;
      if (dev) devOpen[dev] = (devOpen[dev] || 0) + 1;
    });
  Object.entries(devOpen)
    .filter(([, n]) => n > 8)
    .forEach(([id, n]) =>
      bottlenecks.push({
        level: 'warn',
        text: `${profilesById[id]?.name || 'A developer'} has ${n} open bugs to fix — possibly overloaded.`,
      })
    );

  // ---- QA quality (resolution outcomes) ----
  const resCounts = {};
  BUG_RESOLUTIONS.forEach((r) => (resCounts[r] = 0));
  bugsF.forEach((b) => {
    if (b.resolution && resCounts[b.resolution] !== undefined) resCounts[b.resolution] += 1;
  });
  const totalBugs = bugsF.length;
  const invalidTotal = BUG_RESOLUTIONS.reduce((s, r) => s + resCounts[r], 0);
  const invalidPct = totalBugs ? Math.round((invalidTotal / totalBugs) * 100) : 0;

  // ---- distributions (charts) ----
  const sevDist = SEVERITY_ORDER.map((s) => ({
    key: s,
    label: SEVERITIES[s].label,
    color: SEVERITIES[s].color,
    n: bugsF.filter((b) => b.severity === s).length,
  }));
  const statusDist = BUG_STATUS_ORDER.map((s) => ({
    key: s,
    label: BUG_STATUSES[s].label,
    color: BUG_STATUSES[s].color,
    n: bugsF.filter((b) => b.status === s).length,
  }));
  const closedBugs = bugsF.filter((b) => b.status === 'verified').length;
  const openBugsCount = bugsF.length - closedBugs;

  // ---- developer & QA performance ----
  const relSubmitter = {};
  relF.forEach((r) => (relSubmitter[r.id] = r.submittedById));
  const devPerf = profiles
    .filter((p) => p.role !== 'QA' && (f.team === 'all' || p.teamId === f.team))
    .map((d) => {
      const myRel = relF.filter((r) => r.submittedById === d.id);
      const myRelIds = new Set(myRel.map((r) => r.id));
      const onMyRel = bugsF.filter((b) => myRelIds.has(b.releaseId));
      return {
        id: d.id,
        name: d.name,
        submitted: myRel.length,
        // queue: bugs waiting on the developer to fix
        awaitingFix: onMyRel.filter((b) => ['open', 'in_progress', 'disputed'].includes(b.status)).length,
        active: myRel.filter((r) => isActiveStatus(r.status)).length,
        openBugs: onMyRel.filter((b) => b.status !== 'verified').length,
      };
    })
    .filter((d) => d.submitted || d.openBugs)
    .sort((a, b) => b.awaitingFix - a.awaitingFix || b.submitted - a.submitted);

  const qaPerf = profiles
    .filter((p) => p.role === 'QA' && (f.team === 'all' || p.teamId === f.team))
    .map((q) => {
      const assigned = relF.filter((r) => r.assignedQa === q.id);
      const appr = assigned.filter((r) => r.status === 'approved' && !blockedReleaseIds.has(r.id)).length;
      const rej = assigned.filter(
        (r) => r.status === 'sent_back' || (r.status === 'approved' && blockedReleaseIds.has(r.id))
      ).length;
      const dec = appr + rej;
      const reportedIds = new Set(bugsF.filter((b) => b.createdById === q.id).map((b) => b.id));
      return {
        id: q.id,
        name: q.name,
        tested: assigned.length,
        reported: reportedIds.size,
        approveRate: dec ? Math.round((appr / dec) * 100) : 0,
        rejectRate: dec ? Math.round((rej / dec) * 100) : 0,
        // queues: releases pending review, in QA, and fixes awaiting re-verification
        pendingQa: assigned.filter((r) => r.status === 'qa_pending').length,
        inQa: assigned.filter((r) => r.status === 'qa_in_progress').length,
        awaitingVerify: bugsF.filter((b) => b.createdById === q.id && b.status === 'fixed').length,
      };
    })
    .filter((q) => q.tested || q.reported || q.awaitingVerify)
    .sort((a, b) => b.inQa + b.pendingQa - (a.inQa + a.pendingQa));

  // ---- per-project table ----
  const rows = projects
    .filter((p) => f.team === 'all' || p.teamId === f.team)
    .map((p) => {
      const rel = relF.filter((r) => r.projectId === p.id);
      const bugCount = bugsF.filter((b) => relById(b.releaseId)?.projectId === p.id).length;
      const avg = avgDaysBetween(
        rel.filter((r) => r.status === 'approved' && r.qaCompletedAt),
        'createdAt',
        'qaCompletedAt'
      );
      const reps = rel.filter((r) => r.status === 'sent_back').length;
      return { project: p, n: rel.length, bugCount, avg, rejRate: rel.length ? Math.round((reps / rel.length) * 100) : 0 };
    })
    .filter((r) => r.n > 0);

  const fSel = { ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12 };
  const devs = profiles.filter((p) => p.role !== 'QA');
  const qas = profiles.filter((p) => p.role === 'QA');
  const th = {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    padding: '7px 8px',
    borderBottom: '1px solid var(--color-border-primary)',
  };
  const td = { fontSize: 12, padding: '8px 8px', borderBottom: '1px solid var(--color-border-primary)' };

  const body = (
    <>
      {/* filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {isAdmin && (
          <select style={fSel} value={f.team} onChange={(e) => set('team', e.target.value)}>
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select style={fSel} value={f.project} onChange={(e) => set('project', e.target.value)}>
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select style={fSel} value={f.platform} onChange={(e) => set('platform', e.target.value)}>
          <option value="all">All platforms</option>
          {RELEASE_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select style={fSel} value={f.environment} onChange={(e) => set('environment', e.target.value)}>
          <option value="all">All environments</option>
          {ENVIRONMENTS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select style={fSel} value={f.developer} onChange={(e) => set('developer', e.target.value)}>
          <option value="all">All developers</option>
          {devs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select style={fSel} value={f.qa} onChange={(e) => set('qa', e.target.value)}>
          <option value="all">All QA</option>
          {qas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          style={{ ...fSel, width: 110 }}
          value={f.version}
          placeholder="Version…"
          onChange={(e) => set('version', e.target.value)}
        />
        <input style={fSel} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} title="From" />
        <input style={fSel} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} title="To" />
        <button style={{ ...ghostButton, padding: '6px 12px', fontSize: 12 }} onClick={reset}>
          Reset
        </button>
      </div>

      {/* QA quality + velocity KPIs */}
      <AnSection title="Release Quality">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Kpi label="Submitted" value={submitted} />
          <Kpi label="Approved" value={approved} sub={`${passRate}% passed QA`} color="var(--success)" />
          <Kpi label="Sent back" value={rejected} sub={`${rejRate}% returned to dev`} color="var(--danger)" />
          <Kpi
            label="Avg release time"
            value={cycleDays == null ? 'In progress' : `${cycleDays.toFixed(1)}d`}
            sub="submit → QA done"
          />
          <Kpi
            label="Production Defects"
            value={prodBugs}
            sub="bugs reported in production"
            color={prodBugs > 0 ? 'var(--danger)' : undefined}
          />
          <Kpi
            label="Carried forward"
            value={carriedBugs}
            sub={`${carryRate}% of bugs${avgIterations ? ` · ~${avgIterations} builds to verify` : ''}`}
            color={carryRate >= 30 ? 'var(--warning)' : undefined}
          />
        </div>
      </AnSection>

      {/* cycle stages + velocity trend */}
      <AnSection title="Release Speed">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ ...card, padding: 14, flex: '1 1 240px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Average stage duration (days)
            </div>
            {[
              ['Submission → QA assigned', toAssign],
              ['QA assigned → QA complete', assignToDone],
              ['Total cycle', cycleDays],
            ].map(([label, v]) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span>{label}</span>
                  <span className="tnum" style={{ color: 'var(--color-text-secondary)' }}>
                    {v == null ? '—' : `${v.toFixed(1)}d`}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--color-background-secondary)' }}>
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 999,
                      background: 'var(--brand)',
                      width: `${Math.min(100, ((v || 0) / Math.max(0.1, cycleDays || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...card, padding: 14, flex: '1 1 240px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              Releases completed / month
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
              {months.map((m) => (
                <div key={m.key} style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    style={{
                      height: `${(m.n / maxMonth) * 64}px`,
                      background: 'var(--brand)',
                      borderRadius: 4,
                      minHeight: 2,
                    }}
                    title={`${m.n} completed`}
                  />
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AnSection>

      {/* bottlenecks */}
      <AnSection title="Delays & Attention Needed">
        {bottlenecks.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>
            No bottlenecks detected for the current filters.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bottlenecks.map((b, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '9px 11px',
                  background: 'var(--color-background-secondary)',
                  border: '1px solid var(--color-border-tertiary)',
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              >
                <span
                  style={{ width: 8, height: 8, borderRadius: 999, background: SLA_COLORS[b.level], flexShrink: 0 }}
                />
                {b.text}
              </div>
            ))}
          </div>
        )}
      </AnSection>

      {/* QA quality insights */}
      <AnSection title="QA Quality Insights">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          {BUG_RESOLUTIONS.map((r) => (
            <Kpi
              key={r}
              label={r}
              value={resCounts[r]}
              sub={`${totalBugs ? Math.round((resCounts[r] / totalBugs) * 100) : 0}% of bugs`}
            />
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
          {invalidPct}% of reported bugs were closed without a code fix.
          {invalidPct >= 30
            ? ' A high share can signal unclear requirements or outdated specs — worth a process review rather than blaming individuals.'
            : ''}
        </div>
      </AnSection>

      {/* charts */}
      <AnSection title="Bug Breakdown">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ ...card, padding: 14, flex: '1 1 240px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              By severity
            </div>
            <DistBars items={sevDist} />
          </div>
          <div style={{ ...card, padding: 14, flex: '1 1 240px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              By status
            </div>
            <DistBars items={statusDist} />
          </div>
          <div style={{ ...card, padding: 14, flex: '1 1 200px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              Open vs Closed
            </div>
            <DistBars
              items={[
                { key: 'open', label: 'Open', color: 'var(--danger)', n: openBugsCount },
                { key: 'closed', label: 'Closed', color: 'var(--success)', n: closedBugs },
              ]}
            />
          </div>
        </div>
      </AnSection>

      {/* developer insights */}
      <AnSection title="Developer Insights">
        {devPerf.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No developer activity.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Developer</th>
                  <th style={th}>Releases submitted</th>
                  <th style={th}>Awaiting fix</th>
                  <th style={th}>Active releases</th>
                  <th style={th}>Open bugs</th>
                </tr>
              </thead>
              <tbody>
                {devPerf.map((d) => (
                  <tr key={d.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{d.name}</td>
                    <td style={td}>{d.submitted}</td>
                    <td style={{ ...td, color: d.awaitingFix ? 'var(--danger)' : undefined, fontWeight: d.awaitingFix > 5 ? 700 : 400 }}>
                      {d.awaitingFix}
                    </td>
                    <td style={td}>{d.active}</td>
                    <td style={{ ...td, color: d.openBugs ? 'var(--danger)' : undefined }}>{d.openBugs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnSection>

      {/* QA insights */}
      <AnSection title="QA Insights">
        {qaPerf.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No QA activity.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>QA engineer</th>
                  <th style={th}>Bugs reported</th>
                  <th style={th}>Approval rate</th>
                  <th style={th}>Rejection rate</th>
                  <th style={th}>Pending QA</th>
                  <th style={th}>In QA</th>
                  <th style={th}>Awaiting verify</th>
                </tr>
              </thead>
              <tbody>
                {qaPerf.map((q) => (
                  <tr key={q.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{q.name}</td>
                    <td style={td}>{q.reported}</td>
                    <td style={{ ...td, color: 'var(--success)' }}>{q.approveRate}%</td>
                    <td style={{ ...td, color: 'var(--danger)' }}>{q.rejectRate}%</td>
                    <td style={td}>{q.pendingQa}</td>
                    <td style={{ ...td, color: q.inQa > 3 ? 'var(--danger)' : undefined, fontWeight: q.inQa > 3 ? 700 : 400 }}>
                      {q.inQa}
                    </td>
                    <td style={{ ...td, color: q.awaitingVerify ? 'var(--warning)' : undefined }}>{q.awaitingVerify}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnSection>

      {/* workload */}
      <AnSection title="Workload by team member">
        {wlMembers.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No active assignments.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Member</th>
                  <th style={th}>Role</th>
                  <th style={th}>Active releases</th>
                  <th style={th}>Pending reviews</th>
                  <th style={th}>Open bugs</th>
                </tr>
              </thead>
              <tbody>
                {wlMembers.map((w) => (
                  <tr key={w.m.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{w.m.name}</td>
                    <td style={td}>{w.m.role}</td>
                    <td style={td}>{w.activeReleases}</td>
                    <td style={{ ...td, color: w.pendingReviews > 3 ? 'var(--danger)' : undefined, fontWeight: w.pendingReviews > 3 ? 700 : 400 }}>
                      {w.pendingReviews}
                    </td>
                    <td style={td}>{w.openBugs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnSection>

      {/* per-project */}
      <AnSection title="By project">
        {rows.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)' }}>No releases match the filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Project</th>
                  <th style={th}>Releases</th>
                  <th style={th}>Bugs</th>
                  <th style={th}>Avg cycle</th>
                  <th style={th}>Rejection</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.project.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{r.project.name}</td>
                    <td style={td}>{r.n}</td>
                    <td style={td}>{r.bugCount}</td>
                    <td style={td}>{r.avg == null ? '—' : `${r.avg.toFixed(1)}d`}</td>
                    <td style={td}>{r.rejRate}%</td>
                    <td style={td}>
                      <button
                        onClick={() => onOpenHistory(r.project)}
                        style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
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
      </AnSection>

      <div style={{ fontSize: 10.5, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
        Release-speed and attention metrics use submission, QA-assigned and QA-complete timestamps recorded from now on;
        releases created before tracking are excluded from stage averages.
      </div>
    </>
  );

  if (embedded)
    return (
      <>
        <PageHeader title="Analytics" subtitle="Release speed, quality, workload and delays" />
        {body}
      </>
    );

  return (
    <ModalShell onClose={onClose} title="Analytics" maxWidth={860}>
      {body}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
    .filter((r) => r.status === 'approved')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const lines = [`# ${project.name} — Changelog`, ''];
  if (done.length === 0) lines.push('_No QA-complete releases yet._');
  done.forEach((r) => {
    lines.push(`## v${r.version} — ${r.date}`);
    lines.push(`Platform: ${r.platform} · ${r.environment || 'Production'} · Type: ${r.releaseType}`);
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
                  background: STATUSES[r.status]?.color || '#64748b',
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
                  {r.platform} · {r.environment || 'Production'} · {r.date} · {r.submittedBy}
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
