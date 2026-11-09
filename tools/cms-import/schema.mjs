/* The CMS import format: sheets, columns and allowed values.
   Self-contained on purpose: this tool does not import from src/, so it can be
   deleted (or kept) without touching the app. The values mirror the check
   constraints in supabase/migrations/202611060001_cms_projects.sql and
   202611050004_project_info.sql; the database rejects anything else anyway. */

export const KINDS = {
  website: 'Website / Landing page',
  api_integration: 'API Integration',
};

/* Values used by the time-log exports that the app has no equivalent for. */
export const KIND_ALIASES = { 'app landing page': 'website' };
// new_development isn't a category: landing-page titles are app_landing, the rest major_functionality
export function categoryForNewDevelopment(title) {
  return /landing/i.test(String(title ?? '')) ? 'app_landing' : 'major_functionality';
}

// requested_by is always PM on the imports: blank means pmo, and PM is accepted as a value
export const DEFAULT_REQUESTER = 'pmo';
export const REQUESTER_ALIASES = { pm: 'pmo' };
export const REQUESTERS = { am: 'AM', pmo: 'PMO', seo: 'SEO team' };
export const CHANNELS = { basecamp: 'Basecamp', crm: 'CRM', group: 'Group', other: 'Other' };

// category -> label, the CMS kind it belongs to, and who may request it (same rules as the app)
export const CATEGORIES = {
  existing_changes: { label: 'Existing project changes', kind: 'website', requesters: ['am', 'pmo'] },
  major_functionality: { label: 'Existing project major functionality', kind: 'website', requesters: ['am', 'pmo'] },
  recovery: { label: 'Website recovery', kind: 'website', requesters: ['am', 'pmo'] },
  blogs: { label: 'Blogs uploading', kind: 'website', requesters: ['seo', 'pmo'] },
  seo_speed: { label: 'Website SEO / speed optimization', kind: 'website', requesters: ['seo', 'pmo'] },
  app_landing: { label: 'App landing page', kind: 'website', requesters: ['am', 'pmo'] },
  api_integration: { label: 'Website API integration', kind: 'api_integration', requesters: ['am', 'pmo'] },
};

// website projects can also take API integration work; api_integration projects take only that
export function categorySuitsKind(category, kind) {
  return CATEGORIES[category].kind === kind || (category === 'api_integration' && kind === 'website');
}

export const PRIORITIES = { Low: 'Low', Medium: 'Medium', High: 'High' };
export const TASK_STATUSES = { todo: 'To do', in_progress: 'In progress', in_review: 'In review', done: 'Done', on_hold: 'On hold' };

export const STAGES = {
  template_selection: 'Template selection',
  landing_development: 'Landing page development',
  subpages: 'Subpages creation',
  prelaunch_api: 'Pre-launch API integration',
  review_revisions: 'Review & revisions',
  prelaunch_qa: 'Pre-launch testing & QA',
  deployment: 'Deployment (go-live)',
  postlaunch_api: 'Post-launch API integration',
  handover: 'Final testing & handover',
};
export const STAGE_STATUSES = { pending: 'Not started', in_progress: 'In progress', done: 'Done', skipped: 'Skipped' };

export const MEMBER_ROLES = { developer: 'Developer', qa: 'QA', lead: 'Lead' };

export const LINK_CATEGORIES = {
  domain: 'Domain / website',
  staging: 'Staging',
  landing: 'Landing page',
  server: 'Server details',
  docs: 'Documentation',
  sow: 'SOW',
  design: 'Design',
  brand: 'Brand guidelines',
  other: 'Other',
};

/* Sheets in the workbook. `req` columns must be filled on every row.
   `note` is shown on the Instructions sheet. */
export const SHEETS = [
  {
    name: 'Projects',
    about: 'One row per CMS project. A project that already exists (same name) is updated, not duplicated.',
    columns: [
      { key: 'project_name', req: true, note: 'Unique name. Used to link rows on the other sheets.' },
      { key: 'cms_kind', note: 'website (default) or api_integration. App Landing Page is stored as website.', values: KINDS },
      { key: 'team', note: 'Team name exactly as in the app. Blank = no team.' },
      { key: 'brand', note: 'Brand name exactly as in the app. Blank = default brand.' },
    ],
  },
  {
    name: 'Tasks',
    about: 'Work requests. A task with the same project, category and title as an existing one is skipped, unless the assignee is someone else: then this row\'s details are added to it.',
    columns: [
      { key: 'project_name', req: true, note: 'A row on Projects or a CMS project already in the app. Any other name creates a new project.' },
      { key: 'category', req: true, note: 'Must suit the project kind (api_integration projects only take api_integration; website projects take any category). new_development becomes app_landing for landing-page titles, otherwise major_functionality.', values: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])) },
      { key: 'title', req: true, note: 'Short summary.' },
      { key: 'details', note: 'Longer description.' },
      { key: 'requested_by', note: 'Blank or PM = pmo. Otherwise am or seo. Blogs / SEO tasks: seo or pmo. Others: am or pmo.', values: REQUESTERS },
      { key: 'channel', note: 'Where the request came in.', values: CHANNELS },
      { key: 'reference_url', note: 'Link to the request (must start with http:// or https://).' },
      { key: 'assignee_email', note: 'Email of an existing user. Blank = unassigned.' },
      { key: 'priority', values: PRIORITIES },
      { key: 'status', note: 'Default todo.', values: TASK_STATUSES },
      { key: 'due_date', note: 'YYYY-MM-DD or an Excel date.' },
      { key: 'requested_on', note: 'Original request date (YYYY-MM-DD). Blank = import date.' },
    ],
  },
  {
    name: 'Journey',
    about: 'Development journey of a new build. Listing any stage starts the journey: all 9 stages are created and the ones not listed stay "Not started". Rows update existing stages.',
    columns: [
      { key: 'project_name', req: true },
      { key: 'stage', req: true, values: STAGES },
      { key: 'status', note: 'Default pending.', values: STAGE_STATUSES },
      { key: 'owner_email', note: 'Email of an existing user.' },
      { key: 'due_date', note: 'YYYY-MM-DD or an Excel date.' },
      { key: 'notes' },
    ],
  },
  {
    name: 'Members',
    about: 'Who works on the project. Someone already on the project is skipped. Users from another team are added as support access, as in the app.',
    columns: [
      { key: 'project_name', req: true },
      { key: 'email', req: true, note: 'Email of an existing user (not an Admin).' },
      { key: 'project_role', note: 'Default developer.', values: MEMBER_ROLES },
      { key: 'support_expires_on', note: 'Only for users from another team. Blank = no expiry.' },
    ],
  },
  {
    name: 'Links',
    about: 'Non-secret project information (domains, staging, docs, designs). Same project, category and title as an existing link is skipped. Never put passwords here: add credentials on the Project info page.',
    columns: [
      { key: 'project_name', req: true },
      { key: 'category', req: true, values: LINK_CATEGORIES },
      { key: 'title', req: true },
      { key: 'url', note: 'Must start with http:// or https://.' },
      { key: 'notes', note: 'Plain notes. No passwords or keys.' },
    ],
  },
];
