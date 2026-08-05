CREATE TABLE IF NOT EXISTS "public"."bug_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bug_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "author_name" "text" NOT NULL,
    "author_role" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bug_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bug_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bug_id" "uuid" NOT NULL,
    "release_id" "uuid",
    "action" "text" NOT NULL,
    "previous_status" "text",
    "new_status" "text",
    "moved_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bug_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bugs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "release_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "severity" "text" DEFAULT 'major'::"text" NOT NULL,
    "screenshot_url" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_by" "text" NOT NULL,
    "created_by_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "feature" "text",
    "resolution" "text",
    "wbs_task_id" "uuid",
    "bug_key" "uuid" DEFAULT "gen_random_uuid"(),
    "origin_release_id" "uuid",
    "carried_from_release_id" "uuid",
    "carried_forward" boolean DEFAULT false NOT NULL,
    "iteration" integer DEFAULT 1 NOT NULL,
    "verified_at" timestamp with time zone,
    "verified_by_id" "uuid",
    "resolution_by_id" "uuid",
    "resolution_note" "text",
    "resolution_at" timestamp with time zone
);


ALTER TABLE "public"."bugs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checklist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."checklist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "token" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "show_open_bugs" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "release_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "author_id" "uuid",
    "author_name" "text" NOT NULL,
    "author_role" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "release_id" "uuid",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "bug_id" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "link" "text"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "name" "text" NOT NULL,
    "role" "text" DEFAULT 'Developer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_id" "uuid"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_role" "text" DEFAULT 'developer'::"text" NOT NULL,
    "access_type" "text" DEFAULT 'home'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_id" "uuid",
    "wbs_enabled" boolean DEFAULT false NOT NULL,
    "project_type" "text",
    "completion_date" "date",
    "deployment_date" "date"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."release_checklist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "release_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "checked" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."release_checklist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."release_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "release_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "task_name" "text" NOT NULL,
    "track" "text" DEFAULT 'both'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."release_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."releases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "submitted_by" "text" NOT NULL,
    "submitted_by_role" "text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "release_notes" "text" NOT NULL,
    "status" "text" DEFAULT 'qa_pending'::"text" NOT NULL,
    "qa_note" "text" DEFAULT ''::"text",
    "project_id" "uuid",
    "release_type" "text" DEFAULT 'apk'::"text" NOT NULL,
    "file_url" "text" DEFAULT ''::"text",
    "link_url" "text" DEFAULT ''::"text",
    "submitted_by_id" "uuid",
    "assigned_qa" "uuid",
    "qa_completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "environment" "text" DEFAULT 'Production'::"text" NOT NULL,
    "status_changed_at" timestamp with time zone,
    "qa_assigned_at" timestamp with time zone,
    "component" "text",
    "supersedes_release_id" "uuid",
    "closed_at" timestamp with time zone,
    "wbs_platform_type" "text"
);


ALTER TABLE "public"."releases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "fcm_token" "text" NOT NULL,
    "platform" "text" DEFAULT 'web'::"text" NOT NULL,
    "user_agent" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wbs_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "import_key" "text" NOT NULL,
    "platform_type" "text",
    "module" "text" DEFAULT ''::"text",
    "type" "text" DEFAULT 'task'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "dev_comments" "text" DEFAULT ''::"text",
    "estimated_completion_date" "text" DEFAULT ''::"text",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "assigned_to" "uuid",
    "priority" "text",
    "actual_completion_date" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wbs_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wbs_platform_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "platform_type" "text" NOT NULL,
    "completion_date" "date",
    "deployment_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wbs_platform_targets" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bug_comments"
    ADD CONSTRAINT "bug_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bug_history"
    ADD CONSTRAINT "bug_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bugs"
    ADD CONSTRAINT "bugs_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."bugs"
    ADD CONSTRAINT "bugs_severity_chk" CHECK (("lower"("severity") = ANY (ARRAY['critical'::"text", 'major'::"text", 'minor'::"text"]))) NOT VALID;



