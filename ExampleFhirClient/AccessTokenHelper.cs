using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens;
using System.Net.Http;
using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;

namespace ExampleFhirClient
{
	static class AccessTokenHelper
	{
		public static string GetAccessToken( Uri baseAddress )
		{
			var cert = GetClientCertificate( "CN=jwt.careevolution.com" );
			var clientId = "JWTClientCredentials";
			var tokenvalue = CreateClientCredentialsJWT( cert, clientId, baseAddress );

			using ( var client = new HttpClient { BaseAddress = baseAddress } )
			{
				var grantResponse = RequestClientCredentialsJWT( client, clientId, tokenvalue );

				var responseData = grantResponse.Content.ReadAsAsync<Dictionary<string, object>>().Result;
				if ( !responseData.TryGetValue( "access_token", out var accessToken ) )
				{
					return null;
				}
				return accessToken as string;
			}
		}

		private static X509Certificate2 GetClientCertificate( string certName )
		{
			var store = new CertificateStore();
			var cert = store.GetMostRecentDistinguishedNameCertificate( StoreName.My, StoreLocation.LocalMachine, certName );
			return cert;
		}

		private static string CreateClientCredentialsJWT( X509Certificate2 signingCertificate, string clientId, Uri baseAddress, string audience = null, string[] omitHeaders = null )
		{
			var creds = new X509SigningCredentials( signingCertificate );
			if ( audience == null )
			{
				audience = baseAddress.ToString();
			}

			audience += OpenIDConnectToken;
			var issued = DateTime.UtcNow;
			var expires = issued.AddMinutes( 90 );
			var claims = new List<Claim>
			{
				new Claim( "sub", clientId ),
				new Claim( "jti", Guid.NewGuid().ToString() )
			};
			var payload = new JwtPayload( clientId, audience, claims, issued, expires );

			var header = new JwtHeader( creds );
			if ( omitHeaders != null )
			{
				foreach ( var omitHeader in omitHeaders )
				{
					header.Remove( omitHeader );
				}
			}

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
	}
}
