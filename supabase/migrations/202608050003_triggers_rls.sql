CREATE OR REPLACE TRIGGER "profiles_role_guard" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_role_change"();



CREATE OR REPLACE TRIGGER "profiles_role_insert_guard" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_role_insert"();



CREATE OR REPLACE TRIGGER "releases_approval_gate" BEFORE INSERT OR UPDATE ON "public"."releases" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_release_approval"();



CREATE OR REPLACE TRIGGER "releases_qa_actor_gate" BEFORE UPDATE ON "public"."releases" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_release_qa_actor"();
ALTER TABLE "public"."bug_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bug_comments_delete" ON "public"."bug_comments" FOR DELETE TO "authenticated" USING ((("author_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "bug_comments_insert" ON "public"."bug_comments" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_write"() AND (EXISTS ( SELECT 1
   FROM "public"."bugs" "b"
  WHERE (("b"."id" = "bug_comments"."bug_id") AND ("public"."manages_project"("public"."release_project"("b"."release_id")) OR ("public"."release_team"("b"."release_id") = "public"."my_team"()) OR "public"."is_project_member"("public"."release_project"("b"."release_id"))))))));



CREATE POLICY "bug_comments_select" ON "public"."bug_comments" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."bug_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bug_history_insert" ON "public"."bug_history" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_write"() AND ("moved_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."bugs" "b"
  WHERE (("b"."id" = "bug_history"."bug_id") AND ("public"."manages_project"("public"."release_project"("b"."release_id")) OR ("public"."release_team"("b"."release_id") = "public"."my_team"()) OR "public"."is_project_member"("public"."release_project"("b"."release_id"))))))));



CREATE POLICY "bug_history_select" ON "public"."bug_history" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."bugs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bugs_delete" ON "public"."bugs" FOR DELETE TO "authenticated" USING (("public"."manages_project"("public"."release_project"("release_id")) OR ("created_by_id" = "auth"."uid"())));



CREATE POLICY "bugs_insert" ON "public"."bugs" FOR INSERT TO "authenticated" WITH CHECK (("public"."my_role"() = ANY (ARRAY['QA'::"text", 'Team Lead'::"text", 'Admin'::"text"])));



CREATE POLICY "bugs_select" ON "public"."bugs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "bugs_update" ON "public"."bugs" FOR UPDATE TO "authenticated" USING (("public"."can_write"() AND ("public"."manages_project"("public"."release_project"("release_id")) OR ("public"."release_team"("release_id") = "public"."my_team"()) OR "public"."is_project_member"("public"."release_project"("release_id"))))) WITH CHECK (("public"."can_write"() AND ("public"."manages_project"("public"."release_project"("release_id")) OR ("public"."release_team"("release_id") = "public"."my_team"()) OR "public"."is_project_member"("public"."release_project"("release_id")))));



ALTER TABLE "public"."checklist_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checklist_items_select" ON "public"."checklist_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "checklist_items_write" ON "public"."checklist_items" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."client_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_links_manage" ON "public"."client_links" TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."projects" "p"
     JOIN "public"."profiles" "me" ON (("me"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "client_links"."project_id") AND ("me"."role" = 'Team Lead'::"text") AND ("me"."team_id" IS NOT NULL) AND ("me"."team_id" = "p"."team_id")))))) WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."projects" "p"
     JOIN "public"."profiles" "me" ON (("me"."id" = "auth"."uid"())))
  WHERE (("p"."id" = "client_links"."project_id") AND ("me"."role" = 'Team Lead'::"text") AND ("me"."team_id" IS NOT NULL) AND ("me"."team_id" = "p"."team_id"))))));



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments_delete" ON "public"."comments" FOR DELETE TO "authenticated" USING ((("author_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "comments_insert" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_write"() AND ("public"."manages_project"("public"."release_project"("release_id")) OR ("public"."release_team"("release_id") = "public"."my_team"()) OR "public"."is_project_member"("public"."release_project"("release_id")))));



CREATE POLICY "comments_select" ON "public"."comments" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "notifications_insert" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_admin" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("public"."is_admin"() AND ("auth"."uid"() <> "id")));



CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_update_admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles_update_manager" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."can_manage_roles"()) WITH CHECK ("public"."can_manage_roles"());



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_members_delete" ON "public"."project_members" FOR DELETE TO "authenticated" USING ("public"."manages_project"("project_id"));



