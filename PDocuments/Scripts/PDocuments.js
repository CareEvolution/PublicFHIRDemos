/* 
 * Copyright (c) 2016, CareEvolution Inc (info@careevolution.com)
 * 
 * This file is licensed under the MIT License - see License.txt
 */

/* global angular */

(function () {

	var PDocumentsApp = angular.module("PDocumentsApp", ["SmartApps"]);

	PDocumentsApp.config(["$compileProvider", function($compileProvider) {
		// Needed to be able to generate 'data:' HREFs
		$compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|file|blob|data):/);
	}]);

	PDocumentsApp.directive("fileread", [function() {
		return {
			scope: {
				fileread: "="
			},
			require: "ngModel",
			link: function(scope, element, attributes, ctrl) {
				ctrl.$setValidity("required", element.val() != "");
				element.bind("change", function(changeEvent) {
					ctrl.$setValidity("required", element.val() != "");
					var reader = new FileReader();
					reader.onload = function(loadEvent) {
						scope.$apply(function() {
							scope.fileread = loadEvent.target.result;
						});
					}
					reader.readAsDataURL(changeEvent.target.files[0]);
				});
			}
		}
	}]);

	PDocumentsApp.controller("PDocumentsController", ["$http", "$scope", "authenticator", function($http, $scope, authenticator) {

		var CLIENT_ID = "CareEvolutionPDocuments";

		$scope.StartupErrorMessage = null;

        $scope.Identifier = null;
        $scope.Description = null;
        $scope.Created = null;
        $scope.TypeCode = null;
        $scope.TypeSystem = "http://loinc.org";
        $scope.TypeDisplay = null;
        $scope.Class = null;
        $scope.SecurityLabel = null;
        $scope.FacilityType = null;
        $scope.File = null;
        $scope.Format = null;

        $scope.Documents = [];
        $scope.TotalDocumentsCount = null;
        $scope.NextDocumentsSearchUrl = null;
        $scope.SelectedDocument = null;

        $scope.SearchErrorMessage = null;
        $scope.Searching = false;

        $scope.CreateErrorMessage = null;
        $scope.Creating = false;

        $scope.ClassCodes = valueSetIncludesToCodes(classCodeIncludes, true);
        $scope.SecurityCodes = valueSetIncludesToCodes(securityCodeIncludes, false);
        $scope.FacilityCodes = valueSetIncludesToCodes(facilityCodeIncludes, true);
        $scope.FormatCodes = valueSetIncludesToCodes(formatCodeIncludes, true);

        var fhirUrl = null;
        var patientID = null;

        authenticator.login(
			CLIENT_ID,
			function(url, id) {
				fhirUrl = url;
				patientID = id;
				search();
			},
			function(errorMessage) {
				$scope.StartupErrorMessage = errorMessage;
			}
		);

        $scope.create = function() {
        	if (!$scope.createForm.$valid) {
        		return;
        	}
        	$scope.CreateErrorMessage = null;
        	$scope.Creating = true;
        	var now = new Date().toISOString();
        	var created = $scope.Created ?
				$scope.Created.toISOString() :
				now;
        	var file = $scope.File;
			// data:<mime>;base64,<base64 data>
        	var contentSeparatorIndex = file.indexOf(",");
        	var contentData = file.substring(contentSeparatorIndex + 1);
        	var contentType = file.substring(5, contentSeparatorIndex - 7);
        	$http({
        		url: fhirUrl + "/DocumentReference",
        		method: "POST",
        		data: {
        			resourceType: "DocumentReference",
        			masterIdentifier: {
        				system: "urn:ietf:rfc:3986",
        				value: "urn:oid:" + $scope.Identifier
        			},
        			subject: {
						reference: "Patient/" + patientID
        			},
        			type: {
        				coding: [
						  {
						  	system: $scope.TypeSystem,
						  	code: $scope.TypeCode,
							display: $scope.TypeDisplay
						  }
        				]
        			},
        			"class": {
        				coding: [
							$scope.Class
        				]
        			},
        			created: created,
        			indexed: now,
        			status: "current",
        			description: $scope.Description,
        			securityLabel: [
						{
							coding: [
							  $scope.SecurityLabel
							]
						}
        			],
        			content: [
						{
    						attachment: {
    							contentType: contentType,
    							data: contentData
    						},
    						format: [
								$scope.Format
    						]
						}
        			],
        			context: {
        				facilityType: {
        					coding: [
								$scope.FacilityType
        					]
        				}
        			}
        		},
        		headers: getHeaders(),
        	}).success(function(data) {
        		$scope.Creating = false;
        		search();
        	}).error(function(data, status) {
        		$scope.Creating = false;
        		handleHttpError("Create", data, status, function(message) { $scope.CreateErrorMessage = message; });
        	});
        };

        $scope.searchNext = function() {
        	if ($scope.NextDocumentsSearchUrl) {
        		search($scope.NextDocumentsSearchUrl);
        	}
        };

        $scope.select = function(document) {
        	$scope.SelectedDocument = document;
        };

        $scope.isSelected = function(document) {
        	return $scope.SelectedDocument === document;
        };

        $scope.getDocumentsCountDescription = function() {
        	if (!$scope.Documents || $scope.Documents.length === 0) {
        		return "No results";
        	}
        	var result = $scope.Documents.length.toString();
        	if ($scope.TotalDocumentsCount) {
        		result += " / ";
        		result += $scope.TotalDocumentsCount.toString();
        	}
        	return result;
        };

        $scope.dismissCreateErrorMessage = function() {
        	$scope.CreateErrorMessage = null;
        };

        $scope.dismissSearchErrorMessage = function() {
        	$scope.SearchErrorMessage = null;
        };

        function search(url) {
        	$scope.SearchErrorMessage = null;
        	$scope.Searching = true;
        	$http({
        		url: url || (fhirUrl + "/DocumentReference?patient=" + patientID + "&_format=json" ),
        		method: "GET",
        		headers: getHeaders(),
        	}).success(function(data) {
        		$scope.Searching = false;
        		$scope.TotalDocumentsCount = data.total;
        		$scope.NextDocumentsSearchUrl = getLinkHRef(data, "next");
        		$scope.Documents = [];
        		if (data.entry) {
        			for (var i = 0; i < data.entry.length; i++) {
        				var document = createDocument(data.entry[i].resource);
        				$scope.Documents.push(document);
        			}
        		}
        	}).error(function(data, status) {
        		$scope.Searching = false;
        		handleHttpError("Search", data, status, function(message) { $scope.SearchErrorMessage = message; });
        	});
		}

        function handleHttpError(operation, data, status, setErrorMessage) {
        	if (status === 401) {
        		setErrorMessage(operation + " failed: not authorized. Please sign in again");
        		authenticator.logout();
        	} else if (data && data.issue && data.issue.length > 0 && data.issue[0].details && data.issue[0].details.text) {
        		setErrorMessage(operation + " failed: " + data.issue[0].details.text);
        	} else if (status === 0) {
        		setErrorMessage(operation + " failed: cannot connect to " + fhirUrl);
        	} else {
        		setErrorMessage(operation + " failed with error " + status);
        	}
        }

        function getHeaders() {
        	var headers = {};
        	var authorizationHeader = authenticator.getAuthorizationHeader();
        	if (authorizationHeader) {
        		headers.Authorization = authorizationHeader;
        	}
        	return headers;
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

        function createDocument(documentManifest) {
        	var document = {};
        	var identifier = removePrefix(documentManifest.masterIdentifier.value, "urn:oid:");
        	var description = documentManifest.description;
        	if (description) {
        		description += " - ";
        	}
        	description += identifier;
        	document.description = description;
        	document.type = getCodeableConceptDisplay(documentManifest.type).display;
        	var created = new Date(documentManifest.created).toLocaleString();
        	document.created = created;
        	var details = [];
        	if (documentManifest.content) {
        		for (var i = 0; i < documentManifest.content.length; i++) {
        			var content = documentManifest.content[i];
        			var detail = null;
        			var format = getBestCoding(content.format);
        			if (format) {
        				var displayAndSystem = getCodingDisplay(format);
        				detail = getDetail("Data", displayAndSystem);
        			} else {
        				detail = {
        					title: "Data",
        					value: "-",
        					properties: {}
        				}
        			}
        			var attachment = content.attachment;
        			if (attachment) {
        				var dataFileName = (documentManifest.description || "data");
        				if (documentManifest.content.length > 1) {
        					dataFileName += "_" + i;
        				}
        				if (attachment.url) {
        					detail.dataUrl = attachment.url;
        					detail.dataFileName = dataFileName;
        				} else if (attachment.data) {
        					var mimeType = attachment.contentType || "application/octet-stream";
        					detail.dataUrl = "data:" + mimeType + ";base64," + attachment.data;
        					detail.dataFileName = dataFileName;
        				}
        				if (attachment.contentType) {
        					detail.properties["Content type"] = attachment.contentType;
        				}
        				if (attachment.language) {
        					detail.properties["Language"] = attachment.language;
        				}
        				if (attachment.size) {
        					detail.properties["Size"] = attachment.size;
        				}
        				if (attachment.hash) {
        					detail.properties["SHA1 hash"] = attachment.hash;
        				}
					}
        			details.push(detail);
				}
        	}
        	details.push({
        		title: "Id",
        		value: documentManifest.id
        	});
        	details.push({
        		title: "Created on",
        		value: created
        	});
        	details.push({
        		title: "Identifier",
        		value: identifier,
        		properties: removeEmpty({
        			"System": documentManifest.masterIdentifier.system
        		})
        	});
        	if (documentManifest.type) {
        		details.push(getCodeableConceptDetails("Type", documentManifest.type));
        	}
        	if (documentManifest.class) {
        		details.push(getCodeableConceptDetails("Class", documentManifest.class));
        	}
        	if (documentManifest.securityLabel && documentManifest.securityLabel.length > 0) {
        		details.push(getCodeableConceptDetails("Confidentiality", documentManifest.securityLabel[0]));
        	}
        	var context = documentManifest.context;
        	if (context) {
        		if (context.facilityType) {
        			details.push(getCodeableConceptDetails("Facility type", context.facilityType));
        		}
        		if (context.practiceSetting) {
	        		details.push(getCodeableConceptDetails("Practice setting", context.practiceSetting));
        		}
        	}
        	document.details = details;
        	return document;
        }

        function getCodeableConceptDetails(title, codeableConcept) {
        	var displayAndSystem = getCodeableConceptDisplay(codeableConcept);
        	return getDetail(title, displayAndSystem);
        }

        function getDetail(title, displayAndSystem) {
        	return {
        		title: title,
        		value: displayAndSystem.display,
        		properties: removeEmpty({
        			"System": displayAndSystem.system
        		})
        	};
        }

        function getCodeableConceptDisplay(codeableConcept) {
        	if (!codeableConcept) {
        		return null;
        	}
        	var coding = getBestCoding(codeableConcept.coding);
        	if (!coding) {
        		if (!codeableConcept.text) {
        			return null;
        		}
        		return {
        			display: codeableConcept.text,
        			system: null
        		}
        	}
			return getCodingDisplay(coding, codeableConcept.text);
        }

        function getCodingDisplay(coding, initialDisplay) {
        	if (!coding) {
        		return null;
        	}
        	var display = initialDisplay;
        	if (!display) {
        		display = coding.display || coding.code;
        	}
        	if (!display) {
				return null
        	}
        	if (display !== coding.code) {
        		display += " (" + coding.code + ")";
        	}
        	return {
        		display: display,
        		system: coding.system
        	};
        }

        function getBestCoding(codings) {
        	var firstCoding = null;
        	if (codings) {
        		for (var i = 0; i < codings.length; i++) {
        			var coding = codings[i];
        			if (coding != null) {
        				if (coding.userSelected) {
        					return coding;
        				}
        				if (firstCoding == null) {
        					firstCoding = coding;
        				}
        			}
        		}
        	}
        	return firstCoding;
		}

        function removePrefix(str, prefix) {
        	if (str && str.substring(0, prefix.length) === prefix) {
        		return str.substring(prefix.length);
        	}
        	return str;
        }

        function removeEmpty(obj) {
        	var result = {};
        	for (var propName in obj) {
        		var value = obj[propName];
        		if (value) {
					result[propName] = value;
        		}
        	}
        	return result;
        }

        function valueSetIncludesToCodes(includes, sort) {
        	var result = [];
        	if (includes) {
        		for (var i = 0; i < includes.length; i++) {
        			var include = includes[i];
        			if (include.concept) {
        				for (var j = 0; j < include.concept.length; j++) {
        					var concept = include.concept[j];
        					if (concept && concept.code) {
        						var text = concept.display || concept.code;
        						if (text !== concept.code) {
        							text += " (" + concept.code + ")";
        						}
        						var value = {
        							code: concept.code,
        							system: include.system,
        							display: concept.display
        						};
        						result.push({
        							text: text,
									value: value
        						});
        					}
        				}
        			}
        		}
        	}
        	if (sort) {
        		result.sort(function(firstCode, secondCode) {
        			var firstText = firstCode.text.toLowerCase();
        			var secondText = secondCode.text.toLowerCase();
        			if (firstText < secondText) {
        				return -1;
        			}
        			if (firstText > secondText) {
        				return 1;
        			}
        			return 0;
        		})
        	}
        	return result;
        }
	}]);
})();