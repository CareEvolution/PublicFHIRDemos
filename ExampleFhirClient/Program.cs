using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Hl7.Fhir.Model;
using Hl7.Fhir.Rest;
using Newtonsoft.Json.Linq;
using FhirModel = Hl7.Fhir.Model;
using FhirModel2 = Hl7.Fhir.Model.DSTU2;
using FhirRest = Hl7.Fhir.Rest;
using Task = System.Threading.Tasks.Task;

namespace ExampleFhirClient
{

	class Program
	{
		static void Main( string[] args )
		{
			/*
			 Authentication requirements to obtain an access token:

				- see https://fhir.docs.careevolution.com/overview/authentication.html

			The example code below illustrates how to:

				using FhirRest.FhirClient: 
				1.  search for patients
				2.  post a resource (DiagnosticReport) for an existing patient
				3.  use a FHIR transaction( http://hl7.org/fhir/DSTU2/http.html#transaction ) to POST a FHIR bundle containing 
					a DiagnosticReport resource + its Patient resource.
				4.  read a patient resource, search for claims.  search for diagnostic reports and read contained observations
				5.  async calls to get rule data and patients

				using HttpClient and json string:
				1.  POST the DiagnosticReport resource json string to FhirEndpoint .../api/fhir/DiagnosticReport

			*/
			var fhirEndPoint = FhirServer + "api/fhir";
			var fhirClient = new FhirRest.FhirDstu2Client(fhirEndPoint);
			var conformance = fhirClient.Metadata();
			var tokenEndpoint = conformance.Rest[0].Security.Extension[0].Extension.FirstOrDefault( e => e.Url.Equals( "token" ) )?.Value;

			var accessToken = AccessTokenHelper.GetAccessToken( FhirServer, tokenEndpoint?.ToString() );
			
			fhirClient.OnBeforeRequest += ( object sender, FhirRest.BeforeRequestEventArgs eventArgs ) =>
			{
				eventArgs.RawRequest.Headers.Add( "Authorization", $"Bearer {accessToken}" );
			};
			fhirClient.OnAfterResponse += ( object sender, FhirRest.AfterResponseEventArgs e ) =>
			{
				Console.WriteLine( "Received response with status: " + e.RawResponse.StatusCode );
			};

			var patients = GetPatients( fhirClient, "TestFhirPost" );
			PostDiagnosticReportForExistingPatient( fhirClient, patients );

			var patient = PostDiagnosticReportForNewPatient( fhirClient );

			PostJsonReport( accessToken, fhirEndPoint, patient.Id );

			PatientData( fhirClient );

			RuleDataAsync( fhirClient ).Wait();

			Console.ReadLine();
		}

		private static List<FhirModel2.Patient> GetPatients( FhirRest.FhirDstu2Client fhirClient, string family )
		{
			var srch = new FhirRest.SearchParams()
				.Where( $"family={family}" )
				.LimitTo( 20 )
				.SummaryOnly()
				.OrderBy( "birthdate",
					FhirRest.SortOrder.Descending );

			var bundle = fhirClient.Search<FhirModel2.Patient>( srch );

			return bundle.Entry.Select( b => b.Resource as FhirModel2.Patient ).ToList();
		}

		private static async Task RuleDataAsync( FhirRest.FhirDstu2Client fhirClient )
		{
			var srchParams = new SearchParams()
				.Where( "title=All Labs" )
				.LimitTo( 10 )
				.SummaryOnly()
				.OrderBy( "title",
					SortOrder.Descending );

			var bundle = fhirClient.Search<FhirModel2.List>( srchParams );
			var list = bundle.Entry.FirstOrDefault()?.Resource as FhirModel2.List;

			if ( list != null )
			{
				var listResource = fhirClient.Read<FhirModel2.List>( FhirRest.ResourceIdentity.Build( "List", list.Id ) );

				Console.WriteLine($"List Summary Narrative: {listResource.Text.Div}");
				var tasks = new List<Task<FhirModel2.Patient>>();

				foreach ( var entryComponent in listResource.Entry )
				{
					var resourceReference = entryComponent.Item;
					tasks.Add( fhirClient.ReadAsync<FhirModel2.Patient>( resourceReference.Url  ) );
				}
				await Task.WhenAll( tasks );

				foreach ( var task in tasks )
				{
					var patient = task.Result;
					Console.WriteLine(
						$"NAME: {patient.Name[ 0 ].Given.FirstOrDefault()} {patient.Name[ 0 ].Family.FirstOrDefault()}" );
				}
			}
		}