CREATE POLICY "project_members_insert" ON "public"."project_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."manages_project"("project_id"));



CREATE POLICY "project_members_select" ON "public"."project_members" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "project_members_update" ON "public"."project_members" FOR UPDATE TO "authenticated" USING ("public"."manages_project"("project_id")) WITH CHECK ("public"."manages_project"("project_id"));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete" ON "public"."projects" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "projects_insert" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR (("public"."my_role"() = 'Team Lead'::"text") AND ("team_id" = "public"."my_team"()))));



CREATE POLICY "projects_select" ON "public"."projects" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "projects_update" ON "public"."projects" FOR UPDATE TO "authenticated" USING ("public"."manages_project"("id")) WITH CHECK ("public"."manages_project"("id"));



ALTER TABLE "public"."release_checklist" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "release_checklist_select" ON "public"."release_checklist" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "release_checklist_write" ON "public"."release_checklist" TO "authenticated" USING (("public"."can_write"() AND ("public"."manages_project"("public"."release_project"("release_id")) OR ("public"."release_team"("release_id") = "public"."my_team"()) OR "public"."is_project_member"("public"."release_project"("release_id"))))) WITH CHECK (("public"."can_write"() AND ("public"."manages_project"("public"."release_project"("release_id")) OR ("public"."release_team"("release_id") = "public"."my_team"()) OR "public"."is_project_member"("public"."release_project"("release_id")))));



ALTER TABLE "public"."release_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "release_tasks_select" ON "public"."release_tasks" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "release_tasks_write" ON "public"."release_tasks" TO "authenticated" USING (("public"."can_write"() AND ("public"."manages_project"("public"."release_project"("release_id")) OR ("public"."release_team"("release_id") = "public"."my_team"()) OR "public"."is_project_member"("public"."release_project"("release_id"))))) WITH CHECK (("public"."can_write"() AND ("public"."manages_project"("public"."release_project"("release_id")) OR ("public"."release_team"("release_id") = "public"."my_team"()) OR "public"."is_project_member"("public"."release_project"("release_id")))));



ALTER TABLE "public"."releases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "releases_delete" ON "public"."releases" FOR DELETE TO "authenticated" USING (("public"."manages_project"("project_id") OR ("submitted_by_id" = "auth"."uid"())));



CREATE POLICY "releases_insert" ON "public"."releases" FOR INSERT TO "authenticated" WITH CHECK (("public"."my_role"() = ANY (ARRAY['Developer'::"text", 'Team Lead'::"text", 'Admin'::"text"])));



CREATE POLICY "releases_select" ON "public"."releases" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "releases_update" ON "public"."releases" FOR UPDATE TO "authenticated" USING (("public"."manages_project"("project_id") OR ("submitted_by_id" = "auth"."uid"()) OR ("assigned_qa" = "auth"."uid"()) OR (("assigned_qa" IS NULL) AND ("public"."my_role"() = 'QA'::"text") AND ((( SELECT "projects"."team_id"
   FROM "public"."projects"
  WHERE ("projects"."id" = "releases"."project_id")) = "public"."my_team"()) OR "public"."is_project_member"("project_id"))))) WITH CHECK (("public"."manages_project"("project_id") OR ("submitted_by_id" = "auth"."uid"()) OR ("assigned_qa" = "auth"."uid"()) OR (("assigned_qa" IS NULL) AND ("public"."my_role"() = 'QA'::"text") AND ((( SELECT "projects"."team_id"
   FROM "public"."projects"
  WHERE ("projects"."id" = "releases"."project_id")) = "public"."my_team"()) OR "public"."is_project_member"("project_id")))));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_all" ON "public"."teams" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."user_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_devices_delete" ON "public"."user_devices" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_devices_insert" ON "public"."user_devices" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_devices_select" ON "public"."user_devices" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_devices_update" ON "public"."user_devices" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."wbs_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wbs_items_delete" ON "public"."wbs_items" FOR DELETE TO "authenticated" USING ("public"."manages_project"("project_id"));



CREATE POLICY "wbs_items_insert" ON "public"."wbs_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_write"() AND ("public"."manages_project"("project_id") OR (( SELECT "projects"."team_id"
   FROM "public"."projects"
  WHERE ("projects"."id" = "wbs_items"."project_id")) = "public"."my_team"()))));



