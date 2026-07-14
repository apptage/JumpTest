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
import {
  greeting,
  Empty,
  PageHeader,
  authLink,
  Field,
  statusSince,
  SlaBadge,
  StatusAge,
  EnvBadge,
  sideHead,
  relativeTime,
  TagChip,
} from '@shared/ui-kit.jsx';
import { WbsPage } from '@features/wbs';
import { AnalyticsModal, HistoryModal, ManagerDashboard } from '@features/analytics';
import { ProjectsTab, UsersTab, TeamsTab } from '@features/admin';
import { SubmitModal, EditReleaseModal, DetailModal } from '@features/releases';
import { AuthScreen, SetPasswordScreen } from '@features/auth';
import { BugsPage } from '@features/bugs';
import { StatCards, FilterBar, ReleaseCard, Sidebar, RightPanel } from '@features/dashboard';
import { NavRail, Header, SettingsPage } from '@/shell';
import { useAppData } from '@shared/useAppData.js';
import { usePush } from '@/push/usePush.js';
import { unregisterDevice } from '@/push/pushClient.js';

/* ================================================================== */
/* Root                                                               */
/* ================================================================== */

export default function ReleaseTracker() {
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [recovery, setRecovery] = useState(false);

  // server state (projects/releases/bugs/…) is provided by useAppData (React Query) below
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const [projectFilter, setProjectFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // persist the active page across refreshes (no router yet)
  const KNOWN_PAGES = ['dashboard', 'bugs', 'projects', 'analytics', 'users', 'teams', 'settings', 'wbs'];
  const [page, setPage] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('jt_page') : null;
    return saved && KNOWN_PAGES.includes(saved) ? saved : 'dashboard';
  });
  useEffect(() => {
    try {
      localStorage.setItem('jt_page', page);
    } catch (_) {
      /* storage unavailable — non-critical */
    }
  }, [page]);
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

  // Cold-start deep-link: the service worker may open a fresh tab at
  // /?release=<id> when a background notification is tapped with no tab open.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const rel = params.get('release');
    if (rel) {
      setSelectedId(rel);
      setPage('dashboard');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  /* ---- server state via React Query ----
     Independent queries (no fragile Promise.all), auto-fetch when a user is
     present, notifications poll every 30s. refetchX() are cache invalidations
     so the existing mutation handlers work unchanged. */
  const {
    projects,
    releases,
    bugs,
    profiles,
    teams,
    projectMembers,
    checklistItems,
    notifications,
    loading,
    refetchReleases,
    refetchBugs,
    refetchProjects,
    refetchProfiles,
    refetchChecklist,
    refetchTeams,
    refetchProjectMembers,
    refetchNotifications,
    resetAll,
  } = useAppData(session, user, showToast);

  /* ---- push notifications (FCM) ---- */
  usePush(user, {
    // app is focused → surface as a toast + refresh the bell
    onForeground: ({ title, body }) => {
      showToast(body || title || 'New notification');
      refetchNotifications();
    },
    // a backgrounded notification was tapped → deep-link to the release/bug
    onOpen: (data) => {
      if (data?.releaseId) {
        setSelectedId(data.releaseId);
        setPage('dashboard');
        setShowNotif(false);
      }
    },
  });

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

  const scopedProjects = useMemo(() => {
    if (adminScope) return projects;
    // Fallback: a non-admin with no active project memberships (feature not set
    // up / backfill missed them) falls back to team scoping so they are never
    // locked out of their own team's data.
    if (myProjectIds.size === 0) return projects.filter((p) => p.teamId === myTeamId);
    return projects.filter((p) => myProjectIds.has(p.id));
  }, [projects, adminScope, myProjectIds, myTeamId]);
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // Set the session synchronously from the sign-in response instead of
      // waiting for onAuthStateChange — otherwise queries can fire before the
      // JWT is attached and RLS quietly returns empty rows.
      if (data.session) setSession(data.session);
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
    // When email confirmation is disabled, sign-up returns a live session —
    // set it immediately (same reasoning as sign-in) so data loads right away.
    if (data.session) setSession(data.session);
    showToast(
      data.session
        ? 'Account created'
        : 'Account created — confirm via email, then sign in.'
    );
  }

  async function handleSignOut() {
    await unregisterDevice(); // stop this browser receiving the prev user's pushes
    await supabase.auth.signOut();
    resetAll();
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
      // Follow-up detection: a new build supersedes EVERY open sent-back cycle
      // on the same platform. Mobile spans both APK/Android and TestFlight/iOS,
      // so a mobile follow-up carries bugs from both; Web spans web releases.
      const newPlatform = form.platform || platformForReleaseType(form.releaseType);
      // web streams are per-component; mobile has no component axis
      const newComponent = newPlatform === 'Web' ? form.component || '' : '';
      const priors = await api.fetchSentBackReleases(
        form.projectId,
        user.id,
        newPlatform,
        newComponent
      );
      const primaryPrior = priors[0] || null;

      // Release notes:
      //  - tasks selected → generated from the tasks (feature release)
      //  - WBS project, no tasks, but prior sent-back cycle(s) → bug-fix release
      //  - otherwise → the manually-entered notes
      let notes;
      if (wbsItems.length) {
        notes = wbsItems.map((t) => `- ${t.name}`).join('\n') + extraNote;
      } else if (wbsEnabled && priors.length) {
        notes = `Bug fixes for ${priors.map((p) => `v${p.version}`).join(', ')}` + extraNote;
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
        supersedes_release_id: primaryPrior ? primaryPrior.id : null,
        wbs_platform_id: form.wbsPlatformId || null,
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

      // notify the team's reviewers (QA + Team Lead) that a build needs QA
      const teamId = projectsById[form.projectId]?.teamId;
      const reviewers = profiles
        .filter(
          (p) =>
            (p.role === 'QA' || p.role === 'Team Lead') &&
            teamId &&
            p.teamId === teamId &&
            p.id !== user.id
        )
        .map((p) => p.id);
      await api.notify(reviewers, {
        type: 'release_submitted',
        title: 'New release for QA',
        message: `${user.name} submitted ${newPlatform} v${form.version.trim()} for QA`,
        releaseId,
      });

      // Close every superseded release (all open cycles on this platform) and
      // carry all their unresolved bugs onto the new release.
      if (priors.length) {
        let pendingVerify = 0;
        let unresolved = 0;
        const qaIds = new Set();
        for (const prior of priors) {
          await api.closeRelease(prior.id);
          const s = await api.carryForwardBugs(prior.id, releaseId);
          pendingVerify += s.pendingVerify;
          unresolved += s.unresolved;
          if (prior.assignedQa) qaIds.add(prior.assignedQa);
        }
        for (const qaId of qaIds) {
          await api.createNotification({
            user_id: qaId,
            type: 'release_followup',
            message: `${user.name} submitted a follow-up v${form.version.trim()} for QA — ${pendingVerify} fix(es) to verify, ${unresolved} still open.`,
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
      // notify the developer who submitted the release of the QA milestone
      const verb = {
        qa_in_progress: 'started QA on',
        qa_done: 'completed QA on',
        approved: 'approved',
        sent_back: 'sent back',
      }[newStatus];
      if (verb && release.submittedById && release.submittedById !== user.id) {
        await api.notify([release.submittedById], {
          type: `release_${newStatus}`,
          title: 'Release update',
          message: `${user.name} ${verb} v${release.version}`,
          releaseId: release.id,
        });
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
    if (ok) {
      if (qaId && qaId !== user.id) {
        await api.notify([qaId], {
          type: 'qa_assigned',
          title: 'Assigned to you',
          message: `${user.name} assigned you to QA v${release.version}`,
          releaseId: release.id,
        });
      }
      refetchReleases();
    }
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
    // A plain developer's close is a *proposal*: park the bug in `pending_tl`
    // and ask the project's Team Lead to verify. QA / Team Lead / Admin close
    // immediately (they are the verifier).
    const isDevProposal = user.role === 'Developer';
    // capture the developer's optional reason up front (outside run(), so the
    // submit spinner doesn't spin behind a blocking prompt)
    const note = isDevProposal
      ? (window.prompt(`Optionally add a reason for marking "${bug.title}" as ${resolution}:`, '') || '').trim()
      : '';
    const ok = await run(async () => {
      if (isDevProposal) {
        await api.updateBug(bug.id, {
          status: 'pending_tl',
          resolution,
          resolution_by_id: user.id,
          resolution_note: note || null,
          resolution_at: new Date().toISOString(),
        });
        const teamId = projectsById[release.projectId]?.teamId;
        const leads = profiles.filter(
          (p) => p.role === 'Team Lead' && teamId && p.teamId === teamId
        );
        for (const lead of leads) {
          await api.createNotification({
            user_id: lead.id,
            type: 'bug_close_requested',
            message: `${user.name} marked bug "${bug.title}" as ${resolution}${note ? ` — "${note}"` : ''} — needs your verification (v${release.version})`,
            release_id: release.id,
            bug_id: bug.id,
          });
        }
      } else {
        await api.updateBug(bug.id, {
          status: 'verified',
          resolution,
          verified_at: new Date().toISOString(),
          verified_by_id: user.id,
        });
        await reconcileWbsTaskForBug(release, bug);
      }
    }, isDevProposal ? 'Sent for Team Lead verification' : 'Bug closed');
    if (ok) refetchBugs();
  }

  // Team Lead approves or rejects a developer's proposed close (`pending_tl`).
  async function handleBugCloseReview(release, bug, decision) {
    const ok = await run(async () => {
      if (decision === 'approve') {
        await api.updateBug(bug.id, {
          status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by_id: user.id,
        });
        await reconcileWbsTaskForBug(release, bug);
        if (bug.resolutionById) {
          await api.createNotification({
            user_id: bug.resolutionById,
            type: 'bug_close_approved',
            message: `${user.name} approved closing "${bug.title}" as ${bug.resolution} (v${release.version})`,
            release_id: release.id,
          });
        }
      } else {
        // reject → it IS a real bug: send it back to the developer to fix
        await api.updateBug(bug.id, {
          status: 'in_progress',
          resolution: '',
          resolution_by_id: null,
        });
        if (bug.resolutionById) {
          await api.createNotification({
            user_id: bug.resolutionById,
            type: 'bug_close_rejected',
            message: `${user.name} rejected your "${bug.resolution}" decision on "${bug.title}" — please fix it (v${release.version})`,
            release_id: release.id,
          });
        }
      }
    }, decision === 'approve' ? 'Bug closed' : 'Sent back to developer');
    if (ok) refetchBugs();
  }

  async function handleDeleteBug(bug) {
    if (!window.confirm('Delete this bug?')) return;
    const ok = await run(() => api.deleteBug(bug.id));
    if (ok) refetchBugs();
  }

  /* ---- comments ---- */
  async function handleAddComment(release, body, parentId) {
    const text = body.trim();
    const ok = await run(() =>
      api.createComment({
        release_id: release.id,
        parent_id: parentId || null,
        author_id: user.id,
        author_name: user.name,
        author_role: user.role,
        body: text,
      })
    );
    // notify @mentions + the release participants (best-effort)
    try {
      const lower = text.toLowerCase();
      const mentionIds = profiles
        .filter((p) => p.id !== user.id && p.name && lower.includes('@' + p.name.toLowerCase()))
        .map((p) => p.id);
      if (mentionIds.length) {
        await api.notify(mentionIds, {
          type: 'mention',
          title: 'You were mentioned',
          message: `${user.name} mentioned you on v${release.version}`,
          releaseId: release.id,
        });
      }
      const participants = [release.submittedById, release.assignedQa].filter(
        (id) => id && id !== user.id && !mentionIds.includes(id)
      );
      if (participants.length) {
        await api.notify(participants, {
          type: 'comment',
          title: 'New comment',
          message: `${user.name} commented on v${release.version}`,
          releaseId: release.id,
        });
      }
    } catch {
      /* notifications are best-effort */
    }
    return ok;
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
                user={user}
                isSubmitting={isSubmitting}
                onOpenRelease={(id) => {
                  setSelectedId(id);
                  setPage('dashboard');
                }}
                onBugStatus={handleBugStatus}
                onBugResolve={handleBugResolve}
                onBugCloseReview={handleBugCloseReview}
                onDeleteBug={handleDeleteBug}
              />
            )}

            {page === 'wbs' && (
              <WbsPage user={user} projects={scopedProjects} showToast={showToast} />
            )}

            {page === 'analytics' && canManage && (
              isAdmin ? (
                <ManagerDashboard
                  projects={scopedProjects}
                  releases={scopedReleases}
                  bugs={scopedBugs}
                  profiles={profiles}
                  teams={teams}
                  projectsById={projectsById}
                  profilesById={profilesById}
                  onOpenRelease={(id) => setSelectedId(id)}
                />
              ) : (
                <AnalyticsModal
                  embedded
                  projects={scopedProjects}
                  releases={scopedReleases}
                  bugs={scopedBugs}
                  profiles={profiles}
                  teams={teams.filter((t) => t.id === myTeamId)}
                  isAdmin={isAdmin}
                  onOpenHistory={(p) => setHistoryProject(p)}
                />
              )
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
          onBugCloseReview={handleBugCloseReview}
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

