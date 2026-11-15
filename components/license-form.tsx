"use client";

import { useState } from "react";
import { createLicenseDraft } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { ENTITY_TYPES } from "@/lib/license";

export type LicenseFieldValues = {
  businessName?: string;
  tradeName?: string;
  entityType?: string;
  registrationNumber?: string;
  activity?: string;
  lot?: string;
  block?: string;
  street?: string;
  village?: string;
  attestation?: boolean;
  attestationName?: string;
};

// The fields a new business license needs. Used to start a draft and to edit one.
export function LicenseFields({ values = {} }: { values?: LicenseFieldValues }) {
  return (
    <>
      <Field name="business_name" label="Business name" value={values.businessName} required />
      <Field name="trade_name" label="Trade name (DBA), if you use one" value={values.tradeName} hint="Revenue and Taxation checks that the name is free. The DBA paper has to be notarized." />
      <div>
        <Label htmlFor="entity_type">Kind of business</Label>
        <select id="entity_type" name="entity_type" className="w-full rounded-2xl border border-line bg-paper px-4 py-3" defaultValue={values.entityType || "sole_proprietor"}>
          {ENTITY_TYPES.map((entity) => <option key={entity.value} value={entity.value}>{entity.label}</option>)}
        </select>
      </div>
      <Field name="registration_number" label="Entity registration number" value={values.registrationNumber} hint="For a corporation, company, or partnership. It registers with Revenue and Taxation before a license is issued. A sole proprietor leaves this blank." />
      <div>
        <Label htmlFor="activity">Business activity</Label>
        <Textarea id="activity" name="activity" rows={3} defaultValue={values.activity ?? ""} placeholder="Retail: sale of clothing" />
        <p className="mt-1 text-sm text-muted">Describe it in detail. Each activity and each location needs its own license.</p>
      </div>
      <Field name="lot" label="Lot number" value={values.lot} />
      <Field name="block" label="Block number" value={values.block} />
      <Field name="street" label="Street address" value={values.street} />
      <Field name="village" label="Village" value={values.village} hint="Form BL-01 says an application without the full location is rejected." />
      <p className="text-sm text-ink2">
        This demo does not ask for a Social Security number, an employer number, or a photo ID. Give those to Revenue and Taxation in person.
      </p>
      <label className="flex items-start gap-3 text-sm text-ink2">
        <input className="mt-1" type="checkbox" name="attestation" defaultChecked={values.attestation ?? false} />
        <span>I attest that the applicant will sign the official Form BL-01 by hand. This checkbox does not replace that signature.</span>
      </label>
      <Field name="attestation_name" label="Name for that attestation" value={values.attestationName} />
    </>
  );
}

export function LicenseForm() {
  const [error, setError] = useState("");

  async function onSubmit(formData: FormData) {
    setError("");
    const result = await createLicenseDraft(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={onSubmit} className="grid max-w-2xl gap-4">
      <LicenseFields />
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
      <Button type="submit" variant="gu">Save draft</Button>
    </form>
  );
}

function Field({ name, label, hint, value, required }: { name: string; label: string; hint?: string; value?: string; required?: boolean }) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={value ?? ""} required={required} />
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
