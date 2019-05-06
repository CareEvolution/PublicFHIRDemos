/* 
 * Copyright (c) 2019, CareEvolution Inc (info@careevolution.com)
 * 
 * This file is licensed under the MIT License - see License.txt
 */

/* global angular */

(function () {
	var app = angular.module("SubsApp", ["SmartApps"]);

    app.controller("SubsController", ["$http", "$scope", "authenticator", function($http, $scope, authenticator) {

        var clientID = "Subs";
        var clientSecret = null;
        var scope = "user/*.read";

        $scope.StartupErrorMessage = null;
        $scope.FhirUrl = null;
        $scope.WebSocketUrl = null;

        $scope.Subscriptions = null;

        $scope.ErrorMessage = null;
        $scope.Criteria = null;
        $scope.Executing = false;
        $scope.ResultEntries = null;
        $scope.ListPatients = null;

        var activeWebSocket = null;

        authenticator.login(
            clientID,
            function (url, id) {
                $scope.FhirUrl = url;
            },
            function (errorMessage) {
                $scope.StartupErrorMessage = errorMessage;
            },
            scope,
            clientSecret
        );

        function onError(message) {
            $scope.ErrorMessage = message;
        }

        function onHttpError(call, data, status) {
            if (status === 401) {
                onError(call + " failed: not authorized. Please sign in again");
                authenticator.logout();
            } else if (data && data.issue && data.issue.length > 0 && data.issue[0].details && data.issue[0].details.text) {
                onError(call + " failed: " + data.issue[0].details.text);
            } else if (status === 0) {
                onError(call + " failed: cannot connect to " + $scope.FhirUrl);
            } else {
                onError(call + " failed with error " + status);
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

        function onMessage(message) {
            if (message.substring(0, 5) === "ping ") {
                var subscriptionId = message.substring(5);
                var subscription = findSubscriptionById(subscriptionId);
                if (!subscription) {
                    console.trace("Unknown subscription '" + subscriptionId + "'");
                } else {
                    subscription.count++;
                    if (subscription.criteria === $scope.Criteria) {
                        $scope.search();
                    }
                }
            }
        }

        $scope.dismissErrorMessage = function() {
            $scope.ErrorMessage = null;
        };

        $scope.setExpanded = function (entry, expanded) {
            entry.expanded = expanded;
        };

        $scope.search = function() {
            if ($scope.Criteria) {
                $scope.Executing = true;
                $scope.ResultEntries = null;
                $scope.ErrorMessage = null;
                $http({
                    url: $scope.FhirUrl + "/" + $scope.Criteria,
                    method: "GET",
                    headers: getHeaders()
                }).success(function (data) {
                    $scope.Executing = false;
                    $scope.ListPatients = null;
                    if (data.entry && data.entry.length === 1 && data.entry[0].resource.resourceType === "List") {
                        var list = data.entry[0].resource;
                        var patientIds = [];
                        if (list.entry) {
                            angular.forEach(list.entry, function (listEntry) {
                                if (listEntry.item && listEntry.item.reference) {
                                    var segments = listEntry.item.reference.split("/");
                                    if (segments.length >= 2 && segments[segments.length - 2] === "Patient") {
                                        patientIds.push(segments[segments.length - 1]);
                                    }
                                }
                            });
                        }
                        getPatients(patientIds);
                        $scope.ResultEntries = null;
                    } else {
                        var resultEntries = [];
                        if (data.entry) {
                            angular.forEach(data.entry, function (entry) {
                                var resultEntry = {
                                    fullUrl: entry.fullUrl,
                                    title: entry.fullUrl.substr($scope.FhirUrl.length + 1),
                                    content: JSON.stringify(entry.resource, null, 4),
                                    expanded: false
                                };
                                resultEntries.push(resultEntry);
                            });
                        }
                        $scope.ResultEntries = resultEntries;
                    }
                }).error(function (data, status) {
                    $scope.Executing = false;
                    onHttpError("Search", data, status);
                });
            }
        };

        $scope.subscribe = function () {
            getWebSocketUrl(createSubscription);
        };

        function getWebSocketUrl(onSuccess) {
            if ($scope.WebSocketUrl) {
                onSuccess();
            } else {
                $scope.Executing = true;
                $scope.ErrorMessage = null;
                $http({
                    url: $scope.FhirUrl + "/metadata",
                    method: "GET"
                }).success(function (data) {
                    $scope.Executing = false;
                    if (data && data.rest && data.rest.length > 0 && data.rest[0].extension) {
                        var extensions = data.rest[0].extension;
                        for (var i = 0; i < extensions.length; i++) {
                            var extension = extensions[i];
                            if (extension.url === "http://hl7.org/fhir/StructureDefinition/capabilitystatement-websocket") {
                                $scope.WebSocketUrl = extension.valueUri;
                            }
                        }
                    }
                    if ($scope.WebSocketUrl) {
                        var wsImplementation = window.WebSocket || window.MozWebSocket;

                        // create a new websocket and connect
                        var webSocket = new wsImplementation($scope.WebSocketUrl);
                        // when data is comming from the server, this metod is called
                        webSocket.onmessage = function (evt) {
                            console.trace("Received message: " + evt.data);
                            onMessage(evt.data);
                        };
                        // when the connection is established, this method is called
                        webSocket.onopen = function () {
                            console.trace("Web socket opened");
                            activeWebSocket = webSocket;
                            onSuccess();
                        };
                        // when the connection is closed, this method is called
                        webSocket.onclose = function () {
                            console.trace("Web socket closed");
                            activeWebSocket = null;
                        };
                    } else {
                        onError("The server does not publish a Web socket URL");
                    }
                }).error(function (data, status) {
                    $scope.Executing = false;
                    onHttpError("Get conformance", data, status);
                });
            }
        }

        function createSubscription() {
            if (findSubscriptionByCriteria($scope.Criteria)) {
                return;
            }
            $scope.Executing = true;
            $scope.ErrorMessage = null;
            $http({
                url: $scope.FhirUrl + "/Subscription",
                method: "POST",
                headers: getHeaders(),
                data: {
                    status: "active",
                    resourceType: "Subscription",
                    reason: "Subs app",
                    criteria: $scope.Criteria,
                    channel: {
                        type: "websocket"
                    }
                }
            }).success(function (data, status, headers) {
                $scope.Executing = false;
                var subscriptionId = null;
                if (data && data.id) {
                    subscriptionId = data.id;
                } else {
                    var locationHeader = headers("Location");
                    if (!locationHeader) {
                        onError("Create Subscription did not return a Location header");
                    } else {
                        subscriptionId = locationHeader.substring(locationHeader.lastIndexOf("/") + 1);
                    }
                }
                subscription = findSubscriptionById(subscriptionId);
                if (subscription) {
                    subscription.criteria = $scope.Criteria;
                } else {
                    addSubscription(subscriptionId, $scope.Criteria);
                }
                if (activeWebSocket) {
                    activeWebSocket.send("bind " + subscriptionId);
                    console.trace("Binding to " + subscriptionId);
                }
            }).error(function (data, status) {
                $scope.Executing = false;
                onHttpError("Create Subscription", data, status);
            });
        }

        function findSubscription(match) {
            if ($scope.Subscriptions) {
                for (var i = 0; i < $scope.Subscriptions.length; i++) {
                    var subscription = $scope.Subscriptions[i];
                    if (match(subscription)) {
                        return subscription;
                    }
                }
            }
            return null;
        }

        function findSubscriptionById(id) {
            if ($scope.Subscriptions) {
                for (var i = 0; i < $scope.Subscriptions.length; i++) {
                    var subscription = $scope.Subscriptions[i];
                    if (subscription.id === id) {
                        return subscription;
                    }
                }
            }
            return null;
        }

        function findSubscriptionByCriteria(criteria) {
            return findSubscription(function (subscription) { subscription.criteria === criteria; });
        }

        function addSubscription(id, criteria) {
            if (!$scope.Subscriptions) {
                $scope.Subscriptions = [];
            }
            $scope.Subscriptions.push({ id: id, criteria: criteria, count: 0 });
        }

        function getPatients(patientIds) {
            $scope.ListPatients = [];
            if (patientIds && patientIds.length > 0) {
                $scope.Executing = true;
                $scope.ErrorMessage = null;
                $http({
                    url: $scope.FhirUrl + "/Patient?_id=" + patientIds.join(","),
                    method: "GET",
                    headers: getHeaders()
                }).success(function (data) {
                    $scope.Executing = false;
                    var patientsById = {};
                    if (data.entry) {
                        angular.forEach(data.entry, function (entry) {
                            var patientResource = entry.resource;
                            patientsById[patientResource.id] = {
                                name: getPatientName(patientResource.name) || "== unnamed == (" + patientResource.id + ")" 
                            };
                        });
                    }
                    // We want the patient in the same order as their ids
                    var patients = [];
                    angular.forEach(patientIds, function (patientId) {
                        if (patientId in patientsById) {
                            patients.push(patientsById[patientId]);
                        }
                    });
                    $scope.ListPatients = patients;
                }).error(function (data, status) {
                    $scope.Executing = false;
                    onHttpError("Get patients", data, status);
                });
            }
        }

        function getPatientName(names) {
            if (!names || names.length === 0) {
                return null;
            }
            var name = names[0];    // TODO: better logic
            var nameParts = name.given || [];
            if (name.family) {
                if (angular.isArray(name.family)) {
                    nameParts.concat(name.family);
                } else {
                    nameParts.push(name.family);
                }
            }
            return nameParts.join(" ");
        }

    }]);
})();