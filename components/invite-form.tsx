"use client";

import { useState } from "react";
import { inviteStaff } from "@/lib/actions";
import { Button, Input, Label } from "@/components/ui";

export function InviteForm({ agencies }: { agencies: { code: string; acronym: string }[] }) {
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(formData: FormData) {
    setMessage("");
    setPassword("");
    const result = await inviteStaff(formData);
    if (result.error) setMessage(result.error);
    else if (result.password && result.email) {
      setPassword(result.password);
      setMessage(`Created ${result.email}. They must enroll an authenticator app on first staff sign-in. Copy this password now. It is not stored in the page URL.`);
    }
  }

  return (
    <form action={onSubmit} className="grid gap-3">
      <Label htmlFor="invite-name">Name</Label>
      <Input id="invite-name" name="full_name" required />
      <Label htmlFor="invite-email">Email</Label>
      <Input id="invite-email" name="email" type="email" required />
      <Label htmlFor="invite-role">Role</Label>
      <select id="invite-role" name="role" className="rounded-2xl border border-line bg-paper px-4 py-3">
        <option value="reviewer">Reviewer</option>
        <option value="agency_admin">Agency admin</option>
        <option value="super_admin">Super admin</option>
      </select>
      <Label htmlFor="invite-agency">Agency (blank for super admin)</Label>
      <select id="invite-agency" name="agency_code" className="rounded-2xl border border-line bg-paper px-4 py-3">
        <option value="">None</option>
        {agencies.map((agency) => (
          <option key={agency.code} value={agency.code}>{agency.acronym}</option>
        ))}
      </select>
      <Button type="submit" variant="outline">Create staff account</Button>
      {message ? <p className="text-sm text-ink2" role="status">{message}</p> : null}
      {password ? <p className="break-all rounded-2xl border border-line bg-soft p-3 font-mono text-sm">{password}</p> : null}
    </form>
  );
}
