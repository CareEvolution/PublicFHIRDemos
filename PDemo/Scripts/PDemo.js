/* 
 * Copyright (c) 2015 - 2017, CareEvolution Inc (info@careevolution.com)
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

    PDemoApp.config(["$compileProvider", function($compileProvider) {
    	// Needed to be able to generate 'data:' HREFs
    	$compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|file|blob|data):/);
    }]);

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
			{ field: "race", label: "Race" },
			{ field: "ethnicity", label: "Ethnicity" },
			{ field: "age", label: "Age" },
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
        $scope.Race = null;
        $scope.Ethnicity = null;
        $scope.Age = null;
        $scope.AgeOperator = "";

        $scope.Sort = null;
        $scope.Sorts = PDemoConfiguration.sorts;

        $scope.Searching = false;
        $scope.GettingSummaryDocument = false;
        $scope.SearchErrorMessage = null;

        $scope.Patients = [];
        $scope.TotalPatientsCount = null;
        $scope.NextPatientsSearchUrl = null;
        $scope.SelectedPatient = null;

        $scope.Configuration = null;
        $scope.EditableConfiguration = null;

        $scope.DateRegExp = /\d\d\d\d\-\d\d-\d\d/;

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
                        redirectParameters = appendParameter(redirectParameters, "scope", "user/*.read");
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

        $scope.raceValues = function () {
        	return PDemoConfiguration.raceValues;
        };

        $scope.ethnicityValues = function () {
        	return PDemoConfiguration.ethnicityValues;
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
            parameters = appendNumberSearchParameter(parameters, "age", $scope.Age, $scope.AgeOperator);
            parameters = appendStringSearchParameter(parameters, "address", $scope.Address, $scope.AddressOperator);
            parameters = appendCodeSearchParameter(parameters, "gender", null, $scope.Gender);
            parameters = appendStringSearchParameter(parameters, "telecom", $scope.Telecom, $scope.TelecomOperator);
			if ($scope.Race) {
	            parameters = appendCodeSearchParameter(parameters, "race", $scope.Race.uri, $scope.Race.code);
			}
			if ($scope.Ethnicity) {
	            parameters = appendCodeSearchParameter(parameters, "ethnicity", $scope.Ethnicity.uri, $scope.Ethnicity.code);
			}
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
            if (!value.searchFields["race"]) {
            	$scope.Race = null;
            }
            if (!value.searchFields["ethnicity"]) {
            	$scope.Ethnicity = null;
            }
            if (!value.searchFields["age"]) {
            	$scope.Age = null;
            	$scope.AgeOperator = "";
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

        $scope.toggleCollapse = function(part) {
        	var dateRangeIdentifier = createIdentifier(part.dateRange);
        	var toLoad = part.load && part.collapsed && part.loadedDateRangeIdentifier !== dateRangeIdentifier;
            if (!toLoad) {
                part.collapsed = !part.collapsed;
            } else if ($scope.dateRangeForm.$valid) {
            	loadPart(part, dateRangeIdentifier);
            }
        };

        $scope.$watch("SelectedPatient.dateRange", function() {
        	if ($scope.SelectedPatient && $scope.dateRangeForm.$valid) {
        		var dateRangeIdentifier = createIdentifier($scope.SelectedPatient.dateRange);
        		for (var i = 0; i < $scope.SelectedPatient.detailsParts.length; i++) {
        			var part = $scope.SelectedPatient.detailsParts[i];
        			var loadedWithDifferentDateRange = part.load && !part.collapsed && part.loadedDateRangeIdentifier !== dateRangeIdentifier;
        			if (loadedWithDifferentDateRange) {
        				loadPart(part, dateRangeIdentifier);
        			}
        		}
        	}
        }, true);

        function createIdentifier(dateRange) {
        	return dateRange ?
				dateRange.from + "-" + dateRange.to :
        		null;
        }

        function loadPart(part, dateRangeIdentifier) {
        	part.load(function(parts) {
        		if (!parts || parts.length == 0) {
        			parts = ["---"]
        		}
        		part.parts = parts;
        		part.collapsed = false;
        		part.loadedDateRangeIdentifier = dateRangeIdentifier;
        	})
        }

        function getPatientResourcesPrimitive(patientId, dateRange, resourceType, processResource, onSuccess, onComplete, extraParameters) {
        	var parameters = "";

        	parameters = appendParameter(parameters, "_count", "100");

        	// Some server (e.g. Furore) do not like the complete URL as the id, nor an initial '/', so we reduce the id to a relative URL
        	if (patientId.indexOf(fhirUrl) === 0) {
        		patientId = patientId.substr(fhirUrl.length);
        	}
        	if (patientId[0] === "/") {
        		patientId = patientId.substr(1);
        	}
        	parameters = appendParameter(parameters, "patient", patientId);

        	var dateSearchParameter = PDemoConfiguration.dateSearchParameters[resourceType];
        	if (dateSearchParameter && dateRange && (dateRange.from || dateRange.to)) {
        		if (dateRange.from === dateRange.to) {
        			parameters = appendParameter(parameters, dateSearchParameter, dateRange.from);
        		} else {
        			if (dateRange.from) {
        				parameters = appendParameter(parameters, dateSearchParameter, "ge" + dateRange.from);
        			}
        			if (dateRange.to) {
        				parameters = appendParameter(parameters, dateSearchParameter, "le" + dateRange.to);
        			}
				}
        	}

        	if (extraParameters) {
        		parameters += "&" + extraParameters;
        	}

        	var searchUrl = fhirUrl + "/" + resourceType + parameters;
        	$http({
        		url: searchUrl,
        		method: "GET",
        		headers: getHeaders(),
        	}).success(function(data) {
        		onComplete();
        		var parts = [];
        		if (data.entry) {
        			for (var i = 0; i < data.entry.length; i++) {
        				var entry = data.entry[i];
        				if (entry && entry.resource && entry.resource.resourceType !== "OperationOutcome") {
        					processResource(parts, entry.resource);
        				}
        			}
        		}
        		onSuccess(parts);
        	}).error(function(data, status) {
        		onComplete();
        		handleHttpError("Get " + resourceType, data, status);
        	});
        };

        function getPatientSummaryDocument(patientId, dateRange, onSuccess, onComplete) {
        	// http://www.fhir.org/guides/argonaut/r2/OperationDefinition-docref.html
        	var parameters = "";
        	parameters = appendParameter(parameters, "patient", patientId);
        	if (dateRange.from) {
        		parameters = appendParameter(parameters, "start", dateRange.from);
        	}
        	if (dateRange.to) {
        		parameters = appendParameter(parameters, "end", dateRange.to);
        	}
        	parameters = appendParameter(parameters, "type", "34133-9");
        	var url = fhirUrl + "/DocumentReference/$docref" + parameters;
        	$http({
        		url: url,
        		method: "GET",
        		headers: getHeaders(),
        	}).success(function(data) {
        		onComplete();
        		var parts = [];
        		if (data.entry) {
        			for (var i = 0; i < data.entry.length; i++) {
        				var url = getDocumentUrl(data.entry[i].resource);
        				if (url) {
        					var fileName = "summary";
        					if (dateRange.from) {
        						fileName += dateRange.from;
        					}
        					if (dateRange.from || dateRange.to) {
        						fileName += "-";
        					}
        					if (dateRange.to) {
        						fileName += dateRange.to;
        					}
        					fileName += ".xml";
        					parts.push({ url: url, fileName: fileName });
        					break;
        				}
        			}
        		}
        		onSuccess(parts);
        	}).error(function(data, status) {
        		onComplete();
        		handleHttpError("Get patient CCDs", data, status);
        	});
        };

        function mapCondition(condition) {
        	return codeAndDateDescription("condition", condition.code, condition.dateAsserted || condition.onsetDateTime || (condition.onsetPeriod ? condition.onsetPeriod.start : null));
        }

        function mapEncounter(encounter) {
        	// http://www.hl7.org/implement/standards/fhir/DSTU2/encounter.html
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
        	// http://www.hl7.org/implement/standards/fhir/DSTU2/procedure.html
        	return codeAndDateDescription("procedure", procedure.code, procedure.performedPeriod ? procedure.performedPeriod.start : procedure.performedDateTime);
        }

        function mapImmunization(immunization) {
        	// http://www.hl7.org/implement/standards/fhir/DSTU2/immunization.html
        	return codeAndDateDescription("immunization", immunization.vaccineCode, immunization.date);
        }

        function mapMedicationOrderOrStatement(medicationOrderOrStatement) {
        	// http://www.hl7.org/implement/standards/fhir/DSTU2/medicationorder.html
        	var date = medicationOrderOrStatement.dateWritten || medicationOrderOrStatement.dateAsserted;
        	var medicationReference = medicationOrderOrStatement.medicationReference;
        	if (medicationReference) {
        		var description = "";
        		var asyncFixParts = null;
        		if (medicationReference.display) {
        			description = medicationReference.display;
        		} else if (medicationReference.reference) {
        			var relativeUrl = medicationReference.reference;
        			description = relativeUrl;
        			asyncFixParts = function(parts) {
        				$http({
        					url: fhirUrl + "/" + relativeUrl,
        					method: "GET",
        					headers: getHeaders(),
        				}).success(function(data) {
        					fixParts(parts, relativeUrl, getCodeableConceptDisplayName(data.code));
        				}).error(function(data, status) {
        					handleHttpError("Get practitioner", data, status);
        				});
        			}
        		} else {
        			description = "Unknown medication";
        		}
        		if (date) {
        			description += " on ";
        			description += getDisplayableDate(date);
        		}
        		return {
        			part: description,
        			asyncFixParts: asyncFixParts
        		}
			}
        	return {
        		part: codeAndDateDescription("medication", medicationOrderOrStatement.medicationCodeableConcept, date),
        		asyncFixParts: null
        	}
		}

        function mapReport(report) {
        	// http://www.hl7.org/implement/standards/fhir/DSTU2/DiagnosticReport.html
        	return codeAndDateDescription("report", report.code, report.effectivePeriod ? report.effectivePeriod.start : report.effectiveDateTime);
        }

        function mapObservation(observation) {
        	// http://www.hl7.org/implement/standards/fhir/DSTU2/Observation.html
        	var description = mapObservationComponent(observation);
        	if (observation.component && observation.component.length > 0) {
        		description += " (";
        		for (var i = 0; i < observation.component.length; i++) {
        			if (i > 0) {
        				description += ", ";
        			}
        			description += mapObservationComponent(observation.component[i]);
				}
        		description += ")";
			}
        	var dateTime = observation.effectivePeriod ? observation.effectivePeriod.start : observation.effectiveDateTime;
        	if (dateTime) {
        		description += " on ";
        		description += getDisplayableDate(dateTime);
        	}
        	return description;
        }

        function mapObservationComponent(observation) {
        	// http://www.hl7.org/implement/standards/fhir/DSTU2/Observation.html
        	var description = getCodeableConceptDisplayName(observation.code) || "Unknown observation";
        	if (observation.valueString) {
        		description += ": " + observation.valueString;
        	} else if (observation.valueCodeableConcept) {
        		description += ": " + getCodeableConceptDisplayName(observation.valueCodeableConcept);
        	} else if (observation.valueQuantity) {
        		description += ": " + observation.valueQuantity.value + " " + (observation.valueQuantity.unit || observation.valueQuantity.code);
        	}
        	return description;
        }

        function mapSmokingStatusObservation(observation) {
        	// http://www.hl7.org/implement/standards/fhir/DSTU2/Observation.html
        	var description = getCodeableConceptDisplayName(observation.valueCodeableConcept);
        	var dateTime = observation.effectivePeriod ? observation.effectivePeriod.start : observation.effectiveDateTime;
        	if (dateTime) {
        		description += " on ";
        		description += getDisplayableDate(dateTime);
        	}
        	return description;
        }

        function mapAllergyIntolerance(allergyIntolerance) {
        	// http://www.hl7.org/fhir/DSTU2/allergyintolerance.html
        	var description = getCodeableConceptDisplayName(allergyIntolerance.substance) || "Unknown allergy";
        	if (allergyIntolerance.onset) {
        		description += " on ";
        		description += getDisplayableDate(allergyIntolerance.onset);
        	}
        	if (allergyIntolerance.reaction) {
        		var reactions = [];
        		for (var i = 0; i < allergyIntolerance.reaction.length; i++) {
        			if (allergyIntolerance.reaction[i].manifestation && allergyIntolerance.reaction[i].manifestation.length > 0) {
        				reactions.push(getCodeableConceptDisplayName(allergyIntolerance.reaction[i].manifestation[0]));
        			}
        		}
        		if (reactions.length > 0) {
        			description += " reaction ";
        			description += reactions.join("");
        		}
			}
        	return description;
        }

        function mapCarePlan(carePlan) {
        	// http://www.fhir.org/guides/argonaut/r2/StructureDefinition-argo-careplan.html
        	var description = carePlan.description || "Unknown care plan";
        	var period = carePlan.period;
        	if (carePlan.period) {
        		if (period.start && !period.end) {
        			description += " on ";
        			description += getDisplayableDate(period.start);
        		} else if (!period.start && period.end) {
        			description += " on ";
        			description += getDisplayableDate(period.end);
        		} else if (period.start && period.end) {
        			description += " from ";
        			description += getDisplayableDate(period.start);
        			description += " to ";
        			description += getDisplayableDate(period.end);
				}
        	}
        	return description;
        }

        function mapCareTeam(careTeam) {
        	// http://www.fhir.org/guides/argonaut/r2/StructureDefinition-argo-careteam.html
        	var descriptions = [];
        	var caregivers = [];
        	var participants = careTeam.participant;
        	if (participants) {
        		for (var i = 0; i < participants.length; i++) {
        			var participant = participants[i];
        			var member = participant.member.display;
        			if (!member) {
        				if (!participant.member.reference) {
        					member = "?";
        				} else {
        					member = participant.member.reference;
        					caregivers.push(participant.member.reference);
        				}
        			}
        			var role = getCodeableConceptDisplayName(participant.role);
        			if (role) {
        				member += " (" + role + ")";
        			}
        			descriptions.push(member);
        		}
        	}
        	return {
        		part: descriptions,
        		asyncFixParts: function(parts) {
        			for (var i = 0; i < caregivers.length; i++) {
        				var relativeUrl = caregivers[i];
        				$http({
        					url: fhirUrl + "/" + relativeUrl,
        					method: "GET",
        					headers: getHeaders(),
        				}).success(function(data) {
        					fixParts(parts, relativeUrl, composeDisplayName(data.name));
        				}).error(function(data, status) {
        					handleHttpError("Get practitioner", data, status);
        				});
					}
        		}
        	}
        }

        function mapDevice(device) {
        	// http://www.hl7.org/fhir/DSTU2/device.html
        	var description = getCodeableConceptDisplayName(device.type) || "Unknown device";
        	if (device.udi) {
        		description += ": ";
        		description += device.udi;
        	}
        	return description;
        }

        function mapGoal(goal) {
        	// http://www.hl7.org/fhir/DSTU2/goal.html
        	var description = goal.description;
        	var targetDate = goal.targetDate || goal.targetDateTime;
        	if (targetDate) {
        		description += " by ";
        		description += getDisplayableDate(targetDate);
        	}
        	return description;
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
            	// http://www.hl7.org/implement/standards/fhir/DSTU2/Bundle.html
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

        function fixParts(parts, toReplace, replacement) {
        	if (replacement) {
        		for (var i = 0; i < parts.length; i++) {
        			if (parts[i].indexOf(toReplace) >= 0) {
        				parts[i] = parts[i].replace(toReplace, replacement);
        				return;
        			}
        		}
        	}
        }

        function getDocumentUrl(documentReference) {
        	if (documentReference.content) {
        		for (var i = 0; i < documentReference.content.length; i++) {
        			var contentAttachment = documentReference.content[i].attachment;
        			if (contentAttachment) {
        				if (contentAttachment.url) {
        					return contentAttachment.url;
        				} else if (contentAttachment.data) {
        					var mimeType = contentAttachment.contentType || "application/octet-stream";
        					return "data:" + mimeType + ";base64," + contentAttachment.data;
        				}
        			}
        		}
        	}
        	return null;
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

        function appendDateSearchParameter(parameters, parameterName, value, operator) {
            var parsedValue = parseDateSearchValue(value);
            if (!parsedValue) {
                return parameters;
            }
            return appendParameter(parameters, parameterName, escapeFhirSearchParameter(parsedValue));
        }

        function appendNumberSearchParameter(parameters, parameterName, value, operator) {
        	if (!value) {
        		return parameters;
        	}
        	return appendParameter(parameters, parameterName, (operator || "") + escapeFhirSearchParameter(value));
        }

        function escapeFhirSearchParameter(value) {
        	// See http://www.hl7.org/implement/standards/fhir/DSTU2/search.html#escaping
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
            var genderDisplayName = getGenderDisplayName(patient.gender);
            var displayAgeOrDeceased = composeDisplayAgeOrDeceased(patient);
            var dateRange = {
            	from: null,
            	to: null,
            };
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
                dateRange: dateRange,
                detailsParts: filterEmptyAndFlatten([
					genderDisplayName,
					displayAgeOrDeceased,
					getBirthSexDisplayName(patient),
					getRaceDisplayName(patient),
					getEthnicityDisplayName(patient),
					getPreferredLanguageDisplayName(patient),
					getLastUpdatedDisplay(patient),
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
									parts: composeDisplayAddressLines(address) || [],
									collapsed: false,
									load: null,
								};
							}),
					!patient.identifier || patient.identifier.length === 0 ?
						null :
						{
						    header: "Identifiers",
						    parts: patient.identifier.map(function (identifier) {
						    	// See http://www.hl7.org/implement/standards/fhir/DSTU2/datatypes.html#identifier
						        return joinNonEmpty(" ", [
									addPrefixSuffixNonEmpty("", (identifier.type ? identifier.type.text : null ) || getIdentifierSystemDisplayName(identifier.system, knownIdentifierSystems), ":"),
									identifier.value,
									addPrefixSuffixNonEmpty("[", identifier.use, "]"),
						        ]);
						    }),
						    collapsed: false,
						    load: null,
						},
					createPatientResourcesPartToLoad(
						"Smoking status", id, dateRange, "Observation", mapSmokingStatusObservation, "code=http://loinc.org|72166-2"
					),
					createPatientResourcesPartToLoad(
						"Encounters", id, dateRange, "Encounter", mapEncounter
					),
					createPatientResourcesPartToLoad(
						"Immunizations", id, dateRange, "Immunization", mapImmunization
					),
					createPatientResourcesPartToLoad(
						"Procedures", id, dateRange, "Procedure", mapProcedure
					),
					createPatientResourcesPartToLoad(
						"Problems", id, dateRange, "Condition", mapCondition, "category=problem"
					),
					createPatientResourcesPartToLoad(
                		"Health concerns", id, dateRange, "Condition", mapCondition, "category=health-concern"
					),
					createPatientResourcesAsyncFixPartToLoad(
						"Medication orders", id, dateRange, "MedicationOrder", mapMedicationOrderOrStatement
					),
					createPatientResourcesAsyncFixPartToLoad(
						"Medication statements", id, dateRange, "MedicationStatement", mapMedicationOrderOrStatement
					),
					createPatientResourcesPartToLoad(
						"Reports", id, dateRange, "DiagnosticReport", mapReport
					),
					createPatientResourcesPartToLoad(
						"Labs", id, dateRange, "Observation", mapObservation, "category=laboratory"
					),
					createPatientResourcesPartToLoad(
						"Vital signs", id, dateRange, "Observation", mapObservation, "category=vital-signs"
					),
					createPatientResourcesPartToLoad(
						"Allergies", id, dateRange, "AllergyIntolerance", mapAllergyIntolerance
					),
					createPatientResourcesPartToLoad(
						"Devices", id, dateRange, "Device", mapDevice
					),
					createPatientResourcesPartToLoad(
						"Care plan", id, dateRange, "CarePlan", mapCarePlan, "category=assess-plan"
					),
					createPatientResourcesAsyncFixPartToLoad(
						"Care team", id, dateRange, "CarePlan", mapCareTeam, "category=careteam"
					),
					createPatientResourcesPartToLoad(
						"Goals", id, dateRange, "Goal", mapGoal
					),
					createPartToLoad(
						"Summary record",
						dateRange,
						function(onSuccess, onComplete) {
							getPatientSummaryDocument(id, dateRange, onSuccess, onComplete)
						}
					)
                ]),
            };
        }

        function createPatientResourcesPartToLoad(header, id, dateRange, resourceType, mapResource, extraParameters ) {
        	return createPartToLoad(
				header,
				dateRange,
				function(onSuccess, onComplete) {
					var processResource = function(parts, resource) {
						var mappedResource = mapResource(resource);
						if (mappedResource) {
							if (angular.isArray(mappedResource)) {
								parts.push.apply(parts, mappedResource);
							} else {
								parts.push(mappedResource);
							}
						}
					}
					getPatientResourcesPrimitive(id, dateRange, resourceType, processResource, onSuccess, onComplete, extraParameters);
				}
			);
   		}

        function createPatientResourcesAsyncFixPartToLoad(header, id, dateRange, resourceType, mapResource, extraParameters) {
        	return createPartToLoad(
				header,
				dateRange,
				function(onSuccess, onComplete) {
					var processResource = function(parts, resource) {
						var mappedResource = mapResource(resource);
						if (mappedResource && mappedResource.part) {
							if (angular.isArray(mappedResource.part)) {
								parts.push.apply(parts, mappedResource.part);
							} else {
								parts.push(mappedResource.part);
							}
							if (mappedResource.asyncFixParts) {
								mappedResource.asyncFixParts(parts);
							}
						}
					}
					getPatientResourcesPrimitive(id, dateRange, resourceType, processResource, onSuccess, onComplete, extraParameters);
				}
			);
        }

        function createPartToLoad(header, dateRange, loadWithOnComplete) {
        	var result = {
        		header: header,
        		parts: [". . ."],
        		collapsed: true,
        		dateRange: dateRange,
				loading: false
        	};
        	result.load = function(onSuccess) {
        		result.loading = true;
        		loadWithOnComplete(onSuccess, function() { result.loading = false; });
        	};
        	return result;
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
        	if (!patient || !patient.name) {
        		return null;
        	}
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

        function getRaceDisplayName(patient) {
        	var raceExtension = getExtension(patient, "http://hl7.org/fhir/StructureDefinition/us-core-race");
        	if (!raceExtension) {
        		return null;
        	}
        	return getCodeableConceptDisplayName(raceExtension.valueCodeableConcept, PDemoConfiguration.raceValues);
        }

        function getEthnicityDisplayName(patient) {
        	var ethnicityExtension = getExtension(patient, "http://hl7.org/fhir/StructureDefinition/us-core-ethnicity");
        	if (!ethnicityExtension) {
        		return null;
        	}
        	return getCodeableConceptDisplayName(ethnicityExtension.valueCodeableConcept, PDemoConfiguration.ethnicityValues);
        }

        function getBirthSexDisplayName(patient) {
        	var birthSexExtension = getExtension(patient, "http://fhir.org/guides/argonaut/StructureDefinition/argo-birthsex");
        	if (!birthSexExtension || !birthSexExtension.valueCode) {
        		return null;
        	}
        	return "Birth sex: " + getGenderDisplayName(birthSexExtension.valueCode);
        }

        function getGenderDisplayName(genderOrSex) {
        	var genderValues = PDemoConfiguration.genderValues;
        	for (var i = 0; i < genderValues.length; i++) {
        		if (genderOrSex === genderValues[i].code) {
        			return genderValues[i].name;
        		}
        	}
        	return genderOrSex;
        }

        function getPreferredLanguageDisplayName(patient) {
        	var communications = patient.communication;
        	if (!communications || communications.length == 0) {
        		return null;
        	}
        	for (var i = 0; i < communications.length; i++) {
        		if (communications[i].preferred) {
        			return getCodeableConceptDisplayName(communications[i].language, null);
        		}
        	}
        	return getCodeableConceptDisplayName(communications[0].language, null);
        }

        function getExtension(resource, url) {
        	if (!resource || !resource.extension) {
        		return null;
        	}
        	for (var i = 0; i<resource.extension.length; i++) {
        		if (resource.extension[i].url === url) {
        			return resource.extension[i];
				}
        	}
        	return null;
        }

        function getLastUpdatedDisplay(resource) {
        	if (!resource || !resource.meta || !resource.meta.lastUpdated) {
        		return null;
        	}
        	return "Last updated on " + parseDateTime(resource.meta.lastUpdated).toLocaleString();
        }

        function getCodeableConceptDisplayName(codeableConcept, standardValues) {
        	// See http://www.hl7.org/implement/standards/fhir/DSTU2/datatypes.html#codeableconcept
        	if (codeableConcept) {
        		var coding = codeableConcept.coding;
        		if (standardValues && coding && coding.length > 0) {
        			for (var i = 0; i < coding.length; i++) {
        				var currentCoding = coding[i];
        				for (var j = 0; j < standardValues.length; j++) {
        					var standardValue = standardValues[j];
        					if (currentCoding.system === standardValue.uri && currentCoding.code === standardValue.code) {
        						return standardValue.name;
        					}
        				}
        			}
        		}
                if (codeableConcept.text) {
                    return firstUppercase(codeableConcept.text);
                }
                if (coding && coding.length > 0) {
                    for (var i = 0; i < coding.length; i++) {
                        if (coding[i].display) {
                            return firstUppercase(coding[i].display);
                        }
                    }
                    return coding[0].code;
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