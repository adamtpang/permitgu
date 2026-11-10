# Residential one-family workflow

This is the only permit the tracker runs. The data model (agencies, application types, workflow steps, applications, steps, documents, audit) can hold other permits later. None are seeded.

Scope: a **private one-family new building on public sewer**, led by DPW Building Inspection and Permits at the Business License and Permit Center. Septic, wetland, seashore, and GLUC paths are out of this flow. The paper application stays valid. Permit GU does not take payment.

Sources used for the step list:

- [DPW application for permit and plan review](https://bsp.guam.gov/wp-content/uploads/2026/08/DPW-Application-for-Permit-and-Plan-Review-Fillable.pdf)
- [DPW BLPC](https://dpw.guam.gov/blpc/)
- [21 GCA §76511](https://www.territorialreview.org/statute/21-gca-76511) for historic preservation
- The existing PermitGU building guide at `/build`

## What is routed by default

| Step | Why it starts queued |
| --- | --- |
| DPW intake | The application is filed with DPW. |
| Architectural and structural plan review | Assumed for a new house. The form says disciplines are "as indicated." |
| DLM zoning examination | Section VI of the DPW application. |
| GWA water and sewer availability | This flow assumes public water and public sewer. |
| Fee assessment, in-person Treasurer payment, permit issuance, certificate of occupancy | They happen after the reviews that this template treats as blocking. |
| Foundation, framing, and final inspections | Provisional. Queued only after the demo permit is issued. |

## What stays off until someone routes it

Mechanical and plumbing, flood control, HPCC, hydraulics and civil, highway / right-of-way, GEPA, GPA, GFD, DPHSS, CLB, PEALS, Parks and Recreation, Agriculture, and USACE are on the form as "as indicated." They do not block a sewered one-family file while they are not started.

Historic preservation is present because of 21 GCA §76511. It does not block other clearances until a reviewer queues it. Staff can mark it N/A with a memo. When it is N/A for a typical house is **not confirmed**.

HPCC is stored under that label because that is how it appears on the form. The expansion of the acronym is **not confirmed**.

## Fees and inspections

No dollar amount is stored on the template. A DPW reviewer types the assessed amount on the file. The citizen is told to pay that amount in person at the Treasurer of Guam cashier at the BLPC. Marking it paid does not move money.

The inspection list is the placeholder named in the public guide (foundation, framing, final). 21 GCA §66403 says the DPW Director sets the list. It is labeled provisional in the product.

The building guide says a permit can lapse if work does not start within three months. This demo does not run that clock. A person can mark the file expired.

The permit number looks like `DEMO-2026-0001`. It is not a DPW number.

## Retention

Recommendation, not an automatic job: keep the application and files for 7 years after a final status, and the audit log for 10 years. Dad or counsel can override it. The audit table rejects updates and deletes.

## Still open

The admin page lists the same questions: pilot contacts, which clearances are always on, when historic review is N/A, the real inspection list, any counsel retention rule, and whether an unofficial pilot is acceptable while paper stays authoritative.
