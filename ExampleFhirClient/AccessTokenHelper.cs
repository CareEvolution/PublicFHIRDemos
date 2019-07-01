using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;

namespace ExampleFhirClient
{
	static class AccessTokenHelper
	{
		public static string GetAccessToken( Uri fhirServer )
		{
			var httpClient = new HttpClient { BaseAddress = fhirServer };

			var cert = GetClientCertificate();
			
			var tokenvalue = CreateClientCredentialsJWT( cert, OauthClientId, fhirServer );

			using ( httpClient )
			{
				var grantResponse = RequestClientCredentialsJWT( httpClient, OauthClientId, tokenvalue );

				var responseData = grantResponse.Content.ReadAsAsync<Dictionary<string, object>>().Result;
				if ( !responseData.TryGetValue( "access_token", out var accessToken ) )
				{
					return null;
				}
				return accessToken as string;
			}
		}

		private static X509Certificate2 GetClientCertificate()
		{
			var store = new X509Store( StoreName.My, StoreLocation.LocalMachine );
			try
			{
				store.Open(OpenFlags.ReadOnly);

				var matchingCerts = store.Certificates.Find(X509FindType.FindBySubjectDistinguishedName, CertName, true).Cast<X509Certificate2>();
				return matchingCerts.FirstOrDefault( certificate => DateTime.Now >= certificate.NotBefore && DateTime.Now <= certificate.NotAfter );
			}
			finally
			{
				store.Close();
			}
		}
		
		private static string CreateClientCredentialsJWT( X509Certificate2 signingCertificate, string clientId, Uri baseAddress )
		{
			var creds = new X509SigningCredentials( signingCertificate );
			
			var issued = DateTime.UtcNow;
			var expires = issued.AddMinutes( 90 );
			var claims = new List<Claim>
			{
				new Claim( "sub", clientId ),
				new Claim( "jti", Guid.NewGuid().ToString() )
			};
			var audience = baseAddress + OpenIDConnectToken;
			var payload = new JwtPayload( clientId, audience, claims, issued, expires );

			var header = new JwtHeader( creds );
			
			var token = new JwtSecurityToken( header, payload );
			var tokenEncoded = new JwtSecurityTokenHandler().WriteToken( token );

			return tokenEncoded;
		}

		private static HttpResponseMessage RequestClientCredentialsJWT( HttpClient client, string clientId, string tokenvalue )
		{
			var grantRequest = new Dictionary<string, string>
			{
				{ "client_id", clientId },
				{ "grant_type", "client_credentials" },
				{ "client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" },
				{ "client_assertion", tokenvalue },
				{ "scope", "system/*.read" },
			};

			var grantResponse = client.PostAsync( OpenIDConnectToken, new FormUrlEncodedContent( grantRequest ) ).Result;
			return grantResponse;
		}

		private static readonly string OpenIDConnectToken = $"identityserver/connect/token";
		private static readonly string CertName = "CN=jwt.careevolution.com";
		private static readonly string OauthClientId = "JWTClientCredentials";
	}
}
