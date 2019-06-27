using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography.X509Certificates;

namespace ExampleFhirClient
{
    class CertificateStore
    {
	    public X509Certificate2 GetMostRecentDistinguishedNameCertificate( StoreName storeName, StoreLocation storeLocation, string distinguishedName )
	    {
		    var matchingCerts = GetDistinguishedNameCertificates( storeName, storeLocation, distinguishedName );
		    return GetMostRecentCertificate( matchingCerts );
	    }

	    public IEnumerable<X509Certificate2> GetDistinguishedNameCertificates( StoreName storeName, StoreLocation storeLocation, string distinguishedName )
	    {
		    var store = new X509Store( storeName, storeLocation );
		    try
		    {
			    store.Open( OpenFlags.ReadOnly );

			    var matchingCerts = store.Certificates.Find( X509FindType.FindBySubjectDistinguishedName, distinguishedName, true );
			    return GetValidDateCertificates( matchingCerts.Cast<X509Certificate2>() );
		    }
		    finally
		    {
			    store.Close();
		    }
	    }
	    public X509Certificate2 GetMostRecentCertificate( IEnumerable<X509Certificate2> matchingCerts )
	    {
		    if ( !matchingCerts.Any() ) return null;

		    X509Certificate2 mostRecentCert = null;

		    foreach ( var cert in GetValidDateCertificates( matchingCerts ) )
		    {
			    DateTime? mostRecentCertExpirationDate = null;
			    if ( mostRecentCert != null )
			    {
				    mostRecentCertExpirationDate = mostRecentCert.NotAfter;
			    }
			    DateTime currentCertExpirationDate = cert.NotAfter;

			    if ( mostRecentCert == null || mostRecentCertExpirationDate.GetValueOrDefault( DateTime.MinValue ) < currentCertExpirationDate )
			    {
				    mostRecentCert = cert;
			    }
		    }

		    return mostRecentCert;
	    }

	    public IEnumerable<X509Certificate2> GetValidDateCertificates( IEnumerable<X509Certificate2> matchingCerts )
	    {
		    return matchingCerts.Where( c => IsCertificateValid( c ) );
	    }

	    private static bool IsCertificateValid( X509Certificate2 certificate )
	    {
		    return DateTime.Now >= certificate.NotBefore && DateTime.Now <= certificate.NotAfter;
	    }

	}
}
