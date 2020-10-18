using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Hl7.Fhir.Rest;
using Hl7.Fhir.Utility;
using Newtonsoft.Json.Linq;
using FhirModel = Hl7.Fhir.Model;
using FhirModel4 = Hl7.Fhir.Model.R4;
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

				using FhirClient: 
				1.  search for patients
				2.  post a resource (DiagnosticReport) for an existing patient
				3.  use a FHIR transaction( http://hl7.org/fhir/R4/http.html#transaction ) to POST a FHIR bundle containing 
					a DiagnosticReport resource + its Patient resource.
				4.  read a patient resource, search for claims.  search for diagnostic reports and read contained observations
				5.  async calls to get rule data and patients

				using HttpClient and json string:
				1.  POST the DiagnosticReport resource json string to FhirEndpoint .../api/fhir/DiagnosticReport

			*/
			var fhirEndPoint = FhirServer + "api/fhir-r4";
			var fhirClient = new FhirR4Client(fhirEndPoint);
			var conformance = fhirClient.Metadata();
			var tokenEndpoint = conformance.Rest[0].Security.Extension[0].Extension.FirstOrDefault( e => e.Url.Equals( "token" ) )?.Value;

			var accessToken = AccessTokenHelper.GetAccessToken( FhirServer, tokenEndpoint?.ToString() );
			
			fhirClient.OnBeforeRequest += ( object sender, BeforeRequestEventArgs eventArgs ) =>
			{
				eventArgs.RawRequest.Headers.Add( "Authorization", $"Bearer {accessToken}" );
			};
			fhirClient.OnAfterResponse += ( object sender, AfterResponseEventArgs e ) =>
			{
				Console.WriteLine( "Received response with status: " + e.RawResponse.StatusCode );
			};

			var patients = GetPatients( fhirClient, "TestFhirPost" );
			PostDiagnosticReportForExistingPatient( fhirClient, patients );

			var patient = PostDiagnosticReportForNewPatient( fhirClient );

			PostJsonReport( accessToken, fhirEndPoint, patient.Id );

			PatientData( fhirClient );

			RuleDataAsync( fhirClient ).Wait();

			Console.WriteLine( "All done." );

			Console.ReadLine();
		}

		private static List<FhirModel4.Patient> GetPatients( FhirR4Client fhirClient, string family )
		{
			var srch = new SearchParams()
				.Where( $"family={family}" )
				.LimitTo( 20 )
				.SummaryOnly()
				.OrderBy( "birthdate",
					SortOrder.Descending );

			var bundle = fhirClient.Search<FhirModel4.Patient>( srch );

			return bundle.Entry.Select( b => b.Resource as FhirModel4.Patient ).ToList();
		}

		private static async Task RuleDataAsync( FhirR4Client fhirClient )
		{
			var srchParams = new SearchParams()
				.Where( "title=All Labs" )
				.LimitTo( 10 )
				.SummaryOnly()
				.OrderBy( "title",
					SortOrder.Descending );

			var bundle = fhirClient.Search<FhirModel4.List>( srchParams );
			var list = bundle.Entry.FirstOrDefault()?.Resource as FhirModel4.List; 
			if ( list != null )
			{
				var listResource = fhirClient.Read<FhirModel4.List>( ResourceIdentity.Build( "List", list.Id ) );

				Console.WriteLine($"List Summary Narrative: {listResource.Text.Div}");
				var tasks = new List<Task<FhirModel4.Patient>>();

				foreach ( var entryComponent in listResource.Entry )
				{
					var resourceReference = entryComponent.Item;
					tasks.Add( fhirClient.ReadAsync<FhirModel4.Patient>( resourceReference.Url  ) );
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

		private static void PatientData( FhirR4Client fhirClient )
		{
			// search for patient as we don't have a patient ID
			var patients = GetPatients( fhirClient, "JEPPESEN" );

			if ( !patients.Any() ) return;

			var patientResource = fhirClient.Read<FhirModel4.Patient>( ResourceIdentity.Build( "Patient", patients.FirstOrDefault()?.Id ) );
			Console.WriteLine( $" patient name =" + patientResource.Name.FirstOrDefault());
			Console.WriteLine( $" patient birthdate =" + patientResource.BirthDate );
			Console.WriteLine( $" patient gender =" + patientResource.Gender );

			var query = new string[] { $"patient._id={patientResource.Id}" };

			FetchClaims( fhirClient, query );

			FetchDiagnosticReports( fhirClient, query );
		}

		private static void FetchClaims( FhirR4Client fhirClient, string [] query )
		{
			var result = fhirClient.Search<FhirModel4.Claim>( query, null, 50 );

			Console.WriteLine( $"total claims = " + result.Total );

			while ( result != null )
			{
				foreach ( var e in result.Entry )
				{
					var claim = (FhirModel4.Claim) e.Resource;
					var diagnosis =  (claim.Diagnosis.FirstOrDefault()?.Diagnosis as FhirModel.CodeableConcept )?.Coding.FirstOrDefault()?.Code;

					Console.WriteLine(
						$"Claim Diagnosis: { diagnosis }" );
					var service = ( claim.Item.FirstOrDefault()?.ProductOrService as FhirModel.CodeableConcept )?.Coding.FirstOrDefault()?.Code;
					Console.WriteLine( $"Service: { service }" );

					var status = claim.Status;
					if (status != null)
					{
						Console.WriteLine(
						$"Claim Status: {((FhirModel.FinancialResourceStatusCodes)status).GetLiteral() }");
					}
					
				}

				Console.WriteLine( "Fetching more results..." );
				result = fhirClient.Continue( result );
			}

			Console.WriteLine( "No more claims." );
		}

		private static void FetchDiagnosticReports( FhirR4Client fhirClient, string[] query )
		{
			var result = fhirClient.Search<FhirModel4.DiagnosticReport>( query, null, 50 );

			Console.WriteLine( $"total reports = " + result.Total );

			while (result != null )
			{
				foreach (var e in result.Entry )
				{
					var report = (FhirModel4.DiagnosticReport)e.Resource; 

					Console.WriteLine( $"Report LastUpdated: {report.Meta.LastUpdated}" );
					Console.WriteLine( $"Report Status: {report.Status}" );
					Console.WriteLine( $"Report Category: {report.Category.FirstOrDefault()?.Coding.FirstOrDefault()?.Display}" );
					var observations = report.Result;
					foreach ( var resourceReference in observations )
					{
						var resource = fhirClient.Read<FhirModel4.Observation>(resourceReference.Url);
						Console.WriteLine( $"Observation date: {resource.Effective}" );
						if ( resource.Value is FhirModel.Quantity )
						{
							var value = (FhirModel.Quantity) resource.Value;
							Console.WriteLine( $"Observation value: {value.Value}" );
							Console.WriteLine( $"Observation units: {value.Unit}" );
						}
						else
						{
							Console.WriteLine( $"Observation value: {(( FhirModel.FhirString )resource.Value ).Value}" );
						}
						
					}
					
				}

				Console.WriteLine( "Fetching more results..." );
				result = fhirClient.Continue(result );
			}

			Console.WriteLine( "No more reports." );
		}

		private static void PostDiagnosticReportForExistingPatient( FhirR4Client fhirClient, List<FhirModel4.Patient> patients )
		{
			foreach ( var patient in patients )
			{
				var writeable = patient.Identifier.Any( i => i.System == FhirIdSystem );
				if ( !writeable ) continue;

				var report = CreateReport( DateTimeOffset.Now );
				report.Subject = new FhirModel.ResourceReference
				{
					Reference = "Patient/" + patient.Id
				};
				var createdReport = fhirClient.Create( report );
				Console.WriteLine( $"Diagnostic Report Posted.  New Resource Reference = DiagnosticReport/" + createdReport.Id );			
			}
		}

		// post via fhir rest client using bundle transaction returns location url with newly created ID's. 
		private static FhirModel4.Patient PostDiagnosticReportForNewPatient( FhirR4Client fhirClient )
		{
			var patientIdentifier = Guid.NewGuid().ToString();
			var patient = CreatePatient( patientIdentifier );
			var report = CreateReport( DateTimeOffset.Now );

			// create bundle transaction
			var bundle = new FhirModel4.Bundle { Type = FhirModel.BundleType.Transaction };

			var patientEntry = CreateTransactionBundleEntry( patient, "Patient", FhirModel.HTTPVerb.POST );
			report.Subject = new FhirModel.ResourceReference( patientEntry.FullUrl );

			var reportEntry = CreateTransactionBundleEntry( report, "DiagnosticReport", FhirModel.HTTPVerb.POST );
			bundle.Entry.Add( patientEntry );
			bundle.Entry.Add( reportEntry );

			var bundleResponse = fhirClient.Transaction( bundle );
			foreach ( var bundleResponseEntry in bundleResponse.Entry )
			{
				Console.WriteLine( "response status = " + bundleResponseEntry.Response.Status );
				Console.WriteLine( "location = " + bundleResponseEntry.Response.Location );

				var resource = fhirClient.Get( bundleResponseEntry.Response.Location );
				if ( resource is FhirModel4.Patient )
				{
					patient = (FhirModel4.Patient) resource;
				} else if ( resource is FhirModel4.DiagnosticReport )
				{
					report = (FhirModel4.DiagnosticReport) resource;
				}
			}

			return patient;
		}

		private static FhirModel4.Patient CreatePatient( string patientId )
		{
			return new FhirModel4.Patient
			{
				Identifier = new List<FhirModel.Identifier> {
					new FhirModel.Identifier
					{
						Value = patientId
					}
				},
				Name = new List<FhirModel4.HumanName> {
					new FhirModel4.HumanName
					{
						Family = "TestFhirPost",
						Given = new[] { "Miss " + patientId.ToString() },
					}
				},
				Gender = FhirModel.AdministrativeGender.Female,
			};
		}

		private static FhirModel4.DiagnosticReport CreateReport( DateTimeOffset reportDate )
		{
			return new FhirModel4.DiagnosticReport
			{
				Identifier = new List<FhirModel.Identifier>
				{
					new FhirModel.Identifier( "http://mysystem.org", "PostViaFhir " + Guid.NewGuid() )
				},

				Effective = new FhirModel.FhirDateTime( reportDate ),
				Issued = reportDate,
				Result = new List<FhirModel.ResourceReference>(),
				Category = new List<FhirModel.CodeableConcept> { new FhirModel.CodeableConcept( "http://terminology.hl7.org/CodeSystem/v2-0074", "MB", "MB Display" ) },
				PresentedForm = new List<FhirModel.Attachment>
				{
					new FhirModel.Attachment
					{
						ContentType = "text/plain; charset=UTF-8",
						Data = Encoding.UTF8.GetBytes("More Lab Report Content")
					}
				},
				Code = new FhirModel.CodeableConcept( "http://loinc.org", "632-0" ),
				Status = FhirModel4.DiagnosticReportStatus.Final
			};
		}

		public FhirModel4.Bundle CreateTransactionBundle(
			FhirModel.Resource resource,
			string requestUrl,
			FhirModel.HTTPVerb requestMethod
		)
		{
			var bundle = new FhirModel4.Bundle { Type = FhirModel.BundleType.Transaction };
			bundle.Entry.Add( CreateTransactionBundleEntry( resource, requestUrl, requestMethod ) );
			return bundle;
		}

		public static FhirModel4.Bundle.EntryComponent CreateTransactionBundleEntry(
			FhirModel.Resource resource,
			string requestUrl,
			FhirModel.HTTPVerb requestMethod
		)
		{
			return new FhirModel4.Bundle.EntryComponent
			{
				Request = new FhirModel4.Bundle.RequestComponent { Url = requestUrl, Method = requestMethod },
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
		
	}
}
