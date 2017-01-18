/* 
 * Copyright (c) 2016, CareEvolution Inc (info@careevolution.com)
 * 
 * This file is licensed under the MIT License - see License.txt
 */

/* global angular */

(function() {

	var SmartApps = angular.module("SmartApps", []);

	SmartApps.factory("urlParameters", function() {
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

	SmartApps.factory("authenticator", ["$http", "urlParameters", function($http, urlParameters) {

		var MODE_ANONYMOUS = "anonymous";
		var MODE_CODE = "code";

		var SESSION_FHIR_URL = "fhirUrl";
		var SESSION_MODE = "mode";
		var SESSION_TOKEN_URL = "tokenUrl";
		var SESSION_AUTHORIZATION_TOKEN = "authorizationToken";
		var SESSION_PATIENT_ID = "patientID";

		function getRedirectUrl() {
			return window.location.href.substring(0, window.location.href.length - window.location.search.length)
		}

		function setAuthorizationToken(token) {
			if (token) {
				sessionStorage[SESSION_AUTHORIZATION_TOKEN] = token;
			} else {
				sessionStorage.removeItem(SESSION_AUTHORIZATION_TOKEN);
			}
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
			return scope.split(" ").indexOf(value) >= 0;
		}

		return {
			login: function(clientID, onSuccess, onError, scope) {
				scope = scope || "user/*.* launch";

				var requiresPatientID = hasScope(scope, "launch") || hasScope(scope, "launch/patient");

				var mode = sessionStorage[SESSION_MODE];
				var tokenUrl = sessionStorage[SESSION_TOKEN_URL];
				var authorizationToken = sessionStorage[SESSION_AUTHORIZATION_TOKEN];
				var patientID = sessionStorage[SESSION_PATIENT_ID];

				var fhirUrl = urlParameters["fhirServiceUrl"];
				if (fhirUrl) {
					var patientID = urlParameters["patientID"];
					if (requiresPatientID && !patientID) {
						onError("Please specify the ID of the patient of interest using the 'patientID' URL parameter");
					} else {
						mode = MODE_ANONYMOUS;
						sessionStorage[SESSION_FHIR_URL] = fhirUrl;
						sessionStorage[SESSION_MODE] = mode;
						sessionStorage[SESSION_TOKEN_URL] = null;
						sessionStorage[SESSION_PATIENT_ID] = patientID;
						setAuthorizationToken(null);
						window.location = getRedirectUrl();
					}
				} else {
					fhirUrl = urlParameters["iss"];
					if (!fhirUrl) {
						fhirUrl = sessionStorage[SESSION_FHIR_URL];
						if (!fhirUrl) {
							onError("Please specify the FHIR server base URL using either the 'fhirServiceUrl' (if public) or 'iss' (if with SMART authorization) URL parameter");
						} else if (!authorizationToken && mode === MODE_CODE) {
							var code = urlParameters["code"];
							if (!code) {
								onError("Authorization error: " + (urlParameters["error_description"] || urlParameters["error"] || "missing 'code' parameter"));
							} else {
								$http({
									url: tokenUrl,
									method: "POST",
									headers: { "Content-Type": "application/x-www-form-urlencoded" },
									transformRequest: [function(data) {
										return angular.isObject(data) && String(data) !== "[object File]" ? jQuery.param(data) : data;
									}],
									data: {
										grant_type: "authorization_code",
										code: code,
										client_id: clientID,
										redirect_uri: getRedirectUrl(),
									}
								}).success(function(data) {
									setAuthorizationToken(data.access_token);
									sessionStorage[SESSION_PATIENT_ID] = data.patient;
									window.location = getRedirectUrl();
								}).error(function(data, status) {
									if (data && data.error_description) {
										onError("Get access token failed: " + data.error_description);
									} else if (status === 0) {
										onError("Get access token failed: " + "cannot connect to " + url);
									} else {
										onError("Get access token failed: " + "error " + status);
									}
								});
							}
						} else {
							onSuccess(fhirUrl, patientID);
						}
					} else {
						setAuthorizationToken(null);
						$http({
							url: fhirUrl + "/metadata",
							method: "GET",
						}).success(function(data) {
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
								onError("The FHIR server conformance statement does not specify the SMART authorization and token URLs");
							} else {
								var requiresLaunch = hasScope(scope, "launch");
								var launch = urlParameters["launch"];
								if (requiresLaunch && !launch) {
									onError("Please specify the launch context using the 'launch' URL parameter");
								} else {
									var redirectParameters = "";
									redirectParameters = appendParameter(redirectParameters, "response_type", "code");
									redirectParameters = appendParameter(redirectParameters, "client_id", clientID);
									redirectParameters = appendParameter(redirectParameters, "redirect_uri", getRedirectUrl());
									redirectParameters = appendParameter(redirectParameters, "aud", fhirUrl);
									redirectParameters = appendParameter(redirectParameters, "scope", scope);
									if (requiresLaunch) {
										redirectParameters = appendParameter(redirectParameters, "launch", launch);
									}
									mode = MODE_CODE;
									sessionStorage[SESSION_FHIR_URL] = fhirUrl;
									sessionStorage[SESSION_MODE] = mode;
									sessionStorage[SESSION_TOKEN_URL] = tokenUrl;
									window.location = authorizeUrl + redirectParameters;
								}
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
				}
			},

			logout: function() {
				setAuthorizationToken(null);
			},

			getAuthorizationHeader: function() {
				var authorizationToken = sessionStorage[SESSION_AUTHORIZATION_TOKEN];
				if (authorizationToken) {
					return "Bearer " + authorizationToken;
				}
				return null;
			}
		};
	}]);

})();