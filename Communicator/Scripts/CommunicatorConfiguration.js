/* 
 * Copyright (c) 2017, CareEvolution Inc (info@careevolution.com)
 * 
 * This file is licensed under the MIT License - see License.txt
 */

var CommunicatorConfiguration = {
	// Client identifier used by the OAuth2 protocol - it must be accepted by the OAuth2 authorization server
	clientID: "to be set",
	
	version: "0.0",

	fhirVersion: "STU3",

	copyrightYears: "2017",

	// See http://www.hl7.org/implement/standards/fhir/valueset-administrative-gender.html
	genderValues: [
		{ code: "male", name: "Male" },
		{ code: "female", name: "Female" },
		{ code: "other", name: "Other" },
		{ code: "unknown", name: "Unknown" },
	],

	defaultResultsPerPage: 5
};