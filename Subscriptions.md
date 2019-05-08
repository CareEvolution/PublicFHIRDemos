# Data set based subscriptions
Data sets are list of resources, with additional properties associated to each resource. They are represented by List - 
like this data set of admitted patients with their primary care physician and complaint as properties:
```json
{
  "resourceType": "List",
  "status": "active",
  "mode": "working",
  "title": "Admissions in last 24 hours",
  "code": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/list-use-codes",
      "code": "data-set"
    }]
  },
  "entry": [
    {
      "item": {
        "reference": "Patient/123"
      },
      "extension": [
        {
          "url": "http://hl7.org/fhir/StructureDefinition/listProperty",
          "extension": [
            {
              "url": "name",
              "valueString": "pcp"
            },
            {
              "url": "value",
              "valueReference": {
                "reference": "Practitioner/abc"
              }
            }
          ]
        },
        {
          "url": "http://hl7.org/fhir/StructureDefinition/listProperty",
          "extension": [
            {
              "url": "name",
              "valueString": "complaint"
            },
            {
              "url": "value",
              "valueCodeableConcept": {
                "coding": [{
                  "system": "http://snomed.info/sct",
                  "code": "386661006",
                  "display": "Fever"
                }]
              }
            }
          ]
        }
      ]
    }
  ],
  "extension": [
    {
      "url": "http://hl7.org/fhir/StructureDefinition/listPropertyDefinition",
      "extension": [
        {
          "url": "name",
          "valueString": "pcp"
        },
        {
          "url": "type",
          "valueCode": "Reference"
        }
      ]
    },
    {
      "url": "http://hl7.org/fhir/StructureDefinition/listPropertyDefinition",
      "extension": [
        {
          "url": "name",
          "valueString": "complaint"
        },
        {
          "url": "type",
          "valueCode": "CodeableConcept"
        }
      ]
    }
  ]
}
```
Note how the List contains both the definition of the properties it supports, and the value of those properties for each entry. 

Data set lists are identified by a `data-set` code (see example above) - so that a client can get a list of all the available data sets. 

Subscriptions can be to the entire data set:
```json
{
  "resourceType": "Subcription",
  "reason": "All admissions",
  "criteria": "List?_id=admissions",
  "channel": {
    "type": "websocket"
  }
}
```
that fires when the data set changes = the List change = resources are added or removed from it 
or any of their associated properties change.

Subscriptions can be to a specific entry of a data set:
```json
{
  "resourceType": "Subcription",
  "reason": "All admissions",
  "criteria": "List?_id=admissions",
  "extension": [{
    "url": "http://hl7.org/fhir/StructureDefinition/subscriptionEntry",
    "valueReference": {
      "reference": "Patient/123"
    }
  }],
  "channel": {
    "type": "websocket"
  }
}
```
that fires when that specific resource is added or removed from the list, or any of its associated properties changes.

Finally, subscriptions can be to a specific property of a data set:
```json
{
  "resourceType": "Subcription",
  "reason": "All admissions",
  "criteria": "List?_id=admissions",
  "extension": [{
    "url": "http://hl7.org/fhir/StructureDefinition/subscriptionProperty",
    "extension": [
      {
        "url": "name",
        "valueString": "pcp"
      },
      {
        "url": "value",
        "valueReference": {
          "reference": "Practitioner/abc"
        }
      }
    ]
  }],
  "channel": {
    "type": "websocket"
  }
}
```
that fires when resources with that specific associated property value are added or removed from the list, 
or any of their associated properties changes (in the example above the subscriptions is for a specific primary care physician).