		private static void PatientData( FhirRest.FhirDstu2Client fhirClient )
		{
			// search for patient as we don't have a patient ID
			var patients = GetPatients( fhirClient, "JEPPESEN" );

			if ( !patients.Any() ) return;

			var patientResource = fhirClient.Read<FhirModel2.Patient>( FhirRest.ResourceIdentity.Build( "Patient", patients.FirstOrDefault()?.Id ) );
			Console.WriteLine( $" patient name =" + patientResource.Name.FirstOrDefault());
			Console.WriteLine( $" patient birthdate =" + patientResource.BirthDate );
			Console.WriteLine( $" patient gender =" + patientResource.Gender );

			var query = new string[] { $"patient._id={patientResource.Id}" };

			FetchClaims( fhirClient, query );

			FetchDiagnosticReports( fhirClient, query );
		}

		private static void FetchClaims( FhirDstu2Client fhirClient, string [] query )
		{
			var result = fhirClient.Search<FhirModel2.Claim>( query, null, 50 );

			Console.WriteLine( $"total claims = " + result.Total );

			while ( result != null )
			{
				foreach ( var e in result.Entry )
				{
					var claim = (FhirModel2.Claim) e.Resource;
					Console.WriteLine(
						$"Claim Diagnosis: {claim.Diagnosis.FirstOrDefault()?.Diagnosis.Code}" );
					var extension = claim.TypeElement.GetExtension( "http://careevolution.com/fhirextensions#term" );
					Console.WriteLine( $"Claim Type: {( (FhirModel.CodeableConcept) extension?.Value )?.Coding.FirstOrDefault()?.Display}" );

					extension = claim.GetExtensions( "http://careevolution.com/fhirextensions#claim-status" ).FirstOrDefault();
					var status = ( (FhirModel.CodeableConcept) extension?.Value )?.Coding.FirstOrDefault()?.Display;
					Console.WriteLine(
						$"Claim Status: {status}" );
				}

				Console.WriteLine( "Fetching more results..." );
				result = fhirClient.Continue( result );
			}

			Console.WriteLine( "No more claims." );
		}

		private static void FetchDiagnosticReports( FhirDstu2Client fhirClient, string[] query )
		{
			var result = fhirClient.Search<FhirModel2.DiagnosticReport>( query, null, 50 );

			Console.WriteLine( $"total reports = " + result.Total );

			while (result != null )
			{
				foreach (var e in result.Entry )
				{
					var report = (FhirModel2.DiagnosticReport)e.Resource; 

					Console.WriteLine( $"Report LastUpdated: {report.Meta.LastUpdated}" );
					Console.WriteLine( $"Report Status: {report.Status}" );
					Console.WriteLine( $"Report Category: {report.Category.Coding.FirstOrDefault()?.Display}" );
					var observations = report.Result;
					foreach ( var resourceReference in observations )
					{
						var resource = fhirClient.Read<FhirModel2.Observation>(resourceReference.Url);
						Console.WriteLine( $"Observation date: {resource.Effective}" );
						if ( resource.Value is FhirModel.Quantity )
						{
							var value = (FhirModel.Quantity) resource.Value;
							Console.WriteLine( $"Observation value: {value.Value}" );
							Console.WriteLine( $"Observation units: {value.Unit}" );
						}
						else
						{
							Console.WriteLine( $"Observation value: {(( FhirString )resource.Value ).Value}" );
						}
						
					}
					
				}

				Console.WriteLine( "Fetching more results..." );
				result = fhirClient.Continue(result );
			}

			Console.WriteLine( "No more reports." );
		}

		private static void PostDiagnosticReportForExistingPatient( FhirRest.FhirDstu2Client fhirClient, List<FhirModel2.Patient> patients )
		{
			foreach ( var patient in patients )
			{
				var writeable = patient.Identifier.Any( i => i.System == FhirIdSystem );
				if ( !writeable ) continue;

				var report = CreateReport( DateTime.Now );
				report.Subject = new FhirModel2.ResourceReference
				{
					Reference = "Patient/" + patient.Id
				};
				var createdReport = fhirClient.Create( report );
				Console.WriteLine( $"Diagnostic Report Posted.  New Resource Reference = DiagnosticReport/" + createdReport.Id );			
			}
		}

		// post via fhir rest client using bundle transaction returns location url with newly created ID's. 
		private static FhirModel2.Patient PostDiagnosticReportForNewPatient( FhirRest.FhirDstu2Client fhirClient )
		{
			var patientIdentifier = Guid.NewGuid().ToString();
			var patient = CreatePatient( patientIdentifier );
			var report = CreateReport( DateTime.Now );

			// create bundle transaction
			var bundle = new FhirModel2.Bundle { Type = FhirModel.BundleType.Transaction };

			var patientEntry = CreateTransactionBundleEntry( patient, "Patient", FhirModel.HTTPVerb.POST );
			report.Subject = new FhirModel2.ResourceReference( patientEntry.FullUrl );

			var reportEntry = CreateTransactionBundleEntry( report, "DiagnosticReport", FhirModel.HTTPVerb.POST );
			bundle.Entry.Add( patientEntry );
			bundle.Entry.Add( reportEntry ); 

			var bundleResponse = fhirClient.Transaction( bundle );
			foreach ( var bundleResponseEntry in bundleResponse.Entries )
			{
				Console.WriteLine( "response status = " + bundleResponseEntry.Response.Status );
				Console.WriteLine( "location = " + bundleResponseEntry.Response.Location );

				var resource = fhirClient.Get( bundleResponseEntry.Response.Location );
				if ( resource is FhirModel2.Patient )
				{
					patient = (FhirModel2.Patient) resource;
				} else if ( resource is FhirModel2.DiagnosticReport )
				{
					report = (FhirModel2.DiagnosticReport) resource;
				}
			}

			return patient;
		}

