# CMS projects importer

A standalone tool for loading CMS projects into the app from an Excel workbook.
Nothing in the app imports from this folder, and it imports nothing from `src/`.
When you no longer need it, delete the folder.

## What it imports

| Sheet      | Creates                                   | Required columns                                    |
|------------|-------------------------------------------|-----------------------------------------------------|
| `Projects` | CMS projects (`projects`, type `cms`)     | `project_name`                                      |
| `Tasks`    | Work requests (`cms_tasks`)               | `project_name`, `category`, `title`, `requested_by` |
| `Journey`  | Development journey (`cms_stages`)        | `project_name`, `stage`                             |
| `Members`  | Project members (`project_members`)       | `project_name`, `email`                             |
| `Links`    | Project info links (`project_resources`)  | `project_name`, `category`, `title`                 |

Only `Projects` is needed. The other sheets are optional and can be left empty.
The **Instructions** sheet in the template lists every column and its allowed values.

Credentials (logins, passwords, keys) are **not** imported. They are kept encrypted
in Supabase Vault, so add them on each project's **Project info** page. The importer
rejects link notes that look like they contain a password.

## Steps

1. **Fill in the template.** Copy `cms-import-template.xlsx` into `tools/cms-import/data/`.
   Git ignores that folder, so client data never gets committed. Fill it in.
   `cms-import-example.xlsx` shows filled-in rows.
2. **Get the service role key** for the target project: Supabase → Project Settings → API → `service_role`.
   Pass it on the command line only. Never save it in a file in the repo.
3. **Check** the file. This validates every row and shows what would change, without writing anything:

   ```bash
   SUPABASE_SERVICE_ROLE_KEY=... node tools/cms-import/import.mjs check tools/cms-import/data/cms.xlsx --env staging
   ```

4. **Apply** once the check is clean. It asks you to type the project ref before writing:

   ```bash
   SUPABASE_SERVICE_ROLE_KEY=... node tools/cms-import/import.mjs apply tools/cms-import/data/cms.xlsx --env staging
   ```

`--env staging` reads the Supabase URL from `.env.staging.local`, and `--env production`
reads it from `.env.production.local`. Without `--env`, the URL comes from `.env.local`.
Setting `SUPABASE_URL` overrides all of them. The first line of the output always shows
which database is targeted.

To regenerate the blank template or the example:

```bash
node tools/cms-import/import.mjs template tools/cms-import/cms-import-template.xlsx
node tools/cms-import/import.mjs template tools/cms-import/cms-import-example.xlsx --example
```

## How rows are matched

The import is safe to run again with the same file, or with a file that only holds new rows:

- **Projects** are matched by name, ignoring case. An existing CMS project gets the
  `cms_kind`, `team` and `brand` cells you filled; blank cells leave it unchanged.
  A name already used by a mobile or web project is an error.
- **Tasks** and **Links** with the same project, category and title as an existing one are skipped.
- **Journey**: listing any stage for a project starts its journey. All 9 stages are
  created, as the app does, and each listed row updates its stage.
- **Members** already on the project are skipped. Admins are skipped, because they already see
  every project. A user from another team is added with *support* access, as the app does.
- Rows on `Tasks`, `Journey`, `Members` and `Links` can point at a CMS project that is
  already in the app, so later files don't need to repeat the `Projects` sheet.

Values can be typed as the key (`in_progress`) or as the label shown in the app
(`In progress`). Dates can be Excel dates or `YYYY-MM-DD`. Users and teams are matched
by email and by name.

## Good to know

- The whole file is validated before anything is written. If any row has a problem,
  nothing is imported and every problem is listed with its sheet and row number.
- Supabase has no multi-table transaction from a script. If a write fails halfway
  (for example a network drop), fix the cause and run `apply` again. Rows already
  written are matched and skipped.
- The database stamps *completed* and *started* times with the import time. Only a
  task's `requested_on` date is kept as its creation date.
- The importer uses the service role, so it bypasses row-level security. Use it only
  from a trusted machine.
- The allowed values in `schema.mjs` copy the database's check constraints. If the
  CMS migration gains a new category or status, add it there too.
