# Walkthrough: backend services connections

Orchestrate Server ingests data from other systems that authenticate using the [FHIR Backend Services standard](https://hl7.org/fhir/smart-app-launch/backend-services.html). The scripts in this folder simulate the basic behavior of one of those services:

- Obtaining an access token using [certificate-based authentication](https://build.fhir.org/ig/HL7/smart-app-launch/client-confidential-asymmetric.html)
- Inserting, updating, and deleting FHIR data

## Prerequisites

Python 3.10 or higher. Use a virtual environment,

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Administrative access to the Orchestrate Server, or someone who can add your public key to the Orchestrate Server.

## Create a key pair

The `create-signingkey.py` script in this quickstart sample generates a key pair and emits the public key, but any RSA key should work. *Note: This walkthrough assumes a development/testing environment that does not contain PHI. For real data you would put more thought into managing this private key.*

## Configure Orchestrate Server to trust the public key

1. In `Security -> Users`, click `Add`.
2. Assign a user ID. This will be the **Client ID** you use when requesting an access token later.
3. Assign first and last name.
4. Click `Assign New` beside the keyset dropdown.
5. Paste the public key you generated in the previous step, then click `Create new key` and `Save` in the keyset dialog.
6. Assign the `Driver` role in the `Assigned Roles` section.
7. Assign `system/*.*` in the `Allowed Scopes` section.
8. Click `Save` again in the user screen to finish creating the user and keyset.

## Obtain an access token

Anything that implements the [FHIR Backend Service standard](https://hl7.org/fhir/smart-app-launch/backend-services.html#step-3-access-token) can obtain a token by sending the user ID you created above as the client ID in the OAuth2 token request. The `get-accesstoken.py` script in this quickstart is an example.

Example:

```bash
python get-accesstoken.py --server "https://your-orchestrate-server" --client-id "my_user"
```

## Modify FHIR data

Anything that supports the FHIR standard and has a valid, properly scoped token can add or modify data in Orchestrate Server. The `add-fhir-data.py` script in this quickstart is an example.

Example:

```bash
python add-fhir-data.py --server "https://your-orchestrate-server" --token "***"
```

After the script succeeds, you should see Bilbo Baggins appear in the patient list when you search as an administrator.

Note the distinction between `Patient` and `Person` in FHIR. Writes should target the read/write endpoint, which is the endpoint whose `patientRecordsHandling` value is `Separate`. Reads that return combined persons should target the read-only endpoint, which is the endpoint whose `patientRecordsHandling` value is `Merge`. In many environments those endpoints are exposed with prefixes such as `r4records` and `r4`, but clients should rely on the metadata returned from `/api/info` rather than hardcoded prefixes.

See also the Additional Resources section below for more background on the FHIR concepts involved.

## Delete FHIR data

The `cleanup-fhir-data.py` script removes the sample data created by the earlier script.

Example:

```bash
python cleanup-fhir-data.py --server "https://your-orchestrate-server" --token "***"
```

## Additional Resources

- [Orchestrate Server documentation](https://orchestrate.docs.careevolution.com/server/)
- FHIR resource documentation for your environment is available at `https://your-orchestrate-server/docs/fhir/r4`
- [FHIR specification](https://hl7.org/fhir/)
- [SMART on FHIR documentation](https://docs.smarthealthit.org/)
