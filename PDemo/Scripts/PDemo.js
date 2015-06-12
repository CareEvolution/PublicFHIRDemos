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
                var patientLink = patient.selfLink;
                doGetPatient(patientLink, function (patient) {
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

        /**
        {"resourceType":"Bundle","title":"Encounter search","id":"urn:uuid:91668def-9570-4b9c-90b3-dde8ff6d964e",
        "updated":"2015-06-12T02:15:47.7554648+00:00","author":[{"name":"CareEvolution","uri":"http://careevolution.com"}],
        "totalResults":"2","link":[{"rel":"fhir-base","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir"},
        {"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Encounter?_query=847c51ce-681f-40ae-969c-d2e93924f1b2&_start=1"}],
        "entry":[{"title":"Encounter with id d0db1dc3-6a10-e511-8293-0050b664cec5",
        "id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Encounter/d0db1dc3-6a10-e511-8293-0050b664cec5",
        "updated":"2015-06-11T18:50:44.64+00:00","link":[{"rel":
        "self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Encounter/d0db1dc3-6a10-e511-8293-0050b664cec5"}],
        "content":{"resourceType":"Encounter","id":"d0db1dc3-6a10-e511-8293-0050b664cec5",
        "identifier":[{"use":"official","value":"DefaultNameSpaceCode_3/20/201"}],
        "class":"outpatient","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},
        "period":{"start":"2014-03-20T00:00:00-04:00"},"location":[{"location":{"reference":"Location/cedb1dc3-6a10-e511-8293-0050b664cec5"},
        "period":{"start":"2014-03-20T00:00:00-04:00"}}]}},
        {"title":"'Admitted on 3/20/2014 12:00:00 AM' encounter from 3/20/2014 12:00:00 AM -04:00 to 
        ","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Encounter/cfdb1dc3-6a10-e511-8293-0050b664cec5",
        "updated":"2015-06-11T18:50:44.637+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Encounter/cfdb1dc3-6a10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Encounter","id":"cfdb1dc3-6a10-e511-8293-0050b664cec5","identifier":[{"use":"official","value":"f4d23703-19d5-e311-bead-b8763fa85218"}],"class":"outpatient","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},"period":{"start":"2014-03-20T00:00:00-04:00"}}}]}
        **/
        function getEncounters(patientSelfLink, onSuccess) {
            var searchUrl = fhirUrl + "/Encounter?subject=" + patientSelfLink.substring(fhirUrl.length, patientSelfLink.length);
            $http({
                url: searchUrl,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
                var parts = data.entry.map(function (encounter) {
                    if (encounter.content.period) {
                        var part = "Admitted on " + parseDateTime(encounter.content.period.start).toLocaleDateString();
                        if (encounter.content.period.end) {
                            part += " and discharged on " + parseDateTime(encounter.content.period.end).toLocaleDateString();
                        }
                        return part;
                    } else {
                        return "Encounter - Unknown dates.";
                    }

                });
                onSuccess(parts);
            }).error(function (data, status) {
                handleHttpError("GetEncounters", data, status);
            });
        };

        function getConditions(patientSelfLink, onSuccess) {
            var searchUrl = fhirUrl + "/Condition?subject=" + patientSelfLink.substring(fhirUrl.length, patientSelfLink.length);
            $http({
                url: searchUrl,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
                var parts = data.entry.map(function (condition) {
                    return getCodeableConceptDisplayName(condition.content.code) + " " + parseDateTime(condition.content.dateAsserted).toLocaleDateString();
                });
                onSuccess(parts);
            }).error(function (data, status) {
                handleHttpError("GetConditions", data, status);
            });
        };

        /***
        {"resourceType":"Bundle","title":"Procedure search","id":"urn:uuid:a3ea3235-d0a3-416e-8c3f-fe303f1c79d0","updated":"2015-06-12T01:20:20.369228+00:00",
        "author":[{"name":"CareEvolution","uri":"http://careevolution.com"}],
        "totalResults":"51","link":[{"rel":"fhir-base","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir"},
        {"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure?_query=f43cce87-e436-4d32-ba1c-1e206f773520&_start=1"},
        {"rel":"first","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure?_query=f43cce87-e436-4d32-ba1c-1e206f773520&_start=1"},
        {"rel":"next","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure?_query=f43cce87-e436-4d32-ba1c-1e206f773520&_start=21"}],
        "entry":[{"title":"Primary Diagnosis on 6/10/2015 12:00:00 AM -04:00",
        "id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/72a8a6af-5c10-e511-8293-0050b664cec5",
        "updated":"2015-06-11T17:10:02.683+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/72a8a6af-5c10-e511-8293-0050b664cec5"}],
        "content":{"resourceType":"Procedure","id":"72a8a6af-5c10-e511-8293-0050b664cec5",
        "subject":{"reference":"Patient/61a8a6af-5c10-e511-8293-0050b664cec5"},
        "type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode",
        "code":"283","display":"TONSILLECTOMY/ADENOIDEC","primary":true}],"text":"TONSILLECTOMY/ADENOIDEC"},
        "date":{"start":"2015-06-10T00:00:00-04:00","end":"2015-06-10T00:00:00-04:00"},"encounter":{"reference":"Encounter/65a8a6af-5c10-e511-8293-0050b664cec5"}}},
        {"title":"Primary Diagnosis on 6/3/2015 12:00:00 AM -04:00",
        "id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/74a8a6af-5c10-e511-8293-0050b664cec5",
        "updated":"2015-06-11T17:10:02.687+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/74a8a6af-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"74a8a6af-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/61a8a6af-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"99244","display":"E/M CONSULT OFFICE CONSULT LEVEL 4","primary":true}],"text":"E/M CONSULT OFFICE CONSULT LEVEL 4"},"date":{"start":"2015-06-03T00:00:00-04:00","end":"2015-06-03T00:00:00-04:00"},"encounter":{"reference":"Encounter/67a8a6af-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 5/7/2015 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/71a8a6af-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:10:02.68+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/71a8a6af-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"71a8a6af-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/61a8a6af-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"99213","display":"E/M OFFICE/OP SERV EST PATIENT LEVEL 3","primary":true}],"text":"E/M OFFICE/OP SERV EST PATIENT LEVEL 3"},"date":{"start":"2015-05-07T00:00:00-04:00","end":"2015-05-07T00:00:00-04:00"},"encounter":{"reference":"Encounter/64a8a6af-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 4/25/2015 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/366346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.71+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/366346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"366346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"24650","display":"TREAT CLOS RAD HEAD/NECK FX W/O MANIPULA","primary":true}],"text":"TREAT CLOS RAD HEAD/NECK FX W/O MANIPULA"},"date":{"start":"2015-04-25T00:00:00-04:00","end":"2015-04-25T00:00:00-04:00"},"encounter":{"reference":"Encounter/cd6246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 4/9/2015 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/70a8a6af-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:10:02.68+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/70a8a6af-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"70a8a6af-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/61a8a6af-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"99213","display":"E/M OFFICE/OP SERV EST PATIENT LEVEL 3","primary":true}],"text":"E/M OFFICE/OP SERV EST PATIENT LEVEL 3"},"date":{"start":"2015-04-09T00:00:00-04:00","end":"2015-04-09T00:00:00-04:00"},"encounter":{"reference":"Encounter/63a8a6af-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 2/22/2015 12:00:00 AM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/73a8a6af-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:10:02.683+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/73a8a6af-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"73a8a6af-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/61a8a6af-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"99212","display":"E/M OFFICE/OP SERV EST PATIENT LEVEL 2","primary":true}],"text":"E/M OFFICE/OP SERV EST PATIENT LEVEL 2"},"date":{"start":"2015-02-22T00:00:00-05:00","end":"2015-02-22T00:00:00-05:00"},"encounter":{"reference":"Encounter/66a8a6af-5c10-e511-8293-0050b664cec5"}}},{"title":"Procedure with id 41dc1dc3-6a10-e511-8293-0050b664cec5","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/41dc1dc3-6a10-e511-8293-0050b664cec5","updated":"2015-06-11T18:50:53.417+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/41dc1dc3-6a10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"41dc1dc3-6a10-e511-8293-0050b664cec5","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"24650","display":"TREAT CLOS RAD HEAD/NECK FX W/O MANIPULA","primary":true}],"text":"TREAT CLOS RAD HEAD/NECK FX W/O MANIPULA"},"date":{"start":"2014-03-20T00:00:00-04:00","end":"2014-03-20T00:00:00-04:00"},"encounter":{"reference":"Encounter/d0db1dc3-6a10-e511-8293-0050b664cec5"},"notes":"TREAT CLOS RAD HEAD/NECK FX W/O MANIPULA"}},{"title":"Primary Diagnosis on 6/6/2013 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/326346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.703+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/326346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"326346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"T1002","display":"RN SERVICES  UP TO 15 MINUTES","primary":true}],"text":"RN SERVICES  UP TO 15 MINUTES"},"date":{"start":"2013-06-06T00:00:00-04:00","end":"2013-06-06T00:00:00-04:00"},"encounter":{"reference":"Encounter/c96246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 6/2/2013 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/316346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.703+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/316346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"316346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"73080","display":"RADIO EXAM ELBOW COMP MINIMUM THREE VIEW","primary":true}],"text":"RADIO EXAM ELBOW COMP MINIMUM THREE VIEW"},"date":{"start":"2013-06-02T00:00:00-04:00","end":"2013-06-02T00:00:00-04:00"},"encounter":{"reference":"Encounter/c86246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 5/19/2013 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/356346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.71+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/356346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"356346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"73080","display":"RADIO EXAM ELBOW COMP MINIMUM THREE VIEW","primary":true}],"text":"RADIO EXAM ELBOW COMP MINIMUM THREE VIEW"},"date":{"start":"2013-05-19T00:00:00-04:00","end":"2013-05-19T00:00:00-04:00"},"encounter":{"reference":"Encounter/cc6246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 5/13/2013 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/61d5d19f-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:34.42+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/61d5d19f-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"61d5d19f-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/23c87993-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"12345","display":"Aortic Valve Replacement","primary":true}],"text":"Aortic Valve Replacement"},"date":{"start":"2013-05-13T00:00:00-04:00","end":"2013-05-13T00:00:00-04:00"},"encounter":{"reference":"Encounter/31c87993-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 5/8/2013 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/336346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.707+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/336346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"336346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"73080","display":"RADIO EXAM ELBOW COMP MINIMUM THREE VIEW","primary":true}],"text":"RADIO EXAM ELBOW COMP MINIMUM THREE VIEW"},"date":{"start":"2013-05-08T00:00:00-04:00","end":"2013-05-08T00:00:00-04:00"},"encounter":{"reference":"Encounter/ca6246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 2/7/2013 12:00:00 AM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/306346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.7+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/306346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"306346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"92004","display":"OPHTHALMOLOGICAL SVC COMPREHENS NEW PT","primary":true}],"text":"OPHTHALMOLOGICAL SVC COMPREHENS NEW PT"},"date":{"start":"2013-02-07T00:00:00-05:00","end":"2013-02-07T00:00:00-05:00"},"encounter":{"reference":"Encounter/c76246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 8/12/2012 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/62d5d19f-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:34.423+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/62d5d19f-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"62d5d19f-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/23c87993-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"94150","display":"VITAL CAPACITY TOTAL","primary":true}],"text":"VITAL CAPACITY TOTAL"},"date":{"start":"2012-08-12T00:00:00-04:00","end":"2012-08-12T00:00:00-04:00"},"encounter":{"reference":"Encounter/30c87993-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 8/10/2012 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/346346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.71+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/346346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"346346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"94150","display":"VITAL CAPACITY TOTAL","primary":true}],"text":"VITAL CAPACITY TOTAL"},"date":{"start":"2012-08-10T00:00:00-04:00","end":"2012-08-10T00:00:00-04:00"},"encounter":{"reference":"Encounter/cb6246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 7/28/2012 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/2e6346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.697+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/2e6346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"2e6346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"99214","display":"E/M OFFICE/OP SERV EST PATIENT LEVEL 4","primary":true}],"text":"E/M OFFICE/OP SERV EST PATIENT LEVEL 4"},"date":{"start":"2012-07-28T00:00:00-04:00","end":"2012-07-28T00:00:00-04:00"},"encounter":{"reference":"Encounter/c56246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary on 7/15/2012 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/5cd5d19f-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:34.407+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/5cd5d19f-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"5cd5d19f-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/23c87993-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"T1015","display":"CLINIC VISIT/ENCOUNTER","primary":true}],"text":"CLINIC VISIT/ENCOUNTER"},"date":{"start":"2012-07-15T00:00:00-04:00","end":"2012-07-15T00:00:00-04:00"},"encounter":{"reference":"Encounter/2fc87993-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary on 7/13/2012 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/2f6346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.7+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/2f6346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"2f6346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"T1015","display":"CLINIC VISIT/ENCOUNTER","primary":true}],"text":"CLINIC VISIT/ENCOUNTER"},"date":{"start":"2012-07-13T00:00:00-04:00","end":"2012-07-13T00:00:00-04:00"},"encounter":{"reference":"Encounter/c66246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 7/13/2012 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/2d6346a6-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:51.697+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/2d6346a6-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"2d6346a6-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/c36246a6-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"94760","display":"NONINVASIVE EAR PULSE OXIMETRY O2 SAT SI","primary":true}],"text":"NONINVASIVE EAR PULSE OXIMETRY O2 SAT SI"},"date":{"start":"2012-07-13T00:00:00-04:00","end":"2012-07-13T00:00:00-04:00"},"encounter":{"reference":"Encounter/c46246a6-5c10-e511-8293-0050b664cec5"}}},{"title":"Primary Diagnosis on 5/1/2012 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/5fd5d19f-5c10-e511-8293-0050b664cec5","updated":"2015-06-11T17:09:34.413+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Procedure/5fd5d19f-5c10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Procedure","id":"5fd5d19f-5c10-e511-8293-0050b664cec5","subject":{"reference":"Patient/23c87993-5c10-e511-8293-0050b664cec5"},"type":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DemoNamespace/ProcedureCode","code":"T1002","display":"RN SERVICES  UP TO 15 MINUTES","primary":true}],"text":"RN SERVICES  UP TO 15 MINUTES"},"date":{"start":"2012-05-01T00:00:00-04:00","end":"2012-05-01T00:00:00-04:00"},"encounter":{"reference":"Encounter/2ec87993-5c10-e511-8293-0050b664cec5"}}}]}
        **/
        function getProcedures(patientSelfLink, onSuccess) {
            var searchUrl = fhirUrl + "/Procedure?subject=" + patientSelfLink.substring(fhirUrl.length, patientSelfLink.length);
            $http({
                url: searchUrl,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
                var parts = data.entry.map(function (procedure) {
                    return getCodeableConceptDisplayName(procedure.content.type) + " " + parseDateTime(procedure.content.date.start).toLocaleDateString();
                });
                onSuccess(parts);
            }).error(function (data, status) {
                handleHttpError("getProcedures", data, status);
            });
        };

        /**
        {"resourceType":"Bundle","title":"Immunization search","id":"urn:uuid:6ddb2929-aa77-4bfc-8112-2645928a32fa",
        "updated":"2015-06-12T01:40:00.4916463+00:00","author":[{"name":"CareEvolution","uri":"http://careevolution.com"}],
        "totalResults":"5","link":[{"rel":"fhir-base","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir"},
        {"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization?_query=23d8effb-5cbb-4509-a077-e435626da390&_start=1"}],
        "entry":[{"title":"H PAPILLOMA VACC 3 DOSE IM GARDASIL on 7/23/2013 12:00:00 AM -04:00",
        "id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e0db1dc3-6a10-e511-8293-0050b664cec5",
        "updated":"2015-06-11T18:50:48.367+00:00","link":[{"rel":"self",
        "href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e0db1dc3-6a10-e511-8293-0050b664cec5"}],
        "content":{"resourceType":"Immunization","id":"e0db1dc3-6a10-e511-8293-0050b664cec5","date":"7/23/2013 12:00:00 AM -04:00","vaccineType":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.59","code":"62","display":"H PAPILLOMA VACC 3 DOSE IM GARDASIL","primary":true}],"text":"H PAPILLOMA VACC 3 DOSE IM GARDASIL"},"subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},"refusedIndicator":true,"doseQuantity":{"value":-1.0000000000,"units":"No dosage units provided","system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/MedicationAdministrationDoseUnits","code":"NotProvided"}}},{"title":"TDAP VACCINE >7  BOOSTRIX IM on 7/23/2013 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e1db1dc3-6a10-e511-8293-0050b664cec5","updated":"2015-06-11T18:50:48.377+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e1db1dc3-6a10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Immunization","id":"e1db1dc3-6a10-e511-8293-0050b664cec5","date":"7/23/2013 12:00:00 AM -04:00","vaccineType":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.59","code":"115","display":"TDAP VACCINE >7  BOOSTRIX IM","primary":true}],"text":"TDAP VACCINE >7  BOOSTRIX IM"},"subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},"refusedIndicator":true,"doseQuantity":{"value":-1.0000000000,"units":"No dosage units provided","system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/MedicationAdministrationDoseUnits","code":"NotProvided"}}},{"title":"MENINGOCOCCAL VACCINE, SC on 7/23/2013 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e2db1dc3-6a10-e511-8293-0050b664cec5","updated":"2015-06-11T18:50:48.4+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e2db1dc3-6a10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Immunization","id":"e2db1dc3-6a10-e511-8293-0050b664cec5","date":"7/23/2013 12:00:00 AM -04:00","vaccineType":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.59","code":"32","display":"MENINGOCOCCAL VACCINE, SC","primary":true}],"text":"MENINGOCOCCAL VACCINE, SC"},"subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},"refusedIndicator":true,"doseQuantity":{"value":-1.0000000000,"units":"No dosage units provided","system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/MedicationAdministrationDoseUnits","code":"NotProvided"}}},{"title":"IMMUNIZATION ADMIN on 7/23/2013 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e3db1dc3-6a10-e511-8293-0050b664cec5","updated":"2015-06-11T18:50:48.423+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e3db1dc3-6a10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Immunization","id":"e3db1dc3-6a10-e511-8293-0050b664cec5","date":"7/23/2013 12:00:00 AM -04:00","vaccineType":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.59","code":"90471","display":"IMMUNIZATION ADMIN","primary":true}],"text":"IMMUNIZATION ADMIN"},"subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},"refusedIndicator":true,"doseQuantity":{"value":-1.0000000000,"units":"No dosage units provided","system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/MedicationAdministrationDoseUnits","code":"NotProvided"}}},{"title":"IMMUNIZATION ADMIN, EACH ADD on 7/23/2013 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e4db1dc3-6a10-e511-8293-0050b664cec5","updated":"2015-06-11T18:50:48.433+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Immunization/e4db1dc3-6a10-e511-8293-0050b664cec5"}],"content":{"resourceType":"Immunization","id":"e4db1dc3-6a10-e511-8293-0050b664cec5","date":"7/23/2013 12:00:00 AM -04:00","vaccineType":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.59","code":"90472","display":"IMMUNIZATION ADMIN, EACH ADD","primary":true}],"text":"IMMUNIZATION ADMIN, EACH ADD"},"subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},"refusedIndicator":true,"doseQuantity":{"value":-1.0000000000,"units":"No dosage units provided","system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/MedicationAdministrationDoseUnits","code":"NotProvided"}}}]}
        **/
        function getImmunizations(patientSelfLink, onSuccess) {
            var searchUrl = fhirUrl + "/Immunization?subject=" + patientSelfLink.substring(fhirUrl.length, patientSelfLink.length);
            $http({
                url: searchUrl,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
                var parts = data.entry.map(function (immunization) {
                    return getCodeableConceptDisplayName(immunization.content.vaccineType) + " " + parseDateTime(immunization.content.date).toLocaleDateString();
                });
                onSuccess(parts);
            }).error(function (data, status) {
                handleHttpError("getImmunizations", data, status);
            });
        };

        /**
        {"resourceType":"Bundle","title":"MedicationPrescription search","id":"urn:uuid:12b16617-7cf6-4391-abe8-bc36a44123a2",
        "updated":"2015-06-12T01:46:06.8212122+00:00","author":[{"name":"CareEvolution","uri":"http://careevolution.com"}],
        "totalResults":"1","link":[{"rel":"fhir-base","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir"},
        {"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/MedicationPrescription?_query=5487a967-914a-4d64-8f0a-041c4485c0c2&_start=1"}],
        "entry":[{"title":"Motrin: on 3/26/2014 12:00:00 AM -04:00",
        "id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/MedicationPrescription/d3db1dc3-6a10-e511-8293-0050b664cec5",
        "updated":"2015-06-11T18:50:45+00:00","link":[{"rel":"self",
        "href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/MedicationPrescription/d3db1dc3-6a10-e511-8293-0050b664cec5"}],
        "content":{"resourceType":"MedicationPrescription","id":"d3db1dc3-6a10-e511-8293-0050b664cec5",
        "contained":[{"resourceType":"Medication","id":"18","name":"Motrin:","code":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.88",
        "code":"197806","display":"Motrin:","primary":true}],"text":"Motrin:"}}],
        "identifier":[{"use":"usual","label":"Placer Order Number",
        "system":"http://careevolution.com/identifiers/04aae852-c30d-4781-9eb8-a274592fff86/CareEvolution/MRN",
        "value":"1368426"}],"dateWritten":"2014-03-26T00:00:00-04:00","status":"completed",
        "patient":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},
        "prescriber":{"reference":"Practitioner/c6db1dc3-6a10-e511-8293-0050b664cec5"},
        "medication":{"reference":"18"},
        "dosageInstruction":[{"text":"Motrin:  1 tablet by Oral route every 6-8 hours PRN Give one tablet with food Dispense: 60 tab(s) With: 1 refill(s)","timingSchedule":{"event":[{"start":"2014-03-26T00:00:00-04:00","end":"9999-12-31T23:59:59+00:00"}]},"asNeededBoolean":false,"doseQuantity":{"value":-1.0000000000,"units":"No dosage units provided","system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/OrderDoseUnits","code":"NotProvided"}}],"dispense":{"medication":{"reference":"Medication/18"}}}}]}**/
        function getMedicationPrescriptions(patientSelfLink, onSuccess) {
            var searchUrl = fhirUrl + "/MedicationPrescription?patient=" + patientSelfLink.substring(fhirUrl.length, patientSelfLink.length);
            $http({
                url: searchUrl,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
                var parts = data.entry.map(function (medicationPrescription) {
                    return getCodeableConceptDisplayName(medicationPrescription.content.contained[0].code) + " " + parseDateTime(medicationPrescription.content.dateWritten).toLocaleDateString();
                });
                onSuccess(parts);
            }).error(function (data, status) {
                handleHttpError("getMedicationPrescriptions", data, status);
            });
        };

        /**
        {"resourceType":"Bundle","title":"DiagnosticReport 
        search","id":"urn:uuid:eea08a82-fa56-4c65-8ee9-f6112da2e265","updated":"2015-06-12T02:07:53.349335+00:00",
        "author":[{"name":"CareEvolution","uri":"http://careevolution.com"}],"totalResults":"2",
        "link":[{"rel":"fhir-base","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir"},
        {"rel":"self",
        "href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/DiagnosticReport?_query=eaba4360-f2d3-4fb6-8296-6bdf3b7f4674&_start=1"}],
        "entry":[{"title":"Lipid panel, Fasting  on 3/28/2014 12:00:00 AM -04:00",
        "id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/DiagnosticReport/4_e5db1dc36a10e51182930050b664cec5",
        "updated":"2015-06-11T18:50:49.333+00:00","link":[{"rel":"self",
        "href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/DiagnosticReport/4_e5db1dc36a10e51182930050b664cec5"}],
        "content":{"resourceType":"DiagnosticReport","id":"4_e5db1dc36a10e51182930050b664cec5",
        "name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.12","code":"80061","display":"Lipid panel, Fasting ","primary":true}],
        "text":"Lipid panel, Fasting "},"status":"partial","issued":"2014-03-28T00:00:00-04:00",
        "subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},
        "diagnosticDateTime":"2014-03-28T00:00:00-04:00",
        "result":[{"reference":"Observation/2_e7db1dc36a10e51182930050b664cec5"}]}},{"title":"CBC with diff on 3/28/2014 12:00:00 AM -04:00",
        "id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/DiagnosticReport/4_e6db1dc36a10e51182930050b664cec5",
        "updated":"2015-06-11T18:50:49.34+00:00","link":[{"rel":"self",
        "href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/DiagnosticReport/4_e6db1dc36a10e51182930050b664cec5"}],
        "content":{"resourceType":"DiagnosticReport","id":"4_e6db1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.12","code":"85025","display":"CBC with diff","primary":true}],"text":"CBC with diff"},"status":"partial","issued":"2014-03-28T00:00:00-04:00","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"},"diagnosticDateTime":"2014-03-28T00:00:00-04:00","result":[{"reference":"Observation/2_e8db1dc36a10e51182930050b664cec5"}]}}]}
        **/
        function getReports(patientSelfLink, onSuccess) {
            var searchUrl = fhirUrl + "/DiagnosticReport?subject=" + patientSelfLink.substring(fhirUrl.length, patientSelfLink.length);
            $http({
                url: searchUrl,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
                var parts = data.entry.map(function (report) {
                    return getCodeableConceptDisplayName(report.content.name) + " " + parseDateTime(report.content.diagnosticDateTime).toLocaleDateString();
                });
                onSuccess(parts);
            }).error(function (data, status) {
                handleHttpError("getReports", data, status);
            });
        };

        /**
        {"resourceType":"Bundle","title":"Observation search","id":"urn:uuid:d07a4bce-bc34-4f5a-9ae7-296e78b66630",
        "updated":"2015-06-12T02:35:57.1973011+00:00","author":[{"name":"CareEvolution","uri":"http://careevolution.com"}],
        "totalResults":"66","link":[{"rel":"fhir-base","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir"},
        {"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation?_query=47799f17-7db9-4026-a2bd-e8758cf77e80&_start=1"},
        {"rel":"first","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation?_query=47799f17-7db9-4026-a2bd-e8758cf77e80&_start=1"},
        {"rel":"next","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation?_query=47799f17-7db9-4026-a2bd-e8758cf77e80&_start=21"}],
        "entry":[{"title":"CBC with diff - CBC with diff (LABCORP)\r\nNote: Documents are attached to this order that cannot be displayed here. 
        on 3/28/2014 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/2_e8db1dc36a10e51182930050b664cec5",
        "updated":"2015-06-11T18:50:50.077+00:00",
        "link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/2_e8db1dc36a10e51182930050b664cec5"}],
        "content":{"resourceType":"Observation","id":"2_e8db1dc36a10e51182930050b664cec5",
        "name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"85025","display":
        "CBC with diff - CBC with diff (LABCORP)\r\nNote: Documents are attached to this order that cannot be displayed here.","primary":true}],
        "text":"CBC with diff - CBC with diff (LABCORP)\r\nNote: Documents are attached to this order that cannot be displayed here."},
        "valueString":"March 28, 2014","appliesDateTime":"2014-03-28T00:00:00-04:00","issued":"2014-03-28T00:00:00-04:00","status":"final","reliability":
        "ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},
        {"title":"Lipid panel, Fasting  - LIPID PROFILE-CARDIAC RIS\r\nNote: Documents are attached to this order that cannot be displayed here. on 3/28/2014 12:00:00 AM -04:00",
        "id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/2_e7db1dc36a10e51182930050b664cec5",
        "updated":"2015-06-11T18:50:50.07+00:00",
        "link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/2_e7db1dc36a10e51182930050b664cec5"}],
        "content":{"resourceType":"Observation","id":"2_e7db1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"80061","display":"Lipid panel, Fasting  - LIPID PROFILE-CARDIAC RIS\r\nNote: Documents are attached to this order that cannot be displayed here.","primary":true}],"text":"Lipid panel, Fasting  - LIPID PROFILE-CARDIAC RIS\r\nNote: Documents are attached to this order that cannot be displayed here."},"valueString":"March 28, 2014","appliesDateTime":"2014-03-28T00:00:00-04:00","issued":"2014-03-28T00:00:00-04:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Systolic BP on 3/18/2014 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_01dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.887+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_01dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_01dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.96","code":"271649006","display":"Systolic BP","primary":true}],"text":"Systolic BP"},"valueQuantity":{"value":110.0,"units":"mm[Hg]","system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/ObservationUnits","code":"mm[Hg]"},"appliesDateTime":"2014-03-18T00:00:00-04:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Diastolic BP on 3/18/2014 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_02dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.89+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_02dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_02dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.96","code":"271650006","display":"Diastolic BP","primary":true}],"text":"Diastolic BP"},"valueQuantity":{"value":70.0,"units":"mm[Hg]","system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/ObservationUnits","code":"mm[Hg]"},"appliesDateTime":"2014-03-18T00:00:00-04:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Body mass index on 3/18/2014 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_03dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.89+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_03dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_03dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.96","code":"60621009","display":"Body mass index","primary":true}],"text":"Body mass index"},"valueQuantity":{"value":34.5,"units":"kg/m2","system":"http://unitsofmeasure.org","code":"kg/m2"},"appliesDateTime":"2014-03-18T00:00:00-04:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Heart Rate on 3/18/2014 12:00:00 AM -04:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_04dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.893+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_04dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_04dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.96","code":"364075005","display":"Heart Rate","primary":true}],"text":"Heart Rate"},"valueQuantity":{"value":84.0,"units":"/min","system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/ObservationUnits","code":"/min"},"appliesDateTime":"2014-03-18T00:00:00-04:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Father's Education Level on 2/19/2014 3:02:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_2ddc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.973+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_2ddc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_2ddc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"67578-5","display":"Father's Education Level","primary":true}],"text":"Father's Education Level"},"valueQuantity":{"value":8.0},"appliesDateTime":"2014-02-19T15:02:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Household Income on 2/19/2014 3:02:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_2edc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.973+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_2edc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_2edc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"67578-555","display":"Household Income","primary":true}],"text":"Household Income"},"valueString":"$100,000-$149,999","appliesDateTime":"2014-02-19T15:02:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Mother's Education Level on 2/19/2014 3:01:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_2fdc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.977+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_2fdc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_2fdc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"67577-7","display":"Mother's Education Level","primary":true}],"text":"Mother's Education Level"},"valueQuantity":{"value":8.0},"appliesDateTime":"2014-02-19T15:01:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Hours of sleep per night on 2/19/2014 2:59:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_30dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.98+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_30dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_30dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.96","code":"248256006","display":"Hours of sleep per night","primary":true}],"text":"Hours of sleep per night"},"valueString":"Hours of sleep per night","appliesDateTime":"2014-02-19T14:59:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Patient's Education Level on 2/19/2014 2:59:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_31dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.98+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_31dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_31dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/ObservationType","code":"Patient's Education Level","display":"Patient's Education Level","primary":true}],"text":"Patient's Education Level"},"valueQuantity":{"value":0.0},"appliesDateTime":"2014-02-19T14:59:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Screen- Time (video games and computer games) Weekdays on 2/19/2014 2:52:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_32dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.98+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_32dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_32dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"INV890","display":"Screen- Time (video games and computer games) Weekdays","primary":true}],"text":"Screen- Time (video games and computer games) Weekdays"},"valueQuantity":{"value":1.0},"appliesDateTime":"2014-02-19T14:52:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Screen- Time (video games and computer games) Weekends on 2/19/2014 2:52:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_33dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.983+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_33dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_33dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"INV891","display":"Screen- Time (video games and computer games) Weekends","primary":true}],"text":"Screen- Time (video games and computer games) Weekends"},"valueQuantity":{"value":2.0},"appliesDateTime":"2014-02-19T14:52:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Bedtime on 2/19/2014 2:52:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_34dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.987+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_34dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_34dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"65551-4","display":"Bedtime","primary":true}],"text":"Bedtime"},"valueString":"21:00","appliesDateTime":"2014-02-19T14:52:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Screen- Time (TV/DVDs) Weekdays on 2/19/2014 2:28:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_35dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.987+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_35dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_35dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"INV888","display":"Screen- Time (TV/DVDs) Weekdays","primary":true}],"text":"Screen- Time (TV/DVDs) Weekdays"},"valueQuantity":{"value":3.0},"appliesDateTime":"2014-02-19T14:28:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Screen- Time (TV/DVDs) Weekends on 2/19/2014 2:28:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_36dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.99+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_36dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_36dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.1","code":"INV889","display":"Screen- Time (TV/DVDs) Weekends","primary":true}],"text":"Screen- Time (TV/DVDs) Weekends"},"valueQuantity":{"value":4.0},"appliesDateTime":"2014-02-19T14:28:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Exercise History on 2/19/2014 2:27:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_37dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.99+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_37dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_37dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/ObservationType","code":"Exercise History","display":"Exercise History","primary":true}],"text":"Exercise History"},"valueString":"Exercise Below Recommended Level","appliesDateTime":"2014-02-19T14:27:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Frequency of Physical Activity on 2/19/2014 2:26:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_38dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.993+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_38dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_38dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"http://careevolution.com/namespaces/04aae852-c30d-4781-9eb8-a274592fff86/DefaultNameSpaceCode/ObservationType","code":"Frequency of Physical Activity","display":"Frequency of Physical Activity","primary":true}],"text":"Frequency of Physical Activity"},"valueQuantity":{"value":5.0},"appliesDateTime":"2014-02-19T14:26:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Frequency of Fruit intake on 2/19/2014 2:25:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_39dc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.993+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_39dc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_39dc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.96","code":"229799001","display":"Frequency of Fruit intake","primary":true}],"text":"Frequency of Fruit intake"},"valueString":"Frequency of Fruit intake","appliesDateTime":"2014-02-19T14:25:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}},{"title":"Frequency of 100% Fruit Juice Intake on 2/19/2014 2:25:00 PM -05:00","id":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_3adc1dc36a10e51182930050b664cec5","updated":"2015-06-11T18:50:52.997+00:00","link":[{"rel":"self","href":"http://localhost/WebClientTest.Adapter1.WebClient/api/fhir/Observation/1_3adc1dc36a10e51182930050b664cec5"}],"content":{"resourceType":"Observation","id":"1_3adc1dc36a10e51182930050b664cec5","name":{"coding":[{"system":"urn:oid:2.16.840.1.113883.6.96","code":"229797004","display":"Frequency of 100% Fruit Juice Intake","primary":true}],"text":"Frequency of 100% Fruit Juice Intake"},"valueString":"Frequency of 100% Fruit Juice Intake","appliesDateTime":"2014-02-19T14:25:00-05:00","status":"final","reliability":"ok","subject":{"reference":"Patient/ccdb1dc3-6a10-e511-8293-0050b664cec5"}}}]}
        **/
        function getObservations(patientSelfLink, onSuccess) {
            var searchUrl = fhirUrl + "/Observation?subject=" + patientSelfLink.substring(fhirUrl.length, patientSelfLink.length);
            $http({
                url: searchUrl,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
                var parts = data.entry.map(function (observation) {
                    return getCodeableConceptDisplayName(observation.content.name) + " " + parseDateTime(observation.content.appliesDateTime).toLocaleDateString();
                });
                onSuccess(parts);
            }).error(function (data, status) {
                handleHttpError("getObservations", data, status);
            });
        };

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
                        var patient = createPatient(entry.content, getSelfLink(entry), knownIdentifierSystem);
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

        function doGetPatient(url, onSuccess) {
            $http({
                url: url,
                method: "GET",
                headers: getHeaders(),
            }).success(function (data) {
                var patient = createPatient(data, url, computeKnownIdentifierSystems());
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

        function createPatient(patient, selfLink, knownIdentifierSystems) {
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
								header: joinNonEmpty(" - ",["Address",address.use]),
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
							getEncounters(selfLink, onSuccess);
						},
					},
					{
						header: "Immunizations",
						parts: [". . ."],
						collapsed: true,
						load: function (onSuccess) {
						   getImmunizations(selfLink, onSuccess);
						},
					},
					{
						header: "Procedures",
						parts: [". . ."],
						collapsed: true,
						load: function (onSuccess) {
							getProcedures(selfLink, onSuccess);
						},
					},
					{
						header: "Conditions",
						parts: [". . ."],
						collapsed: true,
						load: function (onSuccess) {
							getConditions(selfLink, onSuccess);
						},
					},
					{
						header: "Medication prescriptions",
						parts: [". . ."],
						collapsed: true,
						load: function (onSuccess) {
							getMedicationPrescriptions(selfLink, onSuccess);
						},
					},
					{
						header: "Reports",
						parts: [". . ."],
						collapsed: true,
						load: function (onSuccess) {
							getReports(selfLink, onSuccess);
						},
					},
					{
						header: "Observations",
						parts: [". . ."],
						collapsed: true,
						load: function (onSuccess) {
							getObservations(selfLink, onSuccess);
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