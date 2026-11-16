"use client";

import { useState } from "react";
import { createBuiltDraft } from "@/lib/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";
import type { TypeField } from "@/lib/permit-types";

// The questions an admin defined for a permit. Used to start a draft and to edit one.
export function BuiltFields({
  fields,
  values = {},
  attestation = false,
  attestationName = "",
  noun,
}: {
  fields: TypeField[];
  values?: Record<string, string>;
  attestation?: boolean;
  attestationName?: string;
  noun: string;
}) {
  return (
    <>
      {fields.map((field) => {
        const id = `f_${field.key}`;
        const label = field.required ? field.label : `${field.label} (optional)`;
        return (
          <div key={field.key}>
            <Label htmlFor={id}>{label}</Label>
            {field.kind === "long" ? (
              <Textarea id={id} name={id} rows={3} defaultValue={values[field.key] ?? ""} maxLength={1000} />
            ) : field.kind === "choice" ? (
              <select id={id} name={id} className="w-full rounded-2xl border border-line bg-paper px-4 py-3" defaultValue={values[field.key] ?? ""}>
                <option value="">Choose one</option>
                {field.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
              </select>
            ) : (
              <Input id={id} name={id} defaultValue={values[field.key] ?? ""} maxLength={200} />
            )}
            {field.help ? <p className="mt-1 text-sm text-muted">{field.help}</p> : null}
          </div>
        );
      })}
      <p className="text-sm text-ink2">
        This demo does not ask for a Social Security number or a photo ID. Give those to the agency in person.
      </p>
      <label className="flex items-start gap-3 text-sm text-ink2">
        <input className="mt-1" type="checkbox" name="attestation" defaultChecked={attestation} />
        <span>I attest that the applicant will sign the agency&apos;s official {noun} application. This checkbox does not replace that signature.</span>
      </label>
      <div>
        <Label htmlFor="attestation_name">Name for that attestation</Label>
        <Input id="attestation_name" name="attestation_name" defaultValue={attestationName} maxLength={200} />
      </div>
    </>
  );
}

export function BuiltForm({ code, fields, noun }: { code: string; fields: TypeField[]; noun: string }) {
  const [error, setError] = useState("");

  async function onSubmit(formData: FormData) {
    setError("");
    const result = await createBuiltDraft(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={onSubmit} className="grid max-w-2xl gap-4">
      <input type="hidden" name="type_code" value={code} />
      <BuiltFields fields={fields} noun={noun} />
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
      <Button type="submit" variant="gu">Save draft</Button>
    </form>
  );
}
