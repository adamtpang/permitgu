"use client";

import { useState } from "react";
import { createDraft } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";

export function ApplyForm() {
  const [error, setError] = useState("");

  async function onSubmit(formData: FormData) {
    setError("");
    const result = await createDraft(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={onSubmit} className="grid max-w-2xl gap-4">
      <Field name="lot" label="Lot" />
      <Field name="tract" label="Tract" />
      <Field name="block" label="Block" />
      <Field name="zoning_district" label="Zoning district" hint="As you understand it. This demo does not look the zone up." />
      <Label htmlFor="ownership">Who is applying</Label>
      <select id="ownership" name="ownership" className="rounded-2xl border border-line bg-paper px-4 py-3" defaultValue="owner">
        <option value="owner">Owner</option>
        <option value="lessee">Lessee</option>
        <option value="authorized_agent">Authorized agent</option>
      </select>
      <Field name="owner_name" label="Owner name, if you are an agent" />
      <Label htmlFor="scope">Scope</Label>
      <Textarea id="scope" name="scope" required rows={4} defaultValue="New private one-family dwelling on public sewer." />
      <Field name="valuation" label="Declared construction valuation, dollars (optional)" hint="This is not the permit fee. Leave it blank if you do not have a number." />
      <p className="text-sm text-ink2">Sewage is public sewer for this application. A septic tank is a different route.</p>
      <input type="hidden" name="sewage" value="public_sewer" />
      <Label htmlFor="water_supply">Water supply</Label>
      <select id="water_supply" name="water_supply" className="rounded-2xl border border-line bg-paper px-4 py-3" defaultValue="public">
        <option value="public">Public water</option>
        <option value="private_well">Private well</option>
      </select>
      <p className="text-sm text-ink2">A private well may need extra GEPA review. That routing is not confirmed here. Staff can add the step.</p>
      <Field name="contractor_license" label="Contractor license number" hint="The DPW form asks for it when a contractor signs." />
      <Field name="architect_seal" label="Architect seal number, if you have one" />
      <Field name="engineer_seal" label="Engineer seal number, if you have one" />
      <label className="flex items-start gap-3 text-sm text-ink2">
        <input className="mt-1" type="checkbox" name="attestation" />
        <span>I attest that the owner or lessee will sign the official DPW form. This checkbox does not replace that signature.</span>
      </label>
      <Field name="attestation_name" label="Name for that attestation" />
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
      <Button type="submit" variant="gu">Save draft</Button>
    </form>
  );
}

function Field({ name, label, hint }: { name: string; label: string; hint?: string }) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} />
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
