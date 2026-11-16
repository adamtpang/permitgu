// Short confirmations shown after an action. The page receives a code in the address,
// never the words themselves, so a link cannot put its own message on the screen.

const NOTICES: Record<string, string> = {
  saved: "Draft saved.",
  uploaded: "Paper uploaded.",
  submitted: "Submitted. The lead agency now has your file.",
  note: "Note added.",
  replied: "Reply sent. The agency can pick the file back up.",
  withdrawn: "Application withdrawn.",
  discarded: "Draft discarded. Its uploaded papers were removed.",
  started: "Step started. It now shows as in review.",
  approved: "Step approved.",
  rejected: "Step rejected. The file does not move forward.",
  routed: "Sent to that agency.",
  not_needed: "Step marked as not needed.",
  info_requested: "Request sent to the applicant. The file waits on their reply.",
  assigned: "Assignment saved.",
  fee_entered: "Fee entered. The applicant can see the amount.",
  fee_paid: "Fee marked paid in person.",
  issued: "Issued. The applicant can see the demo number.",
  denied: "Application denied.",
  expired: "Application marked expired.",
  reopened: "Step reopened.",
  type_created: "Permit created. It is off until you switch it on.",
  step_added: "Step added.",
  step_removed: "Step removed.",
  field_added: "Question added.",
  field_removed: "Question removed.",
  paper_added: "Paper added to the list.",
  paper_removed: "Paper removed from the list.",
  step_saved: "Step saved.",
  role_granted: "Role granted.",
  role_removed: "Role removed.",
  catalog_added: "Added to the catalog.",
  catalog_linked:"Catalog link saved.",
  type_on:"Switched on. People can now start this permit.",
  type_off: "Switched off. No new files can be started or submitted. Files already submitted keep going.",
  test_on:"Marked as a test file. Its timings no longer count toward estimates.",
  test_off: "No longer a test file. Its timings count toward estimates.",
};

export function noticeText(code: string | undefined) {
  return code && Object.hasOwn(NOTICES, code) ? NOTICES[code] : null;
}

// The code for a staff action, from the database function and the status it set.
export function staffNotice(rpc: string, status?: string) {
  if (rpc === "review_step") {
    if (status === "in_progress") return "started";
    if (status === "approved") return "approved";
    if (status === "rejected") return "rejected";
    return "not_needed";
  }
  if (rpc === "route_step") return status === "queued" ? "routed" : "not_needed";
  const byFunction: Record<string, string> = {
    request_info: "info_requested",
    assess_fees: "fee_entered",
    mark_fees_paid: "fee_paid",
    issue_permit: "issued",
    deny_application: "denied",
    expire_application: "expired",
    reopen_step: "reopened",
    assign_step: "assigned",
    update_type_step: "step_saved",
    grant_membership: "role_granted",
    revoke_membership: "role_removed",
    add_permit_catalog: "catalog_added",
  };
  return byFunction[rpc] ?? null;
}

// Adds ?done=code to a return address that may already have a query.
export function withNotice(path: string, code: string | null) {
  if (!code) return path;
  return `${path}${path.includes("?") ? "&" : "?"}done=${code}`;
}