		private static FhirModel2.Patient CreatePatient( string patientId )
		{
			return new FhirModel2.Patient
			{
				Identifier = new List<FhirModel2.Identifier> {
					new FhirModel2.Identifier
					{
						Value = patientId
					}
				},
				Name = new List<FhirModel2.HumanName> {
					new FhirModel2.HumanName
					{
						Family =  new[] { "TestFhirPost" },
						Given = new[] { "Miss " + patientId.ToString() },
					}
				},
				Gender = FhirModel.AdministrativeGender.Female,
			};
		}

		private static FhirModel2.DiagnosticReport CreateReport( DateTime reportDate )
		{
			return new FhirModel2.DiagnosticReport
			{
				Identifier = new List<FhirModel2.Identifier>
				{
					new FhirModel2.Identifier( "http://mysystem.org", "PostViaFhir " + Guid.NewGuid() )
				},

				Effective = new FhirModel.FhirDateTime( reportDate ),
				Issued = reportDate,
				Result = new List<FhirModel2.ResourceReference>(),
				Category = new FhirModel.CodeableConcept( "http://terminology.hl7.org/CodeSystem/v2-0074", "MB", "MB Display" ),
				PresentedForm = new List<FhirModel.Attachment>
				{
					new FhirModel.Attachment
					{
						ContentType = "text/plain; charset=UTF-8",
						Data = Encoding.UTF8.GetBytes("More Lab Report Content")
					}
				},
				Code = new FhirModel.CodeableConcept( "http://loinc.org", "632-0" ),
				Status = FhirModel2.DiagnosticReportStatus.Final
			};
		}

		public FhirModel2.Bundle CreateTransactionBundle(
			FhirModel.Resource resource,
			string requestUrl,
			FhirModel.HTTPVerb requestMethod
		)
		{
			var bundle = new FhirModel2.Bundle { Type = FhirModel.BundleType.Transaction };
			bundle.Entry.Add( CreateTransactionBundleEntry( resource, requestUrl, requestMethod ) );
			return bundle;
		}

		public static FhirModel2.Bundle.EntryComponent CreateTransactionBundleEntry(
			FhirModel.Resource resource,
			string requestUrl,
			FhirModel.HTTPVerb requestMethod
		)
		{
			return new FhirModel2.Bundle.EntryComponent
			{
				Request = new FhirModel2.Bundle.RequestComponent { Url = requestUrl, Method = requestMethod },
				FullUrl = "urn:uuid:" + Guid.NewGuid(),
				Resource = resource
			};
		}

		// post via http client using resource in json string.  return data is limited, does return error info, but not newly created ID's. 
		private static void PostJsonReport( string accessToken, string fhirEndPoint, string patientId )
		{			 
			using ( var client = new HttpClient {  BaseAddress = new Uri( fhirEndPoint ) }  )
			{
				var tokenReqMsg = new HttpRequestMessage( HttpMethod.Post, new Uri( $"fhir/DiagnosticReport", UriKind.Relative ) );
				tokenReqMsg.Headers.Authorization = new AuthenticationHeaderValue( "Bearer", accessToken );

				string contentType = "application/json";
				var json = "";
				using ( StreamReader r = new StreamReader( "exampleReport.json" ) )
				{
					json = r.ReadToEnd();
				}

				json = ReplacePatientId( json, patientId );

				tokenReqMsg.Content = new StringContent( json, Encoding.UTF8, contentType );

				var response = client.SendAsync( tokenReqMsg ).Result;

				Console.WriteLine( $"post json response status code = {response.StatusCode}" );

				var result = response.Content.ReadAsStringAsync().Result;
				if ( !string.IsNullOrEmpty( result ) ){
					Console.WriteLine( $"post json report result = {result}" );
				}
			}

		}

		private static string ReplacePatientId( string json, string patientId )
		{
			JObject obj = JObject.Parse( json );
			var subject = obj[ "subject" ];
			subject[ "reference" ] = "Patient/" + patientId;
			return obj.ToString();
		}
		
		private static readonly Uri FhirServer = new Uri( "https://fhir.careevolution.com/Master.Adapter1.WebClient/" );
		private const string FhirIdSystem = "http://fhir.carevolution.com/identifiers/CareEvolution/MRN/FHIR";
		
		//private static readonly Uri FhirServer = new Uri( "https://test-consumers-release-24.x.careev-dev.com/WebClientTest.Adapter1.WebClient/" );
	}
}
