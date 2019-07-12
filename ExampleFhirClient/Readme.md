# ExampleFhirClient

Very Basic Simple Microsoft C# command line program to search, read and post information to/from the CareEvolution FHIR server.

## Authentication
   
This application is using a JWT token to request an OAuth 2.0 access token and client authentication. The application uses the jwt.careevolution.com certificate and expects the OAuth client configuration (id: JWTClientCredentials). The signing certificate is available here: https://fhir.careevolution.com/jwt.pfx with password == `jwt.careevolution.com`. In a real production environment you would provide your own signing certificate and provide CareEvolution its public key to configure an OAuth Client for your authorization and access token.

For more authentication information: https://github.com/HL7/bulk-data/blob/master/spec/authorization/index.md#obtaining-an-access-token

## Basic usage

Download the jwt.careevolution.com certificate and import it into your local computer certificate store under Trusted People. In Visual Studio (or preferred C# editor), open the ExampleFhirClient program and run it. The output will display in the open dialog box.

The Examples Include:

_Using Hl7.Fhir.Rest... FhirClient_
1.  Search for patients.
2.  Post a resource (DiagnosticReport) for an existing patient.
3.  Use a FHIR transaction( http://hl7.org/fhir/DSTU2/http.html#transaction ) to POST a FHIR bundle containing a DiagnosticReport resource and its Patient resource.
4.  Read a Patient resource and search for Claims and DiagnosticReports. While fetching the DiagnosticReport read each contained Observation.
5.  Async calls to get the List resource and read for patients in list.

_Using HttpClient_
1.  POST the DiagnosticReport resource json string to FhirEndpoint .../api/fhir/DiagnosticReport
