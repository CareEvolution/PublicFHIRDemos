/* 
 * Copyright (c) 2015, CareEvolution Inc (info@careevolution.com)
 * 
 * This file is licensed under the MIT License - see License.txt
 */

var PDemoConfiguration = {
	// Client identifier used by the OAuth2 protocol - it must be accepted by the OAuth2 authorization server
	clientID: "ec1bf97f-0eed-4e48-9869-89adba038d8c",
	
	version: "1.3",

	fhirVersion: "DSTU 2",

	copyrightYears: "2015",

	// Possible sorts
	sorts: [
		{ directive: { field: "name", direction: "asc" }, name: "Full name - ascending" },
		{ directive: { field: "name", direction: "desc" }, name: "Full name - descending" },
		{ directive: { field: "family", direction: "asc" }, name: "Last name - ascending" },
		{ directive: { field: "family", direction: "desc" }, name: "Last name - descending" },
		{ directive: { field: "given", direction: "asc" }, name: "First name - ascending" },
		{ directive: { field: "given", direction: "desc" }, name: "First name - descending" },
		{ directive: { field: "birthdate", direction: "asc" }, name: "Birth date - ascending" },
		{ directive: { field: "birthdate", direction: "desc" }, name: "Birth date - descending" },
		{ directive: { field: "address", direction: "asc" }, name: "Address - ascending" },
		{ directive: { field: "address", direction: "desc" }, name: "Address - descending" },
		{ directive: { field: "telecom", direction: "asc" }, name: "Contact - ascending" },
		{ directive: { field: "telecom", direction: "desc" }, name: "Contact - descending" },
	],

	defaultResultsPerPage: 10,

	// Default search fields to use. 
	defaultSearchFields: {
		identifier: true,
		name: true,
		family: false,
		given: false,
		birthdate: true,
		address: false,
		gender: true,
		telecom: false,
	},

	defaultSearchIdentifierSystems: [
		{ uri: "urn:oid:2.16.840.1.113883.4.1", name: "SSN" },
	],

	// See http://www.hl7.org/implement/standards/fhir/valueset-administrative-gender.html
	genderValues: [
		{ code: "male", name: "Male" },
		{ code: "female", name: "Female" },
		{ code: "other", name: "Other" },
		{ code: "unknown", name: "Unknown" },
	],

	// See https://www.hl7.org/fhir/daf/valueset-daf-race.html
	raceValues: [
		{ code: "1002-5", name: "American Indian", uri: "http://hl7.org/fhir/v3/Race" },
		{ code: "2028-9", name: "Asian", uri: "http://hl7.org/fhir/v3/Race" },
		{ code: "2054-5", name: "Black or African American", uri: "http://hl7.org/fhir/v3/Race" },
		{ code: "2076-8", name: "Native Hawaiian or Other Pacific Islander", uri: "http://hl7.org/fhir/v3/Race" },
		{ code: "2106-3", name: "White", uri: "http://hl7.org/fhir/v3/Race" },
		{ code: "UNK", name: "Unknown", uri: "http://hl7.org/fhir/v3/NullFlavor" },
		{ code: "ASKU", name: "Asked but no answer", uri: "http://hl7.org/fhir/v3/NullFlavor" },
	],

	// See https://www.hl7.org/fhir/daf/valueset-daf-ethnicity.html
	ethnicityValues: [
		{ code: "2135-2", name: "Hispanic or Latino", uri: "http://hl7.org/fhir/v3/Ethnicity" },
		{ code: "2186-5", name: "Not Hispanic or Latino", uri: "http://hl7.org/fhir/v3/Ethnicity" },
		{ code: "UNK", name: "Unknown", uri: "http://hl7.org/fhir/v3/NullFlavor" },
		{ code: "ASKU", name: "Asked but no answer", uri: "http://hl7.org/fhir/v3/NullFlavor" },
	],

	// See http://www.hl7.org/implement/standards/fhir/terminologies-systems.html#identifiersystems
	knownIdentifierSystems: [
		{ uri: "urn:ietf:rfc:3986", name: "" },	// no display name needed for a URL identifier
		{ uri: "http://hl7.org/fhir/sid/us-ssn", name: "SSN" },
		{ uri: "urn:oid:2.16.840.1.113883.4.1", name: "SSN" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.2", name: "Driver's license - AK" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.1", name: "Driver's license - AL" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.5", name: "Driver's license - AR" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.4", name: "Driver's license - AZ" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.6", name: "Driver's license - CA" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.8", name: "Driver's license - CO" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.9", name: "Driver's license - CT" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.11", name: "Driver's license - DC" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.10", name: "Driver's license - DE" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.12", name: "Driver's license - FL" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.13", name: "Driver's license - GA" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.15", name: "Driver's license - HI" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.19", name: "Driver's license - IA" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.16", name: "Driver's license - ID" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.17", name: "Driver's license - IL" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.20", name: "Driver's license - KS" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.21", name: "Driver's license - KY" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.22", name: "Driver's license - LA" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.25", name: "Driver's license - MA" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.24", name: "Driver's license - MD" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.23", name: "Driver's license - ME" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.26", name: "Driver's license - MI" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.27", name: "Driver's license - MN" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.29", name: "Driver's license - MO" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.28", name: "Driver's license - MS" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.30", name: "Driver's license - MT" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.36", name: "Driver's license - MY" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.37", name: "Driver's license - NC" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.38", name: "Driver's license - ND" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.31", name: "Driver's license - NE" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.33", name: "Driver's license - NH" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.34", name: "Driver's license - NJ" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.35", name: "Driver's license - NM" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.32", name: "Driver's license - NV" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.39", name: "Driver's license - OH" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.40", name: "Driver's license - OK" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.41", name: "Driver's license - OR" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.42", name: "Driver's license - PA" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.44", name: "Driver's license - RI" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.45", name: "Driver's license - SC" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.46", name: "Driver's license - SD" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.47", name: "Driver's license - TN" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.48", name: "Driver's license - TX" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.49", name: "Driver's license - UT" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.51", name: "Driver's license - VA" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.50", name: "Driver's license - VT" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.53", name: "Driver's license - WA" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.55", name: "Driver's license - WI" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.54", name: "Driver's license - WV" },
		{ uri: "urn:oid:2.16.840.1.113883.4.3.56", name: "Driver's license - WY" },
	],

	patientSearchParameters: {
		"Encounter": "patient",
		"Immunization": "patient",
		"Procedure": "patient",
		"Condition": "patient",
		"MedicationOrder": "patient",
		"DiagnosticReport": "patient",
		"Observation": "patient",
		"AllergyIntolerance": "patient",
	},
};