"use server";

import { redirect } from "next/navigation";
import { sniffUpload, safeStorageName } from "@/lib/files";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { validateDraft, type DraftInput } from "@/lib/workflow";

function dollarsToCents(raw: string) {
  const value = raw.trim();
  if (!value) return { cents: null as number | null, error: null as string | null };
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return { cents: null, error: "Enter a dollar amount like 1500 or 1500.50, or leave it blank." };
  const [dollars, fraction = ""] = value.split(".");
  return { cents: Number(dollars) * 100 + Number((fraction + "00").slice(0, 2)), error: null };
}

function draftFromForm(formData: FormData): { input: DraftInput; error: string | null } {
  const money = dollarsToCents(String(formData.get("valuation") ?? ""));
  if (money.error) return { input: emptyDraft(), error: money.error };
  const input: DraftInput = {
    lot: String(formData.get("lot") ?? ""),
    tract: String(formData.get("tract") ?? ""),
    block: String(formData.get("block") ?? ""),
    zoningDistrict: String(formData.get("zoning_district") ?? ""),
    ownership: String(formData.get("ownership") ?? ""),
    ownerName: String(formData.get("owner_name") ?? ""),
    scope: String(formData.get("scope") ?? ""),
    valuationCents: money.cents,
    sewage: "public_sewer",
    waterSupply: String(formData.get("water_supply") ?? ""),
    contractorLicense: String(formData.get("contractor_license") ?? ""),
    architectSeal: String(formData.get("architect_seal") ?? ""),
    engineerSeal: String(formData.get("engineer_seal") ?? ""),
    attestation: formData.get("attestation") === "on",
    attestationName: String(formData.get("attestation_name") ?? ""),
    hasPlans: false,
    hasPlotPlan: false,
  };
  return { input, error: null };
}

function emptyDraft(): DraftInput {
  return {
    lot: "", tract: "", block: "", zoningDistrict: "", ownership: "", ownerName: "", scope: "",
    valuationCents: null, sewage: "public_sewer", waterSupply: "", contractorLicense: "",
    architectSeal: "", engineerSeal: "", attestation: false, attestationName: "", hasPlans: false, hasPlotPlan: false,
  };
}

async function client() {
  const supabase = await createClient();
  if (!supabase) throw new Error("not_configured");
  return supabase;
}

export async function createDraft(formData: FormData) {
  const { input, error } = draftFromForm(formData);
  const problem = error ?? validateDraft(input, "save");
  if (problem) return { error: problem };
  const supabase = await client();
  const { data, error: dbError } = await supabase.rpc("create_draft", {
    p_lot: input.lot,
    p_tract: input.tract,
    p_block: input.block,
    p_zoning_district: input.zoningDistrict,
    p_ownership: input.ownership,
    p_owner_name: input.ownerName,
    p_scope: input.scope,
    p_valuation_cents: input.valuationCents,
    p_sewage: input.sewage,
    p_water_supply: input.waterSupply,
    p_contractor_license: input.contractorLicense,
    p_architect_seal: input.architectSeal,
    p_engineer_seal: input.engineerSeal,
    p_attestation: input.attestation,
    p_attestation_name: input.attestationName,
  });
  if (dbError) return { error: dbError.message };
  redirect(`/applications/${data}`);
}

export async function saveDraft(formData: FormData) {
  const id = String(formData.get("application_id") ?? "");
  const { input, error } = draftFromForm(formData);
  const problem = error ?? validateDraft(input, "save");
  if (problem) redirect(`/applications/${id}?error=${encodeURIComponent(problem)}`);
  const supabase = await client();
  const { error: dbError } = await supabase.from("applications").update({
    lot: input.lot,
    tract: input.tract,
    block: input.block,
    zoning_district: input.zoningDistrict,
    ownership: input.ownership || null,
    owner_name: input.ownerName || null,
    scope: input.scope,
    valuation_cents: input.valuationCents,
    sewage: input.sewage,
    water_supply: input.waterSupply || null,
    contractor_license: input.contractorLicense || null,
    architect_seal: input.architectSeal || null,
    engineer_seal: input.engineerSeal || null,
    attestation: input.attestation,
    attestation_name: input.attestationName || null,
  }).eq("id", id);
  if (dbError) redirect(`/applications/${id}?error=${encodeURIComponent(dbError.message)}`);
  redirect(`/applications/${id}`);
}

