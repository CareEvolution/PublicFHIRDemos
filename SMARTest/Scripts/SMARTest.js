/* 
 * Copyright (c) 2017, CareEvolution Inc (info@careevolution.com)
 * 
 * This file is licensed under the MIT License - see License.txt
 */

/* global angular */
/* global SMARTestRegistrations */

(function() {

	var SmartestApp = angular.module("SmartestApp", []);

	SmartestApp.directive("callButton", function() {
		return {
			restrict: "E",
			scope: {
				label: "=",
				action: "=",
				disabled: "=",
				executing: "=",
				message: "=",
				failed: "="
			},
			templateUrl: "CallButton.html",
			link: function($scope) {
				$scope.dismissMessage = function() {
					$scope.message = null;
				};
			}
		}
	});

	SmartestApp.controller("SmartestController", ["$http", "$scope", function($http, $scope) {

		var MODE_CODE = "code";

		var SESSION_MODE = "mode";
		var SESSION_FHIR_URL = "fhirUrl";
		var SESSION_CLIENT_ID = "clientID";
		var SESSION_CLIENT_SECRET = "clientSecret";
		var SESSION_SCOPE = "scope";
		var SESSION_LAUNCH = "launch";
		var SESSION_TOKEN_URL = "tokenUrl";
		var SESSION_ACCESS_TOKEN = "accessToken";
		var SESSION_PATIENT_ID = "patientID";
		var SESSION_REFRESH_TOKEN = "refreshToken";

		$scope.redirectUrl = window.location.href.substring(0, window.location.href.length - window.location.search.length);

		$scope.fhirUrl = sessionStorage[SESSION_FHIR_URL] || null;
		$scope.testFhirUrlMessage = null;
		$scope.testFhirUrlFailed = false;
		$scope.testingFhirUrl = false;
		$scope.testFhirUrlDisabled = function() {
			return $scope.testingFhirUrl || !$scope.fhirUrl;
		};
		$scope.testFhirUrl = function() {
			setSessionStorage(SESSION_FHIR_URL, $scope.fhirUrl);
			$scope.testFhirUrlMessage = null;
			$scope.testFhirUrlFailed = false;
			$scope.testingFhirUrl = true;
			getFhirMetadata(
				function(smartUrls) {
					$scope.testFhirUrlMessage = "OK";
					$scope.testFhirUrlFailed = false;
					$scope.testingFhirUrl = false;
				},
				function(errorMessage) {
					$scope.testFhirUrlMessage = errorMessage;
					$scope.testFhirUrlFailed = true;
					$scope.testingFhirUrl = false;
				}
			);
		};

		$scope.clientID = sessionStorage[SESSION_CLIENT_ID] || null;
		$scope.clientSecret = sessionStorage[SESSION_CLIENT_SECRET] || null;
		$scope.scope = sessionStorage[SESSION_SCOPE] || null;
		$scope.launch = sessionStorage[SESSION_LAUNCH] || null;
		$scope.registrations = SMARTestRegistrations;
		$scope.registration = findRegistrationByClientID();
		$scope.$watch("registration", function(newRegistration, oldRegistration) {
			if (newRegistration !== oldRegistration) {
				if (newRegistration) {
					$scope.clientID = newRegistration.clientID;
					$scope.clientSecret = newRegistration.clientSecret;
					$scope.scope = newRegistration.scope;
				} else {
					$scope.clientID = null;
					$scope.clientSecret = null;
					$scope.scope = null;
				}
			}
		});
		$scope.authorizeMessage = null;
		$scope.authorizing = false;
		$scope.authorizeDisabled = function() {
			return $scope.authorizing || !$scope.fhirUrl || !$scope.clientID || (hasScope($scope.scope, "launch") && !$scope.launch);
		};
		$scope.authorize = function() {
			setSessionStorage(SESSION_FHIR_URL, $scope.fhirUrl);
			setSessionStorage(SESSION_CLIENT_ID, $scope.clientID);
			setSessionStorage(SESSION_CLIENT_SECRET, $scope.clientSecret);
			setSessionStorage(SESSION_SCOPE, $scope.scope);
			setSessionStorage(SESSION_LAUNCH, $scope.launch);
			setAccessToken(null, null, null);
			getFhirMetadata(
				function(smartUrls) {
					var redirectParameters = "";
					redirectParameters = appendParameter(redirectParameters, "response_type", "code");
					redirectParameters = appendParameter(redirectParameters, "client_id", $scope.clientID);
					redirectParameters = appendParameter(redirectParameters, "redirect_uri", $scope.redirectUrl);
					redirectParameters = appendParameter(redirectParameters, "aud", $scope.fhirUrl);
					redirectParameters = appendParameter(redirectParameters, "scope", $scope.scope);
                    redirectParameters = appendParameter(redirectParameters, "state", "dummy-state");
					if (hasScope($scope.scope, "launch")) {
						redirectParameters = appendParameter(redirectParameters, "launch", $scope.launch);
					}
					mode = MODE_CODE;
					setSessionStorage(SESSION_MODE, mode);
					setSessionStorage(SESSION_TOKEN_URL, smartUrls.tokenUrl);
					window.location = smartUrls.authorizeUrl + redirectParameters;
				},
				function(errorMessage) {
					$scope.authorizeMessage = errorMessage;
				}
			);
		};

		$scope.accessToken = sessionStorage[SESSION_ACCESS_TOKEN] || null;
		$scope.refreshToken = sessionStorage[SESSION_REFRESH_TOKEN] || null;
		$scope.patientID = sessionStorage[SESSION_PATIENT_ID] || null;

		$scope.refreshTokenMessage = null;
		$scope.refreshingToken = false;
		$scope.refreshTokenDisabled = function() {
			return !$scope.refreshToken;
		}
		$scope.doRefreshToken = function() {
			$scope.refreshingToken = true;
			$scope.refreshTokenMessage = null;
			getAccessToken(
				{
					grant_type: "refresh_token",
					refresh_token: $scope.refreshToken,
				},
				function(data) {
					$scope.refreshingToken = false;
					$scope.accessToken = data.access_token;
					setSessionStorage(SESSION_ACCESS_TOKEN, data.access_token);
					if (data.refresh_token) {
						$scope.refreshToken = data.refresh_token;
						setSessionStorage(SESSION_REFRESH_TOKEN, data.refresh_token);
					}
				},
				function(errorMessage) {
					$scope.refreshingToken = false;
					$scope.refreshTokenMessage = errorMessage;
				}
			);
		}

		$scope.fhirGetRelativeUrl = $scope.patientID ? "Patient/" + $scope.patientID : "Patient";
		$scope.fhirGetMessage = null;
		$scope.fhirGetting = false;
		$scope.fhirGetDisabled = function() {
			return !$scope.accessToken || !$scope.fhirGetRelativeUrl;
		};
		$scope.fhirGet = function() {
			$scope.fhirGetMessage = null;
			$scope.fhirGetResult = null;
			$scope.fhirGetting = true;
			var fhirUrl = $scope.fhirUrl + "/" + $scope.fhirGetRelativeUrl;
			$http({
				url: fhirUrl,
				headers: {
					"Accept": "application/json",
					"Authorization": "Bearer " + $scope.accessToken
				},
				method: "GET",
			}).success(function(data) {
				$scope.fhirGetting = false;
				$scope.fhirGetResult = JSON.stringify(data, null, 4);
			}).error(function(data, status) {
				$scope.fhirGetting = false;
				var getMessage = "Get '" + fhirUrl + "' failed";
				if (data && data.issue && data.issue.length && data.issue[0].details) {
					$scope.fhirGetMessage = getMessage + ": " + data.issue[0].details.text;
				} else if (status === 0) {
					$scope.fhirGetMessage = getMessage + ": cannot connect";
				} else {
					$scope.fhirGetMessage = getMessage + " with error " + status;
				}
			});
		};


		$scope.fhirGetResult = null;

		var mode = sessionStorage[SESSION_MODE];

		if (mode === MODE_CODE && !$scope.accessToken) {
			var urlParameters = getUrlParameters();
			var code = urlParameters["code"];
			if (!code) {
				$scope.authorizeMessage = "Authorization error: " + (urlParameters["error_description"] || urlParameters["error"] || "missing 'code' parameter");
			} else {
				getAccessToken(
					{
						grant_type: "authorization_code",
						code: code,
						redirect_uri: $scope.redirectUrl,
					},
					function(data) {
						setAccessToken(data.access_token, data.refresh_token, data.patient);
						window.location = $scope.redirectUrl;
					},
					function(errorMessage) {
						$scope.authorizeMessage = errorMessage;
					}
				);
			}
		}

		function findRegistrationByClientID() {
			var registrations = $scope.registrations;
			if (!registrations || !registrations.length || !$scope.clientID) {
				return null;
			}
			for (var i = 0; i < registrations.length; i++) {
				var registration = registrations[i];
				if (registration && registration.clientID === $scope.clientID) {
					return registration;
				}
			}
			return null;
		}

		function setAccessToken(token, refreshToken, patientID) {
			$scope.accessToken = token;
			setSessionStorage(SESSION_ACCESS_TOKEN, token);
			$scope.refreshToken = refreshToken;
			setSessionStorage(SESSION_REFRESH_TOKEN, refreshToken);
			$scope.patientID = patientID;
			setSessionStorage(SESSION_PATIENT_ID, patientID);
		}

		function setSessionStorage(key, value) {
			if (value) {
				sessionStorage[key] = value;
			} else {
				sessionStorage.removeItem(key);
			}
		}

		function getUrlParameters() {
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

		function hasScope(scope, value) {
			return scope && scope.split(" ").indexOf(value) >= 0;
		}

		function getFhirMetadata(onSuccess, onError) {
			$http({
				url: $scope.fhirUrl + "/metadata",
				method: "GET",
			}).success(function(data) {
				var smartUrls = getSmartUrls(data);
				if (!smartUrls) {
					onError("The FHIR server conformance statement does not specify the SMART authorization and token URLs");
				} else {
					onSuccess(smartUrls);
				}
			}).error(function(data, status) {
				if (data && data.issue && data.issue.length > 0 && data.issue[0].details) {
					onError("Get conformance failed: " + data.issue[0].details);
				} else if (status === 0) {
					onError("Get conformance failed: cannot connect to " + fhirUrl);
				} else {
					onError("Get conformance failed with error " + status);
				}
			});
		}

		function getSmartUrls(data) {
			var result = {
				authorizeUrl: null,
				tokenUrl: null
			};
			if (data && data.rest && data.rest.length > 0 && data.rest[0].security && data.rest[0].security.extension) {
				var extensions = data.rest[0].security.extension;
				for (var i = 0; i < extensions.length; i++) {
					var extension = extensions[i];
					if (extension.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris" && extension.extension) {
						var subExtensions = extension.extension;
						for (var j = 0; j < subExtensions.length; j++) {
							var subExtension = subExtensions[j];
							if (subExtension.url === "authorize") {
								result.authorizeUrl = subExtension.valueUri;
							} else if (subExtension.url === "token") {
								result.tokenUrl = subExtension.valueUri;
							}
						}
					}
				}
			}
			if (!result.authorizeUrl || !result.tokenUrl) {
				return null;
			}
			return result;
		}

		function getAccessToken(data, onSuccess, onError) {
			var headers = {
				"Content-Type": "application/x-www-form-urlencoded"
			};
			if (!$scope.clientSecret) {
				data.client_id = $scope.clientID;
			} else {
				var basicCredentials = encodeURIComponent($scope.clientID) + ":" + encodeURIComponent($scope.clientSecret);
				headers["Authorization"] = "Basic " + btoa(basicCredentials);
			}
			$http({
				url: sessionStorage[SESSION_TOKEN_URL],
				method: "POST",
				headers: headers,
				transformRequest: [function(data) {
					return angular.isObject(data) && String(data) !== "[object File]" ? jQuery.param(data) : data;
				}],
				data: data
			}).success(function(data) {
				if (!data || !data.access_token) {
					onError("Get access token failed: success but no access token in the response");
				} else {
					onSuccess(data);
				}
			}).error(function(data, status) {
				if (data && data.error_description) {
					onError("Get access token failed: " + data.error_description);
				} else if (status === 0) {
					onError("Get access token failed: cannot connect to " + url);
				} else {
					onError("Get access token failed: error " + status);
				}
			});
		}
	}]);
})();
