/* 
 * Copyright (c) 2015, CareEvolution Inc (info@careevolution.com)
 * 
 * This file is licensed under the MIT License - see License.txt
 */

/* global angular */
/* global PDemoConfiguration */

(function () {
    if (!PDemoConfiguration) {
        throw "PDemoConfiguration is not defined";
    }

    var PDemoApp = angular.module("PDemoApp", []);

    PDemoApp.factory("urlParameters", function () {
        var result = {};
        var query = window.location.search.substring(1);
        var vars = query.split("&");
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split("=");
            var name = decodeURIComponent(pair[0]);
            var value = decodeURIComponent(pair[1]);
            if (typeof result[name] === "undefined") {
                // If first entry with this name
                result[name] = value;
            } else if (typeof result[name] === "string") {
                // If second entry with this name
                var values = [result[name], value];
                result[name] = values;
            } else {
                // If third or later entry with this name
                result[name].push(value);
            }
        }
        return result;
    });

    PDemoApp.controller("PDemoController", ["$http", "$scope", "urlParameters", function ($http, $scope, urlParameters) {

        var MODE_ANONYMOUS = "anonymous";
        var MODE_CODE = "code";
        var MODE_LOGIN = "login";

        var SESSION_FHIR_URL = "fhirUrl";
        var SESSION_MODE = "mode";
        var SESSION_TOKEN_URL = "tokenUrl";
        var SESSION_AUTHORIZATION_TOKEN = "authorizationToken";
        var SESSION_USERNAME = "userName";

        var CONFIGURATION = "Configuration";

        $scope.StartupErrorMessage = null;

        $scope.UserName = sessionStorage[SESSION_USERNAME] || null;
        $scope.Password = null;
        $scope.LoggingIn = false;
        $scope.LoginErrorMessage = null;

        $scope.SearchFields = [
			{ field: "identifier", label: "Identifier" },
			{ field: "name", label: "Name" },
			{ field: "family", label: "Last name" },
			{ field: "given", label: "First name" },
			{ field: "birthdate", label: "Birth date" },
			{ field: "address", label: "Address" },
			{ field: "gender", label: "Gender" },
			{ field: "telecom", label: "Contact (phone/e-mail)" },
        ];

        $scope.IdentifierSystem = null;
        $scope.Identifier = null;
        $scope.Name = null;
        $scope.NameExact = false;
        $scope.Family = null;
        $scope.FamilyExact = false;
        $scope.Given = null;
        $scope.GivenExact = false;
        $scope.BirthDate = null;
        $scope.Address = null;
        $scope.AddressExact = false;
        $scope.Gender = null;
        $scope.Telecom = null;
        $scope.TelecomExact = false;
        $scope.Sort = null;
        $scope.Sorts = PDemoConfiguration.sorts;

        $scope.Searching = false;
        $scope.SearchErrorMessage = null;

        $scope.Patients = [];
        $scope.TotalPatientsCount = null;
        $scope.NextPatientsSearchUrl = null;
        $scope.SelectedPatient = null;

        $scope.Configuration = null;
        $scope.EditableConfiguration = null;

        if ("resetConfiguration" in urlParameters) {
            resetConfiguration();
            window.location = getRedirectUrl();
        }

        var mode = sessionStorage[SESSION_MODE];
        var tokenUrl = sessionStorage[SESSION_TOKEN_URL];
        var authorizationToken = sessionStorage[SESSION_AUTHORIZATION_TOKEN];

        var fhirUrl = urlParameters["fhirServiceUrl"];
        if (fhirUrl) {
            tokenUrl = urlParameters["tokenUrl"] || null;
            if (tokenUrl) {
                mode = MODE_LOGIN;
            } else {
                mode = MODE_ANONYMOUS;
            }
            sessionStorage[SESSION_FHIR_URL] = fhirUrl;
            sessionStorage[SESSION_MODE] = mode;
            sessionStorage[SESSION_TOKEN_URL] = tokenUrl;
            setAuthorizationToken(null);
            window.location = getRedirectUrl();
        } else {
            fhirUrl = urlParameters["iss"];
            if (!fhirUrl) {
                fhirUrl = sessionStorage[SESSION_FHIR_URL];
                if (!fhirUrl) {
                    $scope.StartupErrorMessage = "Please specify the FHIR server base URL using either the 'fhirServiceUrl' (if public) or 'iss' (if with SMART authorization) URL parameter";
                } else if (!authorizationToken && mode === MODE_CODE) {
                    var code = urlParameters["code"];
                    if (!code) {
                        $scope.StartupErrorMessage = "Authorization error: " + (urlParameters["error_description"] || urlParameters["error"] || "missing 'code' parameter");
                    } else {
                        doGetAccessToken(
							tokenUrl,
							{
							    grant_type: "authorization_code",
							    code: code,
							    client_id: PDemoConfiguration.clientID,
							    redirect_uri: getRedirectUrl(),
							},
							function (accessToken) {
							    setAuthorizationToken(accessToken);
							    window.location = getRedirectUrl();
							},
							function (errorMessage) {
							    $scope.StartupErrorMessage = "Get access token failed: " + errorMessage;
							}
						);
                    }
                }
            } else {
                setAuthorizationToken(null);
                $http({
                    url: fhirUrl + "/metadata",
                    method: "GET",
                }).success(function (data) {
                    var authorizeUrl = null;
                    if (data && data.rest && data.rest.length > 0 && data.rest[0].security && data.rest[0].security.extension) {
                        var extensions = data.rest[0].security.extension;
                        for (var i = 0; i < extensions.length; i++) {
                            var extension = extensions[i];
                            if (extension.url === "http://fhir-registry.smarthealthit.org/Profile/oauth-uris#authorize") {
                                authorizeUrl = extension.valueUri;
                            } else if (extension.url === "http://fhir-registry.smarthealthit.org/Profile/oauth-uris#token") {
                                tokenUrl = extension.valueUri;
                            }
                        }
                    }
                    if (!authorizeUrl || !tokenUrl) {
                        $scope.StartupErrorMessage = "The FHIR server conformance statement does not specify the SMART authorization and token URLs";
                    } else {
                        var redirectParameters = "";
                        redirectParameters = appendParameter(redirectParameters, "response_type", "code");
                        redirectParameters = appendParameter(redirectParameters, "client_id", PDemoConfiguration.clientID);
                        redirectParameters = appendParameter(redirectParameters, "redirect_uri", getRedirectUrl());
                        redirectParameters = appendParameter(redirectParameters, "scope", "user/*.*");
                        mode = MODE_CODE;
                        sessionStorage[SESSION_FHIR_URL] = fhirUrl;
                        sessionStorage[SESSION_MODE] = mode;
                        sessionStorage[SESSION_TOKEN_URL] = tokenUrl;
                        window.location = authorizeUrl + redirectParameters;
                    }
                }).error(function (data, status) {
                    if (data && data.issue && data.issue.length > 0 && data.issue[0].details) {
                        $scope.StartupErrorMessage = "Get conformance failed: " + data.issue[0].details;
                    } else if (status === 0) {
                        $scope.StartupErrorMessage = "Get conformance failed: cannot connect to " + fhirUrl;
                    } else {
                        $scope.StartupErrorMessage = "Get conformance failed with error " + status;
                    }
                });
            }
        }

        function getRedirectUrl() {
            return window.location.href.substring(0, window.location.href.length - window.location.search.length)
        }

        $scope.getFhirUrl = function () {
            return sessionStorage[SESSION_FHIR_URL];
        };

        $scope.requireLogin = function () {
            return mode === MODE_LOGIN && !authorizationToken;
        };

        $scope.login = function () {
            $scope.LoginErrorMessage = null;
            $scope.SearchErrorMessage = null;
            $scope.LoggingIn = true;
            doGetAccessToken(
				tokenUrl,
				{
				    grant_type: "password",
				    client_id: PDemoConfiguration.clientID,
				    username: $scope.UserName,
				    password: $scope.Password,
				},
				function (accessToken) {
				    $scope.LoggingIn = false;
				    setAuthorizationToken(accessToken);
				},
				function (errorMessage) {
				    $scope.LoggingIn = false;
				    $scope.LoginErrorMessage = "Sign in failed: " + errorMessage;
				}
			);
        };

        function doGetAccessToken(url, data, onSuccess, onError) {
            $http({
                url: url,
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                transformRequest: [function (data) {
                    return angular.isObject(data) && String(data) !== "[object File]" ? jQuery.param(data) : data;
                }],
                data: data
            }).success(function (data) {
                onSuccess(data.access_token);
            }).error(function (data, status) {
                if (data && data.error_description) {
                    onError(data.error_description);
                } else if (status === 0) {
                    onError("cannot connect to " + url);
                } else {
                    onError("error " + status);
                }
            });
        };

        $scope.searchFieldEnabled = function (field) {
            return getConfiguration().searchFields[field];
        };

        $scope.searchFieldLabel = function (field) {
            for (var i = 0; i < $scope.SearchFields.length; i++) {
                var searchField = $scope.SearchFields[i];
                if (searchField.field === field) {
                    return searchField.label + ":";
                }
            }
            return null;
        };

        $scope.genderValues = function () {
            return getConfiguration().genderValueSet.values;
        };

        $scope.searchIdentifierSystems = function () {
            return getConfiguration().searchIdentifierSystems;
        };

        var initialSearchIdentifierSystems = $scope.searchIdentifierSystems();
        if (initialSearchIdentifierSystems && initialSearchIdentifierSystems.length > 0) {
            $scope.IdentifierSystem = initialSearchIdentifierSystems[0].uri;
        }

        $scope.dismissLoginErrorMessage = function () {
            $scope.LoginErrorMessage = null;
        };

        $scope.logout = function () {
            $scope.UserName = null;
            $scope.Password = null;
            setAuthorizationToken(null);
        };

        function setAuthorizationToken(token) {
            authorizationToken = token;
            if (token) {
                sessionStorage[SESSION_AUTHORIZATION_TOKEN] = token;
                if ($scope.UserName) {
                    sessionStorage[SESSION_USERNAME] = $scope.UserName;
                } else {
                    sessionStorage.removeItem(SESSION_USERNAME);
                }
            } else {
                sessionStorage.removeItem(SESSION_AUTHORIZATION_TOKEN);
                sessionStorage.removeItem(SESSION_USERNAME);
            }
        }

        $scope.search = function (resource) {
            var parameters = "";
            parameters = appendCodeSearchParameter(parameters, "identifier", $scope.IdentifierSystem, $scope.Identifier);
            parameters = appendStringSearchParameter(parameters, "name", $scope.Name, $scope.NameExact);
            parameters = appendStringSearchParameter(parameters, "family", $scope.Family, $scope.FamilyExact);
            parameters = appendStringSearchParameter(parameters, "given", $scope.Given, $scope.GivenExact);
            parameters = appendDateSearchParameter(parameters, "birthdate", $scope.BirthDate);
            parameters = appendStringSearchParameter(parameters, "address", $scope.Address, $scope.AddressExact);
            parameters = appendCodeSearchParameter(parameters, "gender", getConfiguration().genderValueSet.uri, $scope.Gender);
            parameters = appendStringSearchParameter(parameters, "telecom", $scope.Telecom, $scope.TelecomExact);
            if ($scope.Sort) {
                parameters = appendParameter(parameters, "_sort:" + $scope.Sort.direction, $scope.Sort.field);
            }
            parameters = appendParameter(parameters, "_count", getConfiguration().resultsPerPage);
            parameters = appendParameter(parameters, "_format", "json");  // OpenHIE server wants this
            var searchUrl = fhirUrl + "/" + resource + parameters;
            $scope.Patients = [];
            $scope.TotalPatientsCount = null;
            $scope.NextPatientsSearchUrl = null;
            $scope.SelectedPatient = null;
            doSearch(searchUrl);
        };

        $scope.configure = function () {
            $scope.EditableConfiguration = angular.copy(getConfiguration());
        };

        $scope.configureOK = function () {
            saveConfiguration($scope.EditableConfiguration);
            $scope.EditableConfiguration = null;
        };

        $scope.configureCancel = function () {
            $scope.EditableConfiguration = null;
        };

        $scope.configureAddIdentifierSystem = function () {
            var searchIdentifierSystems = $scope.EditableConfiguration.searchIdentifierSystems;
            searchIdentifierSystems.push({ uri: "", name: "" });
        };

        $scope.configureRemoveIdentifierSystem = function (system) {
            var searchIdentifierSystems = $scope.EditableConfiguration.searchIdentifierSystems;
            for (var i = 0; i < searchIdentifierSystems.length; i++) {
                if (searchIdentifierSystems[i] === system) {
                    searchIdentifierSystems.splice(i, 1);
                    return;
                }
            }
        };

        $scope.configureAddGenderValue = function () {
            var genderValues = $scope.EditableConfiguration.genderValueSet.values;
            genderValues.push({ code: "", name: "" });
        };

        $scope.configureRemoveGenderValue = function (value) {
            var genderValues = $scope.EditableConfiguration.genderValueSet.values;
            for (var i = 0; i < genderValues.length; i++) {
                if (genderValues[i] === value) {
                    genderValues.splice(i, 1);
                    return;
                }
            }
        };

        function getConfiguration() {
            if (!$scope.Configuration) {
                var defaultValue = {
                    searchFields: PDemoConfiguration.defaultSearchFields,
                    searchIdentifierSystems: PDemoConfiguration.defaultSearchIdentifierSystems,
                    genderValueSet: PDemoConfiguration.defaultGenderValueSet,
                    resultsPerPage: PDemoConfiguration.defaultResultsPerPage,
                    getDetails: false,
                };
                var configurationJson = localStorage[CONFIGURATION];
                if (!configurationJson) {
                    $scope.Configuration = defaultValue;
                } else {
                    try {
                        $scope.Configuration = JSON.parse(configurationJson);
                    } catch (e) {
                        $scope.Configuration = defaultValue;
                    }
                }
            }
            return $scope.Configuration;
        }

        function saveConfiguration(value) {
            localStorage[CONFIGURATION] = JSON.stringify(value);
            $scope.Configuration = value;
            var index;
            // Check that the currently selected identifier system is still defined, if not re-set it to the first
            if ($scope.IdentifierSystem) {
                var identifierSystems = value.searchIdentifierSystems;
                if (!identifierSystems || identifierSystems.length === 0) {
                    $scope.IdentifierSystem = null;
                } else {
                    index = identifierSystems.length - 1;
                    while (index >= 0 && identifierSystems[index].uri !== $scope.IdentifierSystem) {
                        index--;
                    }
                    if (index < 0) {
                        $scope.IdentifierSystem = identifierSystems[0].uri;
                    }
                }
            }
            // Check that the currently selected gender is still defined, if not clear it
            if ($scope.Gender) {
                var genderValues = value.genderValueSet.values;
                if (genderValues) {
                    index = genderValues.length - 1;
                    while (index >= 0 && genderValues[index].code !== $scope.Gender) {
                        index--;
                    }
                }
                if (index < 0) {
                    $scope.Gender = null;
                }
            }
        }

        function resetConfiguration() {
            localStorage.removeItem(CONFIGURATION);
            $scope.Configuration = null;
        }

        $scope.searchDisabled = function () {
            return (mode !== MODE_ANONYMOUS && !authorizationToken) || $scope.Searching || $scope.StartupErrorMessage;
        };

        $scope.searchNext = function () {
            doSearch($scope.NextPatientsSearchUrl);
        };

        $scope.dismissSearchErrorMessage = function () {
            $scope.SearchErrorMessage = null;
        };

        $scope.getPatientsCountDescription = function () {
            if (!$scope.Patients || $scope.Patients.length === 0) {
                return "No results";
            }
            var result = $scope.Patients.length.toString();
            if ($scope.TotalPatientsCount) {
                result += " / ";
                result += $scope.TotalPatientsCount.toString();
            }
            return result;
        };

        $scope.select = function (patient) {
            if (!getConfiguration().getDetails || $scope.searchDisabled()) {
                $scope.SelectedPatient = patient;
            } else {
            	var patientId = patient.id;
                var patientLink = patient.selfLink;
                doGetPatient(patientId, patientLink, function (patient) {
                	patient.id = patientId;
                    patient.selfLink = patientLink;
                    $scope.SelectedPatient = patient;
                });
            }
        };

        $scope.toggleCollapse = function (part) {
            if (!(part.load && part.collapsed)) {
                part.collapsed = !part.collapsed;
            } else {
                part.load(function (parts) {
                    if (!parts || parts.length == 0) {
                        parts = ["---"]
                    }
                    part.parts = parts;
                    part.load = null;
                    part.collapsed = false;
                })
            }
        };

        function getPatientResources(patientId, resourceType, mapResource, onSuccess) {
        	var patientSearchParameter = PDemoConfiguration.patientSearchParameters[resourceType];
        	if (!patientSearchParameter) {
        		throw "No patient search parameter definied for " + resourceType;
        	}
			// Some server (e.g. Furore) do not like the complete URL as the id, nor an initial '/', so we reduce the id to a relative URL
        	if (patientId.indexOf(fhirUrl) === 0) {
        		patientId = patientId.substr(fhirUrl.length);
        	}
        	if (patientId[0] === "/") {
        		patientId = patientId.substr(1);
        	}
        	var searchUrl = fhirUrl + "/" + resourceType + "?" + patientSearchParameter + "=" + encodeURIComponent(patientId);
        	$http({
        		url: searchUrl,
        		method: "GET",
        		headers: getHeaders(),
        	}).success(function (data) {
        		var parts = [];
        		if (data.entry) {
        			for (var i = 0; i < data.entry.length; i++) {
        				var entry = data.entry[i];
        				if (entry && entry.content) {
        					var mappedResource = mapResource(entry.content);
        					if (mappedResource) {
        						parts.push(mappedResource);
        					}
        				}
					}
        		}
        		onSuccess(parts);
        	}).error(function (data, status) {
        		handleHttpError("Get " + resourceType, data, status);
        	});
        };

        function mapCondition(condition) {
        	return codeAndDateDescription("condition", condition.code, condition.dateAsserted);
        }

        function mapEncounter(encounter) {
			/**
				"resourceType":"Encounter",
				"id":"d0db1dc3-6a10-e511-8293-0050b664cec5",
				"identifier":[
					{
						"use":"official",
						"value":"DefaultNameSpaceCode_3/20/201"
					}
				],
				"class":"outpatient",
				"subject":{
					"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"
				},
				"period":{
					"start":"2014-03-20T00:00:00-04:00"
				},
				"location":[
					{
						"location": {
							"reference":"Location/cedb1dc3-6a10-e511-8293-0050b664cec5"
						},
						"period": {
							"start":"2014-03-20T00:00:00-04:00"
						}
					}
				]
			*/
			var period = encounter.period;
        	if (period && period.start) {
        		var part = "Admitted on " + getDisplayableDate(period.start);
        		if (period.end) {
        			part += " and discharged on " + getDisplayableDate(period.end);
        		}
        		return part;
        	}
       		return "Encounter - Unknown dates.";
        }

        function mapProcedure(procedure) {
        	/***
				"resourceType":"Procedure",
				"id":"72a8a6af-5c10-e511-8293-0050b664cec5",
				"subject":{
					"reference":"Patient/61a8a6af-5c10-e511-8293-0050b664cec5"
				},
				"type":{
					"coding":[
						{
							"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode",
							"code":"283",
							"display":"TONSILLECTOMY/ADENOIDEC","primary":true
						}
					],
					"text":"TONSILLECTOMY/ADENOIDEC"
				},
				"date":{
					"start":"2015-06-10T00:00:00-04:00",
					"end":"2015-06-10T00:00:00-04:00"
				},
				"encounter":{
					"reference":"Encounter/65a8a6af-5c10-e511-8293-0050b664cec5"
				}
			**/
        	return codeAndDateDescription("procedure", procedure.type, procedure.date ? procedure.date.start : null);
        }

        function mapImmunization(immunization) {
        	/**
				"resourceType":"Immunization",
				"id":"e0db1dc3-6a10-e511-8293-0050b664cec5",
				"date":"7/23/2013 12:00:00 AM -04:00",
				"vaccineType":{
					"coding":[
						{
							"system":"urn:oid:2.16.840.1.113883.6.59",
							"code":"62",
							"display":"H PAPILLOMA VACC 3 DOSE IM GARDASIL",
							"primary":true
						}
					],
					"text":"H PAPILLOMA VACC 3 DOSE IM GARDASIL"
				},
				"subject":{
					"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"
				},
				"refusedIndicator":true,
				"doseQuantity":{
					"value":-1.0000000000,
					"units":"No dosage units provided",
					"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/MedicationAdministrationDoseUnits",
					"code":"NotProvided"
				}
			**/
        	return codeAndDateDescription("immunization", immunization.vaccineType, immunization.date);
        }

        function mapMedicationPrescription(medicationPrescription) {
        	/**
				"resourceType":"MedicationPrescription","id":"d3db1dc3-6a10-e511-8293-0050b664cec5",
				"dateWritten":"2014-03-26T00:00:00-04:00","status":"completed",
				"patient":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},
				"prescriber":{"reference":"Practitioner/c6db1dc3-6a10-e511-8293-0050b664cec5"},
				"medication":{
					"reference":"Medication/18"
				},
				"dosageInstruction":[
					{
						"text":"Motrin:  1 tablet by Oral route every 6-8 hours PRN Give one tablet with food Dispense: 60 tab(s) With: 1 refill(s)",
						"timingSchedule":{
							"event":[
								{
									"start":"2014-03-26T00:00:00-04:00",
									"end":"9999-12-31T23:59:59+00:00"
								}
							]
						},
						"asNeededBoolean":false,
						"doseQuantity":{
							"value":-1.0000000000,
							"units":"No dosage units provided",
							"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/OrderDoseUnits",
							"code":"NotProvided"
						}
					}
				],
				"dispense":{
					"medication":{
						"reference":"Medication/18"
					}
				}
			**/
        	// TODO ... Read the code from reference medication code  
        	var medication = null;
        	if (medicationPrescription.contained && medicationPrescription.contained.length > 0) {
        		medication = medicationPrescription.contained[0];
            }
        	return codeAndDateDescription("medication", medication ? medication.code : null, medicationPrescription.dateWritten);
		}

        function mapReport(report) {
        	/**
				"resourceType":"DiagnosticReport",
				"id":"4_e5db1dc36a10e51182930050b664cec5",
				"name":{
					"coding":[
						{
							"system":"urn:oid:2.16.840.1.113883.6.12",
							"code":"80061",
							"display":"Lipid panel, Fasting ",
							"primary":true
						}
					],
					"text":"Lipid panel, Fasting "
				},
				"status":"partial",
				"issued":"2014-03-28T00:00:00-04:00",
				"subject":{
					"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"
				},
				"diagnosticDateTime":"2014-03-28T00:00:00-04:00",
				"result":[
					{
						"reference":"Observation/2_e7db1dc36a10e51182930050b664cec5"}
					]
				}
			**/
        	return codeAndDateDescription("report", report.name, report.diagnosticDateTime);
        }

        function mapObservation(observation) {
        	/**
				"resourceType":"Observation",
				"id":"2_e8db1dc36a10e51182930050b664cec5",
				"name":{
					"coding":[
						{
							"system":"urn:oid:2.16.840.1.113883.6.1",
							"code":"85025",
							"display":"CBC with diff - CBC with diff (LABCORP)\r\nNote: Documents are attached to this order that cannot be displayed here.",
							"primary":true
						}
					],
					"text":"CBC with diff - CBC with diff (LABCORP)\r\nNote: Documents are attached to this order that cannot be displayed here.
				"},
				"valueString":"March 28, 2014",
				"appliesDateTime":"2014-03-28T00:00:00-04:00",
				"issued":"2014-03-28T00:00:00-04:00",
				"status":"final",
				"reliability": "ok",
				"subject":{
					"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"
				}
			**/
        	return codeAndDateDescription("observation", observation.name, observation.appliesDateTime);
        }

        function codeAndDateDescription(resourceDescription, codeableConcept, dateTime) {
        	var description = getCodeableConceptDisplayName(codeableConcept) || ("Unknown " + resourceDescription);
        	if (dateTime) {
        		description += " on ";
        		description += getDisplayableDate(dateTime);
        	}
        	return description;
        }

        function doSearch(searchUrl) {
            $scope.SearchErrorMessage = null;
            $scope.Searching = true;
            $http({
                url: searchUrl,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
                $scope.Searching = false;
                /*
				{
					"resourceType": "Bundle",
					"title": "Patient search",
					"id": "urn:uuid:d7a29f70-634d-47ab-9d1c-6e24c7ab640e",
					"updated": "2014-12-16T21:34:35.7046776+00:00",
					"author": [{ "name": "CareEvolution FHIR server", "uri": "http://careevolution.com" }],
					"totalResults": "10",
					"link": [
						{ "rel": "self", "href": "https://localhost:8080/fhir/Patient?family=d&_start=1" },
						{ "rel": "fhir-base", "href": "https://localhost:8080/fhir" }
					],
					"entry": [
						{
							"title": "Patient Demoski, Fran",
							"id": "urn:uuid:93ea3c92-ab3d-e411-82b1-281878d58b60",
							"updated": "2014-09-16T10:45:31.02-04:00",
							"link": [
								{ "rel": "self", "href": "https://localhost:8080/fhir/Patient/93ea3c92-ab3d-e411-82b1-281878d58b60" }
							],
							"content":
								{
									"resourceType": "Patient",
									"id": "93ea3c92-ab3d-e411-82b1-281878d58b60",
									"identifier": [
										{ "system": "urn:oid:2.16.840.1.113883.4.1", "value": "987229876" }
									], 
									"name": [
										{ "use": "official", "family": ["Demoski"], "given": ["Fran"] }
									], 
									"gender": { 
										"coding": [
											{ "system": "http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/TestCodespace/Gender", "code": "F" }
										] 
									}, 
									"birthDate": "2009-08-17", 
									"deceasedBoolean": false, 
									"address": [
										{ "use": "home", "line": ["101 Drury Lane"], "city": "Churchill", "state": "MI", "zip": "48887", "country": "USA" }
									]
								}
						}
					]
				}
				*/
                if (data.entry) {
                    var knownIdentifierSystem = computeKnownIdentifierSystems();
                    for (var i = 0; i < data.entry.length; i++) {
                        var entry = data.entry[i];
                        var patient = createPatient(entry.content, entry.id, getSelfLink(entry), knownIdentifierSystem);
                        $scope.Patients.push(patient);
                    }
                }
                $scope.TotalPatientsCount = data.totalResults;
                $scope.NextPatientsSearchUrl = getLinkHRef(data, "next");
            }).error(function (data, status) {
                $scope.Searching = false;
                handleHttpError("Search", data, status);
            });
        }

        function doGetPatient(id, link, onSuccess) {
            $http({
            	url: link,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
            	var patient = createPatient(data, id, link, computeKnownIdentifierSystems());
                onSuccess(patient);
            }).error(function (data, status) {
                handleHttpError("Get patient", data, status);
            });
        }

        function getHeaders() {
            var headers = {};
            if (authorizationToken) {
                headers.Authorization = "Bearer " + authorizationToken;
            }
            return headers;
        }

        function handleHttpError(operation, data, status) {
            if (status === 401) {
                $scope.SearchErrorMessage = operation + " failed: not authorized. Please sign in again";
                $scope.logout();
            } else if (data && data.issue && data.issue.length > 0 && data.issue[0].details) {
                $scope.SearchErrorMessage = operation + " failed: " + data.issue[0].details;
            } else if (status === 0) {
                $scope.SearchErrorMessage = operation + " failed: cannot connect to " + fhirUrl;
            } else {
                $scope.SearchErrorMessage = operation + " failed with error " + status;
            }
        }

        function getLinkHRef(bundle, rel) {
            if (!bundle || !bundle.link) {
                return null;
            }
            var links = bundle.link;
            for (var i = 0; i < links.length; i++) {
                if (links[i].rel === rel) {
                    return links[i].href;
                }
            }
            return null;
        }

        function appendStringSearchParameter(parameters, parameterName, value, exact) {
            if (!value) {
                return parameters;
            }
            if (exact) {
                parameterName += ":exact";
            }
            return appendParameter(parameters, parameterName, escapeFhirSearchParameter(value));
        }

        function appendCodeSearchParameter(parameters, parameterName, system, code) {
            if (!code) {
                return parameters;
            }
            var value = joinNonEmpty("|", [
				escapeFhirSearchParameter(system),
				escapeFhirSearchParameter(code)
            ]);
            return appendParameter(parameters, parameterName, value);
        }

        function appendDateSearchParameter(parameters, parameterName, value) {
            var parsedValue = parseDateSearchValue(value);
            if (!parsedValue) {
                return parameters;
            }
            return appendParameter(parameters, parameterName, escapeFhirSearchParameter(parsedValue));
        }

        function escapeFhirSearchParameter(value) {
            // See http://www.hl7.org/implement/standards/fhir/search.html#escaping
            if (!value) {
                return "";
            }
            // Add "\" before  "$", ",", "|" and "\"
            return value.replace(/[\$\,\|\\]/, "\\$&");
        }

        function appendParameter(parameters, parameterName, parameterValue) {
            if (parameterValue) {
                if (parameters) {
                    parameters += "&";
                } else {
                    parameters = "?";
                }
                parameters += parameterName;
                parameters += "=";
                parameters += encodeURIComponent(parameterValue);
            }
            return parameters;
        }

        function parseDateSearchValue(value) {
            if (!value) {
                return null;
            }
            if (value.match(/^\d\d\d\d$/) || value.match(/^\d\d\d\d-\d\d$/)) {
                return value;
            }
            var dateTime = parseDateTime(value);
            if (dateTime) {
                return dateTime.getFullYear() + "-" +
					padWithZero(dateTime.getMonth() + 1) + "-" +
					padWithZero(dateTime.getDate());
            }
            return null;
        }

        function padWithZero(s) {
            if (!s || s.toString().length > 1) {
                return s;
            }
            return "0" + s;
        }

        function getSelfLink(entry) {
            if (entry.link) {
                for (var i = 0; i < entry.link.length; i++) {
                    var link = entry.link[i];
                    if (link.rel === "self" && link.href) {
                        return link.href;
                    }
                }
            }
            return entry.id;
        }

        function createPatient(patient, id, selfLink, knownIdentifierSystems) {
            var displayName = composeDisplayName(getOfficialOrFirstName(patient));
            var genderDisplayName = getGenderDisplayName(patient);
            var displayAgeOrDeceased = composeDisplayAgeOrDeceased(patient);
            return {
                resultHeader: displayName,
                resultLines: [
					joinNonEmpty(", ", [
						genderDisplayName,
						displayAgeOrDeceased,
					]),
                ],
				id: id,
                selfLink: selfLink,
                detailsHeader: displayName,
                detailsParts: filterEmptyAndFlatten([
					genderDisplayName,
					displayAgeOrDeceased,
					!patient.name || patient.name.constructor != Array || patient.name.length === 0 ?
						null :
						{
						    header: "Names",
						    parts: patient.name.map(function (name) {
						        return joinNonEmpty(" ", [
									composeDisplayName(name),
									addPrefixSuffixNonEmpty("[", name.use, "]"),
						        ]);
						    }),
						    collapsed: false,
						    load: null,
						},
					!patient.telecom || patient.telecom.length === 0 ?
						null :
						{
						    header: "Contacts",
						    parts: patient.telecom.map(function (telecom) {
						        return joinNonEmpty(" ", [
									addPrefixSuffixNonEmpty("", firstUppercase(telecom.system), ":"),
									telecom.value,
									addPrefixSuffixNonEmpty("[", telecom.use, "]"),
						        ]);
						    }),
						    collapsed: false,
						    load: null,
						},
					!patient.address || patient.address.length === 0 ?
						null :
                        patient.address.constructor != Array ?
                        composeDisplayAddressLines(patient.address) :
						patient.address.map(function (address) {
						    return {
						        header: joinNonEmpty(" - ", ["Address", address.use]),
						        parts: composeDisplayAddressLines(address),
						        collapsed: false,
						        load: null,
						    };
						}),
					!patient.identifier || patient.identifier.length === 0 ?
						null :
						{
						    header: "Identifiers",
						    parts: patient.identifier.map(function (identifier) {
						        // See http://www.hl7.org/implement/standards/fhir/datatypes.html#identifier
						        return joinNonEmpty(" ", [
									addPrefixSuffixNonEmpty("", identifier.label || getIdentifierSystemDisplayName(identifier.system, knownIdentifierSystems), ":"),
									identifier.value,
									addPrefixSuffixNonEmpty("[", identifier.use, "]"),
						        ]);
						    }),
						    collapsed: false,
						    load: null,
						},
					{
					    header: "Encounters",
					    parts: [". . ."],
					    collapsed: true,
					    load: function (onSuccess) {
					    	getPatientResources(id, "Encounter", mapEncounter, onSuccess)
					    },
					},
					{
					    header: "Immunizations",
					    parts: [". . ."],
					    collapsed: true,
					    load: function (onSuccess) {
					    	getPatientResources(id, "Immunization", mapImmunization, onSuccess)
					    },
					},
					{
					    header: "Procedures",
					    parts: [". . ."],
					    collapsed: true,
					    load: function (onSuccess) {
					    	getPatientResources(id, "Procedure", mapProcedure, onSuccess)
					    },
					},
					{
					    header: "Conditions",
					    parts: [". . ."],
					    collapsed: true,
					    load: function (onSuccess) {
							getPatientResources(id, "Condition", mapCondition, onSuccess);
					    },
					},
					{
					    header: "Medication prescriptions",
					    parts: [". . ."],
					    collapsed: true,
					    load: function (onSuccess) {
					    	getPatientResources(id, "MedicationPrescription", mapMedicationPrescription, onSuccess, "patient")
					    },
					},
					{
					    header: "Reports",
					    parts: [". . ."],
					    collapsed: true,
					    load: function (onSuccess) {
					    	getPatientResources(id, "DiagnosticReport", mapReport, onSuccess)
					    },
					},
					{
					    header: "Observations",
					    parts: [". . ."],
					    collapsed: true,
					    load: function (onSuccess) {
					    	getPatientResources(id, "Observation", mapObservation, onSuccess)
					    },
					},
                ]),
            };
        }

        function getIdentifierSystemDisplayName(identifierSystem, knownIdentifierSystems) {
            if (!identifierSystem) {
                return null;
            }
            var knownName = knownIdentifierSystems[identifierSystem];
            if (knownName === "") {
                return knownName;
            }
            return knownName || ("[" + identifierSystem + "]");
        }

        function computeKnownIdentifierSystems() {
            var result = {};
            addIdentifierSystems(result, PDemoConfiguration.knownIdentifierSystems);
            addIdentifierSystems(result, getConfiguration().searchIdentifierSystems);
            return result;
        }

        function addIdentifierSystems(dictionary, identifierSystems) {
            for (var i = 0; i < identifierSystems.length; i++) {
                var identifierSystem = identifierSystems[i];
                dictionary[identifierSystem.uri] = identifierSystem.name;
            }
        }

        function getOfficialOrFirstName(patient) {
            if (patient.name.constructor != Array) {
                return patient.name;
            }
            return getSpecificUseOrFirst(patient.name, "official");
        }

        function composeDisplayName(name) {
            if (!name) {
                return null;
            }
            return joinNonEmpty(", ", [
				joinNames(name.family),
				joinNames(name.given)
            ]);
        }

        function joinNames(names) {
            return !names ? null : joinNonEmpty(" ", names.map(firstUppercase));
        }

        function getGenderDisplayName(patient) {
            return getCodeableConceptDisplayName(patient.gender, { "m": "Male", "f": "Female" });
        }

        function getCodeableConceptDisplayName(codeableConcept, codeMap) {
            // See http://www.hl7.org/implement/standards/fhir/datatypes.html#codeableconcept
            if (codeableConcept) {
                if (codeableConcept.text) {
                    return firstUppercase(codeableConcept.text);
                }
                var coding = codeableConcept.coding;
                if (coding && coding.length > 0) {
                    for (var i = 0; i < coding.length; i++) {
                        if (coding[i].display) {
                            return firstUppercase(coding[i].display);
                        }
                    }
                    var code = coding[0].code;
                    if (code && codeMap && (code.toLowerCase() in codeMap)) {
                        return codeMap[code.toLowerCase()];
                    }
                    return code;
                }
            }
            return null;
        }

        function composeDisplayAddressLines(address) {
            if (!address) {
                return null;
            }
            var result = filterEmpty(address.line) || [];
            // Anyville, ZQ 99999 -or- Anyville, ZQ -or- Anyville, 99999 -or Anyville -or- ZQ 99999 -or- ZQ -or- 99999
            var cityLine = joinNonEmpty(", ", [
				address.city,
				joinNonEmpty(" ", [
					address.state,
					address.zip
				])
            ]);
            if (cityLine) {
                result.push(cityLine);
            }
            if (address.country) {
                result.push(address.country);
            }
            return result.length > 0 ? result : null;
        }

        function composeDisplayAgeOrDeceased(patient) {
            var result = null;
            if (patient.deceasedBool) {
                result = "Deceased";
            } else {
                var deceasedDate = parseDateTime(patient.deceasedDate);
                if (deceasedDate) {
                    result = "Deceased " + deceasedDate.toLocaleDateString();
                }
            }
            if (!result) {
                result = addPrefixSuffixNonEmpty("Age ", getAge(patient), "");
            }
            if (result) {
                var birthDate = parseDateTime(patient.birthDate);
                if (birthDate) {
                    result += " (DOB " + birthDate.toLocaleDateString() + ")";
                }
            }
            return result;
        }

        function getDisplayableDate(date) {
            if (date) {
                return parseDateTime(date).toLocaleDateString();
            }
            return "";
        }

        function getAge(patient) {
            var birthDate = parseDateTime(patient.birthDate);
            if (!birthDate) {
                return null;
            }
            var now = new Date();
            now.setTime(Date.now());
            var result = now.getFullYear() - birthDate.getFullYear();
            if (result > 0 &&
				(now.getMonth() < birthDate.getMonth() ||
				 now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate())) {
                result--;
            }
            return result;
        }

        function getSpecificUseOrFirst(values, use) {
            if (!values || values.length === 0) {
                return null;
            }
            for (var i = 0; i < values.length; i++) {
                if (values[i].use === use) {
                    return values[i];
                }
            }
            return values[0];
        }

        function firstUppercase(str) {
            if (!str) {
                return null;
            }
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        }

        function parseDateTime(dateTimeString) {
            if (!dateTimeString) {
                return null;
            }
            // Handle this case explicitly to avoid considering the date as UTC - that is what the Date(str) constructor does
            if (dateTimeString.match(/^\d\d\d\d-\d\d-\d\d$/)) {
                try {
                    return new Date(
						parseInt(dateTimeString.substr(0, 4)),
						parseInt(dateTimeString.substr(5, 2)) - 1,
						parseInt(dateTimeString.substr(8, 2))
					);
                } catch (e) {
                    return null;
                }
            }
            try {
                return new Date(dateTimeString);
            } catch (e) {
                return null;
            }
        }

        function addPrefixSuffixNonEmpty(prefix, value, suffix) {
            if (!value) {
                return null;
            }
            return prefix + value + suffix;
        }

        function joinNonEmpty(separator, values) {
            if (!values || values.length === 0) {
                return null;
            }
            var nonEmptyValues = filterEmpty(values);
            return nonEmptyValues ? nonEmptyValues.join(separator) : null;
        }

        function filterEmpty(values) {
            if (!values || values.length === 0) {
                return null;
            }
            var result = values.filter(function (v) { return v; });
            return (result.length === 0) ? null : result;
        }

        function filterEmptyAndFlatten(values) {
            if (!values || values.length === 0) {
                return null;
            }
            var result = [];
            for (var i = 0; i < values.length; i++) {
                var value = values[i];
                if (value) {
                    if (!jQuery.isArray(value)) {
                        result.push(value);
                    } else {
                        for (var j = 0; j < value.length; j++) {
                            if (value[j]) {
                                result.push(value[j]);
                            }
                        }
                    }
                }
            }
            return (result.length === 0) ? null : result;
        }
    }]);
})();