ALTER TABLE "public"."bugs"
    ADD CONSTRAINT "bugs_status_chk" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'fixed'::"text", 'disputed'::"text", 'pending_tl'::"text", 'verified'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."checklist_items"
    ADD CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_links"
    ADD CONSTRAINT "client_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_links"
    ADD CONSTRAINT "client_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_user_id_key" UNIQUE ("project_id", "user_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."release_checklist"
    ADD CONSTRAINT "release_checklist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."release_checklist"
    ADD CONSTRAINT "release_checklist_release_id_item_id_key" UNIQUE ("release_id", "item_id");



ALTER TABLE ONLY "public"."release_tasks"
    ADD CONSTRAINT "release_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."releases"
    ADD CONSTRAINT "releases_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."releases"
    ADD CONSTRAINT "releases_status_chk" CHECK (("status" = ANY (ARRAY['qa_pending'::"text", 'qa_in_progress'::"text", 'qa_done'::"text", 'approved'::"text", 'sent_back'::"text", 'closed'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_fcm_token_key" UNIQUE ("fcm_token");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."wbs_items"
    ADD CONSTRAINT "wbs_items_status_chk" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'in_qa'::"text", 'completed'::"text", 'blocked'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."wbs_platform_targets"
    ADD CONSTRAINT "wbs_platform_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wbs_platform_targets"
    ADD CONSTRAINT "wbs_platform_targets_project_id_platform_type_key" UNIQUE ("project_id", "platform_type");



ALTER TABLE ONLY "public"."wbs_items"
    ADD CONSTRAINT "wbs_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wbs_items"
    ADD CONSTRAINT "wbs_tasks_project_id_import_key_key" UNIQUE ("project_id", "import_key");



CREATE INDEX "bug_history_bug_idx" ON "public"."bug_history" USING "btree" ("bug_id", "created_at");



CREATE INDEX "bugs_bug_key_idx" ON "public"."bugs" USING "btree" ("bug_key");



CREATE INDEX "bugs_carried_from_idx" ON "public"."bugs" USING "btree" ("carried_from_release_id");



CREATE INDEX "bugs_resolution_by_idx" ON "public"."bugs" USING "btree" ("resolution_by_id");



CREATE INDEX "bugs_wbs_task_idx" ON "public"."bugs" USING "btree" ("wbs_task_id");



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "project_members_project_idx" ON "public"."project_members" USING "btree" ("project_id");



CREATE INDEX "project_members_user_idx" ON "public"."project_members" USING "btree" ("user_id");



CREATE INDEX "releases_supersedes_idx" ON "public"."releases" USING "btree" ("supersedes_release_id");



CREATE UNIQUE INDEX "releases_version_uidx" ON "public"."releases" USING "btree" ("project_id", "lower"("version"), "platform", COALESCE("component", ''::"text"));



CREATE INDEX "user_devices_enabled_idx" ON "public"."user_devices" USING "btree" ("user_id", "enabled");



CREATE INDEX "user_devices_user_idx" ON "public"."user_devices" USING "btree" ("user_id");



CREATE INDEX "wbs_items_platform_type_idx" ON "public"."wbs_items" USING "btree" ("project_id", "platform_type");



CREATE INDEX "wbs_items_project_idx" ON "public"."wbs_items" USING "btree" ("project_id");



ALTER TABLE ONLY "public"."bug_comments"
    ADD CONSTRAINT "bug_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bug_comments"
    ADD CONSTRAINT "bug_comments_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "public"."bugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bug_history"
    ADD CONSTRAINT "bug_history_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "public"."bugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bug_history"
    ADD CONSTRAINT "bug_history_moved_by_fkey" FOREIGN KEY ("moved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bug_history"
    ADD CONSTRAINT "bug_history_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bugs"
    ADD CONSTRAINT "bugs_carried_from_release_id_fkey" FOREIGN KEY ("carried_from_release_id") REFERENCES "public"."releases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bugs"
    ADD CONSTRAINT "bugs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bugs"
    ADD CONSTRAINT "bugs_origin_release_id_fkey" FOREIGN KEY ("origin_release_id") REFERENCES "public"."releases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bugs"
    ADD CONSTRAINT "bugs_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bugs"
    ADD CONSTRAINT "bugs_resolution_by_id_fkey" FOREIGN KEY ("resolution_by_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bugs"
    ADD CONSTRAINT "bugs_wbs_task_id_fkey" FOREIGN KEY ("wbs_task_id") REFERENCES "public"."wbs_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklist_items"
    ADD CONSTRAINT "checklist_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_links"
    ADD CONSTRAINT "client_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_bug_id_fkey" FOREIGN KEY ("bug_id") REFERENCES "public"."bugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."release_checklist"
    ADD CONSTRAINT "release_checklist_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."checklist_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."release_checklist"
    ADD CONSTRAINT "release_checklist_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."release_tasks"
    ADD CONSTRAINT "release_tasks_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."release_tasks"
    ADD CONSTRAINT "release_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."wbs_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."releases"
    ADD CONSTRAINT "releases_assigned_qa_fkey" FOREIGN KEY ("assigned_qa") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."releases"
    ADD CONSTRAINT "releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."releases"
    ADD CONSTRAINT "releases_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."releases"
    ADD CONSTRAINT "releases_supersedes_release_id_fkey" FOREIGN KEY ("supersedes_release_id") REFERENCES "public"."releases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wbs_items"
    ADD CONSTRAINT "wbs_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wbs_platform_targets"
    ADD CONSTRAINT "wbs_platform_targets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wbs_items"
    ADD CONSTRAINT "wbs_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