CREATE POLICY "wbs_items_select" ON "public"."wbs_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "wbs_items_update" ON "public"."wbs_items" FOR UPDATE TO "authenticated" USING (("public"."manages_project"("project_id") OR ("public"."can_write"() AND (( SELECT "projects"."team_id"
   FROM "public"."projects"
  WHERE ("projects"."id" = "wbs_items"."project_id")) = "public"."my_team"())))) WITH CHECK (("public"."manages_project"("project_id") OR ("public"."can_write"() AND (( SELECT "projects"."team_id"
   FROM "public"."projects"
  WHERE ("projects"."id" = "wbs_items"."project_id")) = "public"."my_team"()))));



ALTER TABLE "public"."wbs_platform_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wbs_platform_targets_select" ON "public"."wbs_platform_targets" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "wbs_platform_targets_write" ON "public"."wbs_platform_targets" TO "authenticated" USING ("public"."manages_project"("project_id")) WITH CHECK ("public"."manages_project"("project_id"));



CREATE POLICY "wbs_tasks_all" ON "public"."wbs_items" TO "authenticated" USING (true) WITH CHECK (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."admin_create_team"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_team"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_team"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_team"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_team"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_team"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_user"("target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_user"("target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("target" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_release_approval"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_release_approval"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_release_approval"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_release_qa_actor"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_release_qa_actor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_release_qa_actor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_role_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_role_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_role_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_role_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_role_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_role_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_project_member"("p_project" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_project_member"("p_project" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_project_member"("p_project" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."manages_project"("p_project" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."manages_project"("p_project" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manages_project"("p_project" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_bugs_to_release"("p_to_release" "uuid", "p_prior_ids" "uuid"[], "p_moved_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_bugs_to_release"("p_to_release" "uuid", "p_prior_ids" "uuid"[], "p_moved_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_bugs_to_release"("p_to_release" "uuid", "p_prior_ids" "uuid"[], "p_moved_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_team"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_team"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_team"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."public_project_status"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."public_project_status"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."public_project_status"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."public_project_status"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_project"("p_release" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_project"("p_release" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_project"("p_release" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_team"("p_release" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_team"("p_release" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_team"("p_release" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_wbs_enabled"("p_project" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_wbs_enabled"("p_project" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_wbs_enabled"("p_project" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_wbs_enabled"("p_project" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."bug_comments" TO "anon";
GRANT ALL ON TABLE "public"."bug_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_comments" TO "service_role";



GRANT ALL ON TABLE "public"."bug_history" TO "anon";
GRANT ALL ON TABLE "public"."bug_history" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_history" TO "service_role";



GRANT ALL ON TABLE "public"."bugs" TO "anon";
GRANT ALL ON TABLE "public"."bugs" TO "authenticated";
GRANT ALL ON TABLE "public"."bugs" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_items" TO "anon";
GRANT ALL ON TABLE "public"."checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_items" TO "service_role";



GRANT ALL ON TABLE "public"."client_links" TO "anon";
GRANT ALL ON TABLE "public"."client_links" TO "authenticated";
GRANT ALL ON TABLE "public"."client_links" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_members" TO "anon";
GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_members" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."release_checklist" TO "anon";
GRANT ALL ON TABLE "public"."release_checklist" TO "authenticated";
GRANT ALL ON TABLE "public"."release_checklist" TO "service_role";



GRANT ALL ON TABLE "public"."release_tasks" TO "anon";
GRANT ALL ON TABLE "public"."release_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."release_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."releases" TO "anon";
GRANT ALL ON TABLE "public"."releases" TO "authenticated";
GRANT ALL ON TABLE "public"."releases" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."user_devices" TO "anon";
GRANT ALL ON TABLE "public"."user_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."user_devices" TO "service_role";



GRANT ALL ON TABLE "public"."wbs_items" TO "anon";
GRANT ALL ON TABLE "public"."wbs_items" TO "authenticated";
GRANT ALL ON TABLE "public"."wbs_items" TO "service_role";



GRANT ALL ON TABLE "public"."wbs_platform_targets" TO "anon";
GRANT ALL ON TABLE "public"."wbs_platform_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."wbs_platform_targets" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































