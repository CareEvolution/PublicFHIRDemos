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
    			info: "=",
    			searchNext: "=",
    			select: "=",
				refresh: "="
    		},

    		templateUrl: "Templates/Results.html",

    		link: function($scope) {

    			$scope.selectedItem = null;

    			var outerSelect = $scope.select;
    			if (outerSelect) {
    				$scope.select = function(item) {
    					$scope.selectedItem = item;
    					outerSelect(item);
    				};
    			}

    			$scope.getCountDescription = function() {
    				var items = $scope.info.Items;
    				if (!items || items.length === 0) {
    					return "No results";
    				}
    				var result = items.length.toString();
    				if ($scope.info.TotalItemsCount) {
    					result += " / ";
    					result += $scope.info.TotalItemsCount.toString();
    				}
    				return result;
    			};

    			$scope.dismissErrorMessage = function() {
    				$scope.info.ErrorMessage = null;
    			};
    		}
    	};
    });

    CommunicatorApp.controller("CommunicatorController", ["$http", "$scope", "authenticator", function($http, $scope, authenticator) {

        $scope.StartupErrorMessage = null;

        $scope.Name = null;
        $scope.NameOperator = "";

        $scope.Organizations = [];

        $scope.Patients = emptyResultsInfo();
        $scope.SelectedPatient = null;
        $scope.SelectedRequest = null;

        $scope.Claims = [];

        $scope.Communications = emptyResultsInfo();
        $scope.Requests = emptyResultsInfo();

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
				loadAll(
					fhirUrl + "/Organization",
					appendOrganization,
					null,
					function(data, status) {
						$scope.StartupErrorMessage = httpErrorMessage("Load organizations", data, status);
					}
				);
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

        $scope.searchPatients = function (resource) {
            var parameters = "";
            parameters = appendStringSearchParameter(parameters, "name", $scope.Name, $scope.NameOperator);
            parameters = appendParameter(parameters, "_sort:asc", "family");
            parameters = appendParameter(parameters, "_count", CommunicatorConfiguration.defaultResultsPerPage);
            var searchUrl = fhirUrl + "/" + resource + parameters;
            $scope.Patients = emptyResultsInfo();
            $scope.selectPatient(null);
            doSearch(searchUrl, $scope.Patients, createPatient);
        };

        $scope.searchNextPatients = function(nextSearchUrl) {
        	doSearch(nextSearchUrl, $scope.Patients, createPatient);
        };

        $scope.loadPatient = function() {
        	$scope.Communications = emptyResultsInfo();
        	$scope.Requests = emptyResultsInfo();
        	$scope.SelectedRequest = null;
        	$scope.Claims = [];
        	if ($scope.SelectedPatient) {
        		doSearch(createSearchByPatientUrl("Communication", "sent"), $scope.Communications, createCommunication);

        		doSearch(createSearchByPatientUrl("CommunicationRequest", "requested"), $scope.Requests, createRequest);

        		var parameters = "";
        		parameters = appendParameter(parameters, "patient", "Patient/" + $scope.SelectedPatient.id);
        		searchUrl = fhirUrl + "/Claim" + parameters;
        		loadAll(
					searchUrl,
					appendClaim,
					null,
					function(data, status) {
						$scope.Communications.ErrorMessage = httpErrorMessage("Load claims", data, status);
					}
				);
        	}
        };

        $scope.searchNextCommunications = function(nextSearchUrl) {
        	doSearch(nextSearchUrl, $scope.Communications, createCommunication);
        };

        $scope.refreshCommunications = function() {
        	$scope.Communications = emptyResultsInfo();
        	if ($scope.SelectedPatient) {
        		var searchUrl = createSearchByPatientUrl("Communication", "sent");
        		if ($scope.SelectedRequest) {
        			searchUrl = appendParameter(searchUrl, "based-on", "CommunicationRequest/" + $scope.SelectedRequest.id);
        		}
        		doSearch(searchUrl, $scope.Communications, createCommunication);
        	}
        };

        $scope.searchNextRequests = function(nextSearchUrl) {
        	doSearch(nextSearchUrl, $scope.Requests, createRequest);
        };

        $scope.refreshRequests = function() {
        	if ($scope.SelectedRequest) {
        		$scope.SelectedRequest = null;
        		$scope.refreshCommunications();
        	}
        	$scope.Requests = emptyResultsInfo();
        	if ($scope.SelectedPatient) {
        		doSearch(createSearchByPatientUrl("CommunicationRequest", "requested"), $scope.Requests, createRequest);
        	}
        };

        $scope.selectPatient = function(patient) {
        	if (patient != $scope.SelectedPatient) {
        		$scope.SelectedPatient = patient;
        		$scope.loadPatient();
        	}
        };

        $scope.selectRequest = function(request) {
        	if (request != $scope.SelectedRequest) {
        		$scope.SelectedRequest = request;
        		$scope.refreshCommunications();
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
        	}).success(function(data, status, headers) {
        		$scope.SendingRequest = false;
        		$scope.SendRequestMessage = "Request sent (" + headers("Location") + ")";
        		$scope.SendRequestFailed = false;
        		$scope.Request = {
					From: $scope.Request.From
        		};
        		$scope.sendRequestForm.$setUntouched();
        		$scope.sendRequestForm.$setPristine();
        		$scope.Requests = emptyResultsInfo();
        		$scope.SelectedRequest = null;
        		doSearch(createSearchByPatientUrl("CommunicationRequest", "requested"), $scope.Requests, createRequest);
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

        function emptyResultsInfo() {
        	return {
        		Items: [],
        		TotalItemsCount: null,
        		NextSearchUrl: null,
        		ErrorMessage: null,
        		Searching: false
        	};
        }

        function createSearchByPatientUrl(resource, descendingSort) {
        	var parameters = "";
        	parameters = appendParameter(parameters, "subject", "Patient/" + $scope.SelectedPatient.id);
        	if (descendingSort) {
        		parameters = appendParameter(parameters, "_sort:desc", descendingSort);
        	}
        	parameters = appendParameter(parameters, "_count", CommunicatorConfiguration.defaultResultsPerPage);
        	return fhirUrl + "/" + resource + parameters;
        }

        function doSearch(url, resultsInfo, createItem) {
        	resultsInfo.ErrorMessage = null;
        	resultsInfo.Searching = true;
            load(
				url,
				function(resource) {
					var item = createItem(resource);
					resultsInfo.Items.push(item);
				},
				function(total, nextPageUrl) {
					resultsInfo.Searching = false;
					resultsInfo.TotalItemsCount = total;
					resultsInfo.NextSearchUrl = nextPageUrl;
				},
				function onError(data, status) {
					resultsInfo.Searching = false;
					resultsInfo.ErrorMessage = httpErrorMessage("Search", data, status);
				}
			);
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

        function loadAll(url, processResource, onCompletion, onError) {
        	load(
				url,
				processResource,
				function(total, nextPageUrl) {
					if (nextPageUrl) {
						loadAll(nextPageUrl, processResource, onCompletion, onError);
					} else if (onCompletion) {
						onCompletion();
					}
				},
				onError
			);
        }

        function load(url, processResource, processTotalAndNextPageUrl, onError) {
        	$http({
        		url: url,
        		method: "GET",
        		headers: getHeaders(),
        	}).success(function(data) {
        		if (data.entry) {
        			for (var i = 0; i < data.entry.length; i++) {
        				processResource(data.entry[i].resource);
        			}
        		}
        		if (processTotalAndNextPageUrl) {
        			processTotalAndNextPageUrl(data.total, getLinkHRef(data, "next"));
        		}
        	}).error(function(data, status) {
        		if (onError) {
        			onError(data, status);
        		}
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

        function createPatient(patient) {
            var displayName = composeDisplayName(getOfficialOrFirstName(patient));
            var genderDisplayName = getGenderDisplayName(patient);
            var displayAgeOrDeceased = composeDisplayAgeOrDeceased(patient);
            return {
            	id: patient.id,
            	resultHeader: displayName,
                resultLines: [
					joinNonEmpty(", ", [
						genderDisplayName,
						displayAgeOrDeceased,
					]),
                ]
            };
        }

        function createCommunication(communication) {
			var result = processPayloads(communication.payload);
			result.id = communication.id;
			result.resultLines = [];
			if (communication.status) {
				result.resultLines.push("Status: " + communication.status);
			}
			if (communication.sent) {
				result.resultLines.push("Sent on: " + communication.sent);
			}
			var sender = processReference(communication.sender);
			if (sender) {
				result.resultLines.push("From: " + sender);
			}
			if (communication.recipient) {
				var recipients = joinNonEmpty(", ", communication.recipient.map(processReference));
				if (recipients) {
					result.resultLines.push("To: " + recipients);
				}
			}
			return result;
        }

        function createRequest(request) {
        	var result = processPayloads(request.payload);
        	result.id = request.id;
        	result.resultLines = [];
        	if (request.status) {
        		result.resultLines.push("Status: " + request.status);
        	}
        	if (request.requestedOn) {
        		result.resultLines.push("Requested on: " + request.requestedOn);
        	}
        	var sender = processReference(request.sender);
        	if (sender) {
        		result.resultLines.push("From: " + sender);
        	}
        	if (request.recipient) {
        		var recipients = joinNonEmpty( ", ", request.recipient.map(processReference) );
        		if (recipients) {
        			result.resultLines.push("To: " + recipients);
        		}
			}
        	return result;
        }

        function processPayloads(payloads) {
        	if (!payloads || payloads.length == 0) {
        		return {
        			resultHeader: "?",
        			dataUrl: null
        		}
        	}
        	var payload = payloads[0];
        	if (payload.contentString) {
        		return {
        			resultHeader: payload.contentString,
        			dataUrl: null
        		}
        	}
        	var attachment = payload.contentAttachment;
        	if (!attachment) {
        		return {
        			resultHeader: "?",
        			dataUrl: null
        		}
        	}
        	var display = attachment.title || "data";
        	var result = {
        		resultHeader: attachment.title || "data",
        		dataUrl: null
        	};
        	if (attachment.url) {
        		result.dataUrl = attachment.url;
        		result.dataFileName = (attachment.title || "data");
        	} else if (attachment.data) {
        		var mimeType = attachment.contentType || "application/octet-stream";
        		result.dataUrl = "data:" + mimeType + ";base64," + attachment.data;
        		result.dataFileName = (attachment.title || "data");
        	}
        	return result;
		}

        function processReference(reference) {
        	if (!reference) {
        		return null;
        	}
        	if (reference.display) {
        		return reference.display;
        	}
        	return reference.reference;
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