export async function submitDraft(formData: FormData) {
  const id = String(formData.get("application_id") ?? "");
  const supabase = await client();
  const { error } = await supabase.rpc("submit_application", { p_application_id: id });
  if (error) redirect(`/applications/${id}?error=${encodeURIComponent(error.message)}`);
  redirect(`/applications/${id}`);
}

export async function uploadDocument(formData: FormData) {
  const id = String(formData.get("application_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || !["plans", "plot_plan", "other"].includes(kind)) {
    redirect(`/applications/${id}?error=${encodeURIComponent("Choose a plans or plot-plan file.")}`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffUpload(file.name, bytes);
  if (!sniffed) {
    redirect(`/applications/${id}?error=${encodeURIComponent("Upload a PDF, PNG, JPEG, or WebP. The file contents have to match the extension. Virus scanning is not connected.")}`);
  }
  const path = `${id}/${crypto.randomUUID()}-${safeStorageName(file.name)}`;
  const supabase = await client();
  const uploaded = await supabase.storage.from("application-documents").upload(path, bytes, {
    contentType: sniffed.mime,
    upsert: false,
  });
  if (uploaded.error) redirect(`/applications/${id}?error=${encodeURIComponent(uploaded.error.message)}`);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(`/sign-in?next=/applications/${id}`);
  const { error } = await supabase.from("documents").insert({
    application_id: id,
    uploaded_by: userData.user.id,
    kind,
    storage_path: path,
    file_name: safeStorageName(file.name),
    mime_type: sniffed.mime,
    byte_size: bytes.byteLength,
  });
  if (error) {
    await supabase.storage.from("application-documents").remove([path]);
    redirect(`/applications/${id}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/applications/${id}`);
}

export async function downloadDocument(formData: FormData) {
  const id = String(formData.get("application_id") ?? "");
  const documentId = String(formData.get("document_id") ?? "");
  const supabase = await client();
  const { data, error } = await supabase.from("documents").select("storage_path").eq("id", documentId).maybeSingle();
  if (error || !data) redirect(`/applications/${id}?error=${encodeURIComponent("That file is not available.")}`);
  const signed = await supabase.storage.from("application-documents").createSignedUrl(data.storage_path, 60);
  if (signed.error || !signed.data) redirect(`/applications/${id}?error=${encodeURIComponent(signed.error?.message ?? "Could not sign the file URL.")}`);
  redirect(signed.data.signedUrl);
}

export async function respondToInfo(formData: FormData) {
  const id = String(formData.get("application_id") ?? "");
  const requestId = String(formData.get("request_id") ?? "");
  const response = String(formData.get("response") ?? "");
  const supabase = await client();
  const { error } = await supabase.rpc("respond_info", { p_request_id: requestId, p_response: response });
  if (error) redirect(`/applications/${id}?error=${encodeURIComponent(error.message)}`);
  redirect(`/applications/${id}`);
}

export async function withdraw(formData: FormData) {
  const id = String(formData.get("application_id") ?? "");
  const memo = String(formData.get("memo") ?? "");
  const supabase = await client();
  const { error } = await supabase.rpc("withdraw_application", { p_application_id: id, p_memo: memo });
  if (error) redirect(`/applications/${id}?error=${encodeURIComponent(error.message)}`);
  redirect(`/applications/${id}`);
}

export async function addComment(formData: FormData) {
  const id = String(formData.get("application_id") ?? "");
  const body = String(formData.get("body") ?? "");
  const visibility = String(formData.get("visibility") ?? "citizen");
  const back = String(formData.get("return_to") ?? `/applications/${id}`);
  const supabase = await client();
  const { error } = await supabase.rpc("add_comment", { p_application_id: id, p_body: body, p_visibility: visibility });
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  redirect(back);
}

async function review(formData: FormData, rpc: string, args: Record<string, unknown>) {
  const back = String(formData.get("return_to") ?? "/review");
  const supabase = await client();
  const { error } = await supabase.rpc(rpc, args);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  redirect(back);
}

export async function reviewStep(formData: FormData) {
  await review(formData, "review_step", {
    p_step_id: String(formData.get("step_id")),
    p_status: String(formData.get("status")),
    p_memo: String(formData.get("memo") ?? ""),
  });
}

export async function routeStepAction(formData: FormData) {
  await review(formData, "route_step", {
    p_step_id: String(formData.get("step_id")),
    p_status: String(formData.get("status")),
    p_memo: String(formData.get("memo") ?? ""),
  });
}

export async function requestInfo(formData: FormData) {
  await review(formData, "request_info", {
    p_step_id: String(formData.get("step_id")),
    p_body: String(formData.get("body") ?? ""),
  });
}

export async function assessFees(formData: FormData) {
  const back = String(formData.get("return_to") ?? "/review");
  const money = dollarsToCents(String(formData.get("amount") ?? ""));
  if (money.error || money.cents == null) redirect(`${back}?error=${encodeURIComponent(money.error ?? "Enter the assessed amount. It is not filled in for you.")}`);
  await review(formData, "assess_fees", {
    p_application_id: String(formData.get("application_id")),
    p_cents: money.cents,
    p_memo: String(formData.get("memo") ?? ""),
  });
}

export async function markFeesPaid(formData: FormData) {
  await review(formData, "mark_fees_paid", {
    p_application_id: String(formData.get("application_id")),
    p_memo: String(formData.get("memo") ?? ""),
  });
}

export async function issuePermit(formData: FormData) {
  await review(formData, "issue_permit", {
    p_application_id: String(formData.get("application_id")),
    p_memo: String(formData.get("memo") ?? ""),
  });
}

export async function denyApplication(formData: FormData) {
  await review(formData, "deny_application", {
    p_application_id: String(formData.get("application_id")),
    p_memo: String(formData.get("memo") ?? ""),
  });
}

export async function expireApplication(formData: FormData) {
  await review(formData, "expire_application", {
    p_application_id: String(formData.get("application_id")),
    p_memo: String(formData.get("memo") ?? ""),
  });
}

export async function reopenStep(formData: FormData) {
  await review(formData, "reopen_step", {
    p_step_id: String(formData.get("step_id")),
    p_memo: String(formData.get("memo") ?? ""),
  });
}

export async function grantMembership(formData: FormData) {
  await review(formData, "grant_membership", {
    p_email: String(formData.get("email") ?? ""),
    p_agency_code: String(formData.get("agency_code") ?? ""),
    p_role: String(formData.get("role") ?? ""),
  });
}

export async function revokeMembership(formData: FormData) {
  await review(formData, "revoke_membership", { p_membership_id: String(formData.get("membership_id")) });
}

export async function updateWorkflow(formData: FormData) {
  await review(formData, "update_workflow_step", {
    p_code: String(formData.get("code") ?? ""),
    p_routing: String(formData.get("routing") ?? ""),
    p_uncertainty: String(formData.get("uncertainty") ?? ""),
  });
}

export async function inviteStaff(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const agency = String(formData.get("agency_code") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!email || !fullName) return { error: "Name and email are required." };
  const supabase = await client();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Sign in as staff first." };
  const admin = createServiceClient();
  if (!admin) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY is not set. Create the user in the Supabase dashboard, then grant the role here." };
  }
  const password = `Demo-${crypto.randomUUID()}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error || !created.data.user) return { error: created.error?.message ?? "Could not create the user." };
  const granted = await supabase.rpc("grant_membership", { p_email: email, p_agency_code: agency, p_role: role });
  if (granted.error) return { error: granted.error.message };
  return { email, password };
}
