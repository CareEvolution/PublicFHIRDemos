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
        $scope.NameOperator = "";
        $scope.Family = null;
        $scope.FamilyOperator = "";
        $scope.Given = null;
        $scope.GivenOperator = "";
        $scope.BirthDate = null;
        $scope.Address = null;
        $scope.AddressOperator = "";
        $scope.Gender = null;
        $scope.Telecom = null;
        $scope.TelecomOperator = "";
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
                            if (extension.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris" && extension.extension) {
                            	var subExtensions = extension.extension;
                            	for (var j = 0; j < subExtensions.length; j++) {
                            		var subExtension = subExtensions[j];
                            		if (subExtension.url === "authorize") {
                            			authorizeUrl = subExtension.valueUri;
                            		} else if (subExtension.url === "token") {
                            			tokenUrl = subExtension.valueUri;
                            		}
                            	}
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
                        redirectParameters = appendParameter(redirectParameters, "aud", fhirUrl);
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

        $scope.getProductDescription = function () {
        	return "Patient Demographics " + PDemoConfiguration.version + " (FHIR " + PDemoConfiguration.fhirVersion + ") - Copyright \xA9 " + PDemoConfiguration.copyrightYears + " CareEvolution Inc."
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
            return PDemoConfiguration.genderValues;
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
            parameters = appendStringSearchParameter(parameters, "name", $scope.Name, $scope.NameOperator);
            parameters = appendStringSearchParameter(parameters, "family", $scope.Family, $scope.FamilyOperator);
            parameters = appendStringSearchParameter(parameters, "given", $scope.Given, $scope.GivenOperator);
            parameters = appendDateSearchParameter(parameters, "birthdate", $scope.BirthDate);
            parameters = appendStringSearchParameter(parameters, "address", $scope.Address, $scope.AddressOperator);
            parameters = appendCodeSearchParameter(parameters, "gender", null, $scope.Gender);
            parameters = appendStringSearchParameter(parameters, "telecom", $scope.Telecom, $scope.TelecomOperator);
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

        function getConfiguration() {
            if (!$scope.Configuration) {
                var defaultValue = {
                    searchFields: PDemoConfiguration.defaultSearchFields,
                    searchIdentifierSystems: PDemoConfiguration.defaultSearchIdentifierSystems,
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
        	// Clear the search fields that are not enabled
            if (!value.searchFields["identifier"]) {
            	$scope.IdentifierSystem = null;
            	$scope.Identifier = null;
            }
            if (!value.searchFields["name"]) {
            	$scope.Name = null;
            	$scope.NameOperator = "";
            }
            if (!value.searchFields["family"]) {
            	$scope.Family = null;
            	$scope.FamilyOperator = "";
            }
            if (!value.searchFields["given"]) {
            	$scope.Given = null;
            	$scope.GivenOperator = "";
            }
            if (!value.searchFields["birthdate"]) {
            	$scope.BirthDate = null;
            }
            if (!value.searchFields["address"]) {
            	$scope.Address = null;
            	$scope.AddressOperator = "";
            }
            if (!value.searchFields["gender"]) {
            	$scope.Gender = null;
            }
            if (!value.searchFields["telecom"]) {
            	$scope.Telecom = null;
            	$scope.TelecomOperator = "";
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
        		throw "No patient search parameter defined for " + resourceType;
        	}
			// Some server (e.g. Furore) do not like the complete URL as the id, nor an initial '/', so we reduce the id to a relative URL
        	if (patientId.indexOf(fhirUrl) === 0) {
        		patientId = patientId.substr(fhirUrl.length);
        	}
        	if (patientId[0] === "/") {
        		patientId = patientId.substr(1);
        	}
        	var searchUrl = fhirUrl + "/" + resourceType + "?_count=100&" + patientSearchParameter + "=" + encodeURIComponent(patientId);
        	$http({
        		url: searchUrl,
        		method: "GET",
        		headers: getHeaders(),
        	}).success(function (data) {
        		var parts = [];
        		if (data.entry) {
        			for (var i = 0; i < data.entry.length; i++) {
        				var entry = data.entry[i];
        				if (entry && entry.resource) {
        					var mappedResource = mapResource(entry.resource);
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
        	// http://www.hl7.org/implement/standards/fhir/encounter.html
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
        	// http://www.hl7.org/implement/standards/fhir/procedure.html
        	return codeAndDateDescription("procedure", procedure.code, procedure.performedPeriod ? procedure.performedPeriod.start : procedure.performedDateTime);
        }

        function mapImmunization(immunization) {
        	// http://www.hl7.org/implement/standards/fhir/immunization.html
        	return codeAndDateDescription("immunization", immunization.vaccineCode, immunization.date);
        }

        function mapMedicationOrder(medicationOrder) {
        	// http://www.hl7.org/implement/standards/fhir/medicationorder.html
        	// TODO ... If medicationCodeableConcept is missing get it from referenced medication (medicationOrder.medicationReference)
        	var medicationCode = medicationOrder.medicationCodeableConcept
        	return codeAndDateDescription("medication", medicationCode, medicationOrder.dateWritten);
		}

        function mapReport(report) {
        	// http://www.hl7.org/implement/standards/fhir/DiagnosticReport.html
        	return codeAndDateDescription("report", report.code, report.effectivePeriod ? report.effectivePeriod.start : report.effectiveDateTime);
        }

        function mapObservation(observation) {
        	// http://www.hl7.org/implement/standards/fhir/Observation.html
        	return codeAndDateDescription("observation", observation.code, observation.effectivePeriod ? observation.effectivePeriod.start : observation.effectiveDateTime);
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
            	// http://www.hl7.org/implement/standards/fhir/Bundle.html
                if (data.entry) {
                    var knownIdentifierSystem = computeKnownIdentifierSystems();
                    for (var i = 0; i < data.entry.length; i++) {
                        var entry = data.entry[i];
                        var patient = createPatient(entry.resource, entry.resource.id, entry.fullUrl, knownIdentifierSystem);
                        $scope.Patients.push(patient);
                    }
                }
                $scope.TotalPatientsCount = data.total;
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
            } else if (data && data.issue && data.issue.length > 0 && data.issue[0].details && data.issue[0].details.text) {
            	$scope.SearchErrorMessage = operation + " failed: " + data.issue[0].details.text;
            } else if (status === 0) {
                $scope.SearchErrorMessage = operation + " failed: cannot connect to " + fhirUrl;
            } else {
                $scope.SearchErrorMessage = operation + " failed with error " + status;
            }
        }

        function getLinkHRef(bundle, relation) {
            if (!bundle || !bundle.link) {
                return null;
            }
            var links = bundle.link;
            for (var i = 0; i < links.length; i++) {
            	if (links[i].relation === relation) {
                    return links[i].url;
                }
            }
            return null;
        }

        function appendStringSearchParameter(parameters, parameterName, value, operator) {
            if (!value) {
                return parameters;
            }
            if (operator) {
                parameterName += ":" + operator;
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
					    header: "Medication orders",
					    parts: [". . ."],
					    collapsed: true,
					    load: function (onSuccess) {
					    	getPatientResources(id, "MedicationOrder", mapMedicationOrder, onSuccess, "patient")
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
        	var genderValues = PDemoConfiguration.genderValues;
        	for (var i = 0; i < genderValues.length; i++) {
        		if (patient.gender === genderValues[i].code) {
        			return genderValues[i].name;
        		}
        	}
        	return patient.gender;
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
                var deceasedDate = parseDate(patient.deceasedDate);
                if (deceasedDate) {
                    result = "Deceased " + formatDate(deceasedDate);
                }
            }
            if (!result) {
                result = addPrefixSuffixNonEmpty("Age ", getAge(patient), "");
            }
            if (result) {
                var birthDate = parseDate(patient.birthDate);
                if (birthDate) {
                    result += " (DOB " + formatDate(birthDate) + ")";
                }
            }
            return result;
        }

        function getDisplayableDate(dateString) {
            if (dateString) {
            	return formatDate(parseDate(dateString));
            }
            return "";
        }

        function formatDate(date) {
        	return (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear()
        }

        function getAge(patient) {
            var birthDate = parseDate(patient.birthDate);
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

        function parseDate(dateTimeString) {
        	if (!dateTimeString) {
        		return null;
        	}
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