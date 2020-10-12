### HIEBus 27.17.0

- Map `Procedure.VerifiedByCaregiverID` to/from FHIR R4 `Procedure.asserter` and to/from the corresponding standard Reference extension `http://hl7.org/fhir/4.0/StructureDefinition/extension-Procedure.asserter` in FHIR DSTU2 and STU3 (#2954)

- Map `Encounter.Drg` field to/from the CodeableConcept extension `http://careevolution.com/fhirextensions#encounter-drg` (#2953)

- Clear `LabReport.LabReportContent` when mapping from FHIR `DiagnosticReport` - previously it was an empty array, that got exported as `System.Byte[]` in Standard Data Output  (#2951)

- Map `Encounter.AdmissionType` to/from FHIR `Encounter.priority` (DSTU2, STU3 and R4) (#2935)

- Map `Claim.CreatedDate` (that is a new addition to the data model) to/from FHIR `Claim.created` and `ExplanationOfBenefit.created` (STU3 and R4) (#2900)

- Map `Claim.StartDate` and `Claim.EndDate` to/from FHIR R4 `Claim.billablePeriod`. Previously FHIR `Claim.billablePeriod` was mapped to/from properties instead (#2900)

### HIEBus 28.0.0.20783

- Fix search parameter types for `CarePlan.care-team`: reference - it was token, `Encounter.reason-reference`: reference - it was token, `telecom`: token - it was string (#2843)

### HIEBus 27.16.0

- Map `Procedure.Status` to/from FHIR `Procedure.status` (DSTU2, STU3 and R4) (#2859)

- Map `Procedure.Properties` to/from the `http://careevolution.com/fhirextensions#properties` extension (DSTU2, STU3 and R4) (#2859)

- Map `Medication.AmountBilled` to/from FHIR R4 `ExplanationOfBenefit.item.net` and `Claim.item.net` (#2839)

- Implemented the bulk export `_typeFilter` and `_elements` parameters (#2845)

- Support multiple sort parameters, and automatically add a sort by id to all the other sorts, to ensure a stable sort order even when the main sort field has the same value for multiple resources. (94d5efc77e7182aedba8ddf2f65f173fcc916ae5)

- Add the `ExplanationOfBenefit.service-date` search parameter (STU3 and R4), it searches by `ExplanationOfBenefit.billablePeriod` corresponding to `Claim.StartDate` and `Claim.EndDate` internally  (5ad543f76d056a71e41b4cd65626e119b569d264)

### HIEBus 27.15.0

- Date-time search fixes:

    The date-time search using equality on periods (eg encounter admit and discharge) was not correct: it wrongly matched open-ended periods.

    The date-time search using `le` (less than or equal) and `ge` (greater than or equal) on periods did not work correctly: they matched periods overlapping the search interval instead of contained in it.

- Add the `ExplanationOfBenefit.type` search parameter (STU3 and R4), it searches by `ExplanationOfBenefit.type` corresponding to `Claim.ClaimType` internally  (312f5f761c8e9d12a72185d39b68d42a59eb8eee)

- Added the Binary resource (#2807)

    It maps `Report.ReportContent` + `Report.ReportFormat`, `LabReport.LabReportContent` + `LabReport.LabReportFormat` and `DemographicPicture.Picture` + `DemographicPicture.MimeType`. It is a read-only resource and supports only the 'read' interaction, no searches. As per FHIR specifications it returns the JSON or XML representation of the FHIR Binary resource when the client explicitly ask for it using either the 'Accept' header or the _format query parameter, but in all other cases it returns the raw binary data, that is more efficient.

    If the user issuing a FHIR request has access to the `Binary` resource then `DiagnosticReport.presentedForm`, `Practitioner.photo`, `Patient.photo`, `Person.photo` use URL to the corresponding binary resource instead of embedding the binary data base64-encoded directly in the resource. This is in general more efficient. Note that this is a breaking change for user that have by default access to all resources. User that have been granted access to only specific resources typically do not have access to `Binary` (it did not exist), so they'll still see the same data.

### HIEBus 27.14.0
