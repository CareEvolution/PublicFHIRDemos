# Data set based subscriptions
Data sets are list of resources, with additional properties associated to each resource. They are represented by List - 
like this data set of admitted patients with their primary care physician as an property:
```json
{
  "id": "admissions",
  "resourceType": "List",
  "status": "active",
  "mode": "working",
  "title": "Admissions in last 24 hours",
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
        }
      ]
    }
  ]
}
```

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
that fire when the data set changes = the List change = resources are added or removed from it 
or some of their associated properties change.

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

