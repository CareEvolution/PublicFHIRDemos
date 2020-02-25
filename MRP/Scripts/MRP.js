/* 
 * Copyright (c) 2020, CareEvolution Inc (info@careevolution.com)
 * 
 * This file is licensed under the MIT License - see License.txt
 */

/* global angular */

(function () {

	var MRPApp = angular.module("MRPApp", ["SmartApps"]);

	MRPApp.controller("MRPController", ["$http", "$scope", "authenticator", function($http, $scope, authenticator) {

		var CLIENT_ID = "CareEvolutionMRP";

        $scope.StartupErrorMessage = null;
        $scope.StartupCompleted = false;

        $scope.SearchErrorMessage = null;
        $scope.Searching = false;

        $scope.Reconciliations = [];

        // TODO: search error handling

        var fhirUrl = null;
        var patientID = null;

        authenticator.login(
			CLIENT_ID,
			function(url, id) {
				fhirUrl = url;
				patientID = id;
                $scope.StartupCompleted = true;
                search();
			},
			function(errorMessage) {
				$scope.StartupErrorMessage = errorMessage;
			}
		);

        $scope.refresh = function () {
            search();
        };

        function search() {
            $scope.SearchErrorMessage = null;
            $scope.Searching = true;
            $http({
                // TODO: configurable list of code, use also (optionally) the system
                url: fhirUrl + "/Observation?code=1111F&patient=" + patientID + "&_format=json",
                method: "GET",
                headers: getHeaders()
            }).success(function (data) {
                $scope.Reconciliations = [];
                var encounterIds = [];
                if (data.entry) {
                    for (var i = 0; i < data.entry.length; i++) {
                        var encounterReference = data.entry[i].resource.encounter;
                        if (encounterReference && encounterReference.reference) {
                            var index = encounterReference.reference.lastIndexOf('/');
                            var encounterId = encounterReference.reference.substring(index + 1);
                            encounterIds.push(encounterId);
                        }
                    }
                }
                if (!encounterIds.length) {
                    $scope.Searching = false;
                } else {
                    $http({
                        url: fhirUrl + "/Encounter?_id=" + encounterIds.join() + "&_sort:desc=date&_include=Encounter:location&_include=Encounter:practitioner&_format=json",
                        method: "GET",
                        headers: getHeaders()
                    }).success(function (data) {
                        if (data.entry) {
                            var references = {};
                            for (var i = 0; i < data.entry.length; i++) {
                                var resource = data.entry[i].resource;
                                if (resource.resourceType === "Practitioner") {
                                    references["Practitioner/" + resource.id] = createPractitionerDisplay(resource);
                                } else if (resource.resourceType === "Location") {
                                    references["Location/" + resource.id] = createLocationDisplay(resource);
                                }
                            }
                            for (i = 0; i < data.entry.length; i++) {
                                resource = data.entry[i].resource;
                                if (resource.resourceType === "Encounter") {
                                    var by = [];
                                    if (resource.participant) {
                                        for (var j = 0; j < resource.participant.length; j++) {
                                            var participant = resource.participant[j];
                                            if (participant.individual && references.hasOwnProperty(participant.individual.reference)) {
                                                by.push(references[participant.individual.reference]);
                                            }
                                        }
                                    }
                                    var where = [];
                                    if (resource.location) {
                                        for (j = 0; j < resource.location.length; j++) {
                                            var location = resource.location[j];
                                            if (location.location && references.hasOwnProperty(location.location.reference)) {
                                                where.push(references[location.location.reference]);
                                            }
                                        }
                                    }
                                    var reconciliation = {
                                        when: Date.parse(resource.period.start),
                                        by: by.join(),
                                        where: where.join()
                                    };
                                    $scope.Reconciliations.push(reconciliation);
                                }
                            }
                        }
                        $scope.Searching = false;
                    }).error(function (data, status) {
                        $scope.Searching = false;
                        handleHttpError("Encounters", data, status, function (message) { $scope.SearchErrorMessage = message; });
                    });
                }
            }).error(function (data, status) {
                $scope.Searching = false;
                handleHttpError("Observtions", data, status, function (message) { $scope.SearchErrorMessage = message; });
            });
        }

        function createPractitionerDisplay(practitioner) {
            var name = practitioner.name;
            var display = null;
            if (name) {
                if (name.text) {
                    display = name.text;
                } else {
                    if (name.given) {
                        display = name.given.join(" ");
                    }
                    if (name.family) {
                        if (display) {
                            display += " ";
                        } else {
                            display = "";
                        }
                        display += name.family.join(" ");
                    }
                }
            }
            if (!display) {
                display = "[NO NAME]";
            }
            return display;
        }

        function createLocationDisplay(location) {
            return location.name || "[NO NAME]";
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

    }]);
})();