/* 
 * Copyright (c) 2017, CareEvolution Inc (info@careevolution.com)
 * 
 * This file is licensed under the MIT License - see License.txt
 */

/* global angular */
/* global CommunicatorConfiguration */

(function () {
    if (!CommunicatorConfiguration) {
        throw "CommunicatorConfiguration is not defined";
    }

    var CommunicatorApp = angular.module("CommunicatorApp", ["SmartApps", "luegg.directives" ]);

    CommunicatorApp.config(["$compileProvider", function($compileProvider) {
    	// Needed to be able to generate 'data:' HREFs
    	$compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|file|blob|data):/);
    }]);

    CommunicatorApp.directive("ceResults", function() {
    	return {
    		scope: {
    			info: "=info"
    		},
			templateUrl: "Templates/Results.html"
    	};
    });

    CommunicatorApp.controller("CommunicatorController", ["$http", "$scope", "authenticator", function($http, $scope, authenticator) {

        $scope.StartupErrorMessage = null;

        $scope.Name = null;
        $scope.NameOperator = "";

        $scope.Searching = false;
        $scope.SearchErrorMessage = null;

        $scope.Patients = [];
        $scope.TotalPatientsCount = null;
        $scope.NextPatientsSearchUrl = null;
        $scope.SelectedPatient = null;

        $scope.SearchingCommunications = false;
        $scope.SearchCommunicationsErrorMessage = null;

        $scope.Communications = [];
        $scope.TotalCommunicationsCount = null;
        $scope.NextCommunicationsSearchUrl = null;

        $scope.Claims = [];

        $scope.Organizations = [];

        $scope.Request = {
        	From: null,
			To: null,
        	Content: null,
			Claim: null
        };

        $scope.SendRequestMessage = null;
        $scope.SendRequestFailed = false;
        $scope.SendingRequest = false;

        var fhirUrl = null;

        authenticator.login(
			CommunicatorConfiguration.clientID,
			function(url) {
				fhirUrl = url;
				loadAll(fhirUrl + "/Organization", "Load organizations", appendOrganization);
			},
			function(errorMessage) {
				$scope.StartupErrorMessage = errorMessage;
			},
			"user/*.*"
		);

        $scope.getFhirUrl = function () {
        	return fhirUrl;
        };

        $scope.getProductDescription = function () {
        	return "FHIR Communicator " + CommunicatorConfiguration.version + " (FHIR " + CommunicatorConfiguration.fhirVersion + ") - Copyright \xA9 " + CommunicatorConfiguration.copyrightYears + " CareEvolution Inc."
        };

        $scope.search = function (resource) {
            var parameters = "";
            parameters = appendStringSearchParameter(parameters, "name", $scope.Name, $scope.NameOperator);
            parameters = appendParameter(parameters, "_sort:asc", "family");
            parameters = appendParameter(parameters, "_count", getConfiguration().resultsPerPage);
            var searchUrl = fhirUrl + "/" + resource + parameters;
            $scope.Patients = [];
            $scope.TotalPatientsCount = null;
            $scope.NextPatientsSearchUrl = null;
            $scope.select(null);
            doSearch(searchUrl);
        };

        $scope.loadPatient = function() {
        	$scope.Communications = [];
        	$scope.TotalCommunicationsCount = null;
        	$scope.NextCommunicationsSearchUrl = null;
        	$scope.Claims = [];
        	if ($scope.SelectedPatient) {
        		var parameters = "";
        		parameters = appendParameter(parameters, "subject", "Patient/" + $scope.SelectedPatient.id);
        		parameters = appendParameter(parameters, "_count", getConfiguration().resultsPerPage);
        		var searchUrl = fhirUrl + "/Communication" + parameters;
        		doSearchCommunications(searchUrl);

        		parameters = "";
        		parameters = appendParameter(parameters, "patient", "Patient/" + $scope.SelectedPatient.id);
        		searchUrl = fhirUrl + "/Claim" + parameters;
        		loadAll(searchUrl, "Load claims", appendClaim);
        	}
        };

        function getConfiguration() {
             return {
                 resultsPerPage: CommunicatorConfiguration.defaultResultsPerPage,
             };
        }

        $scope.searchDisabled = function () {
            return $scope.Searching || $scope.StartupErrorMessage;
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

        $scope.searchCommunicationsDisabled = function() {
        	return $scope.SearchingCommunications || $scope.StartupErrorMessage;
        };

        $scope.searchNextCommunications = function() {
        	doSearchCommunications($scope.NextPatientCommunicationsSearchUrl);
        };

        $scope.dismissSearchCommunicationsErrorMessage = function() {
        	$scope.SearchCommunicationsErrorMessage = null;
        };

        $scope.getCommunicationsCountDescription = function() {
        	if (!$scope.Communications || $scope.Communications.length === 0) {
        		return "No results";
        	}
        	var result = $scope.Communications.length.toString();
        	if ($scope.TotalCommunicationsCount) {
        		result += " / ";
        		result += $scope.TotalCommunicationsCount.toString();
        	}
        	return result;
        };

        $scope.select = function(patient) {
        	if (patient != $scope.SelectedPatient) {
        		$scope.SelectedPatient = patient;
        		$scope.loadPatient();
        	}
        };

        $scope.sendRequest = function() {
        	if ($scope.sendRequestForm.$invalid || !$scope.SelectedPatient) {
        		return;
        	}
        	$scope.SendRequestMessage = null;
        	$scope.SendRequestFailed = false;
        	$scope.SendingRequest = true;
        	var now = new Date().toISOString();
        	// http://hl7.org/fhir/2017Jan/communicationrequest.html
        	var request = {
        		resourceType: "CommunicationRequest",
        		identifier: [
					{
						system: "urn:ietf:rfc:3986",
						value: "urn:uuid:" + createUUID()
					}
        		],
        		sender: {
					reference: "Organization/" + $scope.Request.From
        		},
        		payload: [
					{
						contentString: $scope.Request.Content
					}
        		],
				status: "requested",
				requestedOn: now,
        		subject: {
        			reference: "Patient/" + $scope.SelectedPatient.id
        		}
        	}
        	if ($scope.Request.To) {
        		request.recipient = {
        			reference: "Organization/" + $scope.Request.To
        		};
        	}
        	if ($scope.Request.Claim) {
        		request.topic = {
        			reference: "Claim/" + $scope.Request.Claim
        		};
        	}
        	$http({
        		url: fhirUrl + "/CommunicationRequest",
        		method: "POST",
        		data: request,
        		headers: getHeaders(),
        	}).success(function(data) {
        		$scope.SendingRequest = false;
        		$scope.SendRequestMessage = "Request sent";
        		$scope.SendRequestFailed = false;
        		$scope.Request = {
					From: $scope.Request.From
        		};
        		$scope.sendRequestForm.$setUntouched();
        		$scope.sendRequestForm.$setPristine();
        	}).error(function(data, status) {
        		$scope.SendingRequest = false;
        		$scope.SendRequestMessage = httpErrorMessage("Send request", data, status);
        		$scope.SendRequestFailed = true;
        	});
        };

        $scope.dismissSendRequestMessage = function() {
        	$scope.SendRequestMessage = null;
        };

        function createUUID() {
        	// http://www.ietf.org/rfc/rfc4122.txt
        	var s = new Array(36);
        	var hexDigits = "0123456789abcdef";
        	for (var i = 0; i < 36; i++) {
        		s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
        	}
        	s[14] = "4";  // bits 12-15 of the time_hi_and_version field to 0010
        	s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01
        	s[8] = s[13] = s[18] = s[23] = "-";

        	var uuid = s.join("");
        	return uuid;
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
                    for (var i = 0; i < data.entry.length; i++) {
                        var entry = data.entry[i];
                        var patient = createPatient(entry.resource, entry.resource.id, entry.fullUrl);
                        $scope.Patients.push(patient);
                    }
                }
                $scope.TotalPatientsCount = data.total;
                $scope.NextPatientsSearchUrl = getLinkHRef(data, "next");
            }).error(function (data, status) {
                $scope.Searching = false;
                $scope.SearchErrorMessage = httpErrorMessage("Search", data, status);
            });
        }

        function doSearchCommunications(searchUrl) {
        	$scope.SearchCommunicationErrorMessage = null;
        	$scope.SearchingCommunications = true;
        	$http({
        		url: searchUrl,
        		method: "GET",
        		headers: getHeaders(),
        	}).success(function(data) {
        		$scope.SearchingCommunications = false;
        		if (data.entry) {
        			for (var i = 0; i < data.entry.length; i++) {
        				var entry = data.entry[i];
        				var communication = createCommunication(entry.resource, entry.resource.id, entry.fullUrl);
        				$scope.Communications.push(communication);
        			}
        		}
        		$scope.TotalCommunicationsCount = data.total;
        		$scope.NextCommunicationsSearchUrl = getLinkHRef(data, "next");
        	}).error(function(data, status) {
        		$scope.SearchingCommunications = false;
        		$scope.SearchCommunicationsErrorMessage = httpErrorMessage("Search Communication", data, status);
        	});
        }

        function appendClaim(resource) {
        	var display = resource.identifier && resource.identifier.length > 0 ?
				resource.identifier[0].value :
				"?";
        	if (resource.total) {
        		display += " - $";
        		display += resource.total.value;
        	}
        	if (resource.created) {
        		display += " on ";
        		display += resource.created;
        	}
        	var claim = {
        		id: resource.id,
        		display: display,
        	};
        	$scope.Claims.push(claim);
        }

        function appendOrganization(resource) {
        	var identifier = resource.identifier && resource.identifier.length > 0 ?
				resource.identifier[0].value :
				null;
        	var display = resource.name || identifier || "?";
        	var key = display.toLowerCase();
        	var organization = {
        		id: resource.id,
        		display: display,
				key: key
        	};
        	var index = 0;
        	var organizations = $scope.Organizations;
        	while (index < organizations.length && organization.key > organizations[index].key) {
        		index++;
        	}
        	organizations.splice(index, 0, organization);
        }

        function loadAll(searchUrl, operation, processResource) {
        	$scope.SearchCommunicationErrorMessage = null;
        	$scope.SearchingCommunications = true;
        	$http({
        		url: searchUrl,
        		method: "GET",
        		headers: getHeaders(),
        	}).success(function(data) {
        		$scope.SearchingCommunications = false;
        		if (data.entry) {
        			for (var i = 0; i < data.entry.length; i++) {
        				processResource(data.entry[i].resource);
        			}
        		}
        		var nextPageUrl = getLinkHRef(data, "next");
        		if (nextPageUrl) {
        			loadAll(nextPageUrl, operation, processResource);
        		}
        	}).error(function(data, status) {
        		$scope.SearchingCommunications = false;
        		$scope.SearchCommunicationsErrorMessage = httpErrorMessage(operation, data, status);
        	});
        }

        function getHeaders() {
            var headers = {};
			var authorization = authenticator.getAuthorizationHeader();
            if (authorization) {
                headers.Authorization = authorization;
            }
            return headers;
        }

        function httpErrorMessage(operation, data, status) {
            if (status === 401) {
                return operation + " failed: not authorized. Please sign in again";
            }
            if (data && data.issue && data.issue.length > 0 && data.issue[0].details && data.issue[0].details.text) {
            	return operation + " failed: " + data.issue[0].details.text;
            }
            if (status === 0) {
                return operation + " failed: cannot connect to " + fhirUrl;
            }
            return operation + " failed with error " + status;
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

        function createPatient(patient, id, selfLink) {
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
                selfLink: selfLink
            };
        }

        function createCommunication(communication, id, selfLink) {
        	var attachment = communication.payload[0].contentAttachment;
        	var result = {
        		resultHeader: attachment.title,
        		resultLines: [],
        		id: id,
        		selfLink: selfLink
        	};
        	if (attachment.data) {
        		var mimeType = attachment.contentType || "application/octet-stream";
        		result.dataUrl = "data:" + mimeType + ";base64," + attachment.data;
        		result.dataFileName = (attachment.title || "data");
        	}
        	return result;
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
				name.family,
				joinNames(name.given)
            ]);
        }

        function joinNames(names) {
            return !names ? null : joinNonEmpty(" ", names.map(firstUppercase));
        }

        function getGenderDisplayName(patient) {
        	var genderValues = CommunicatorConfiguration.genderValues;
        	for (var i = 0; i < genderValues.length; i++) {
        		if (patient.gender === genderValues[i].code) {
        			return genderValues[i].name;
        		}
        	}
        	return patient.gender;
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
            // See http://www.hl7.org/implement/standards/fhir/datatypes.html#codeableconcept
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