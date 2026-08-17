# One-time API setup

Keep credentials outside the skill and repository. Do not use `gcloud`'s shared
default OAuth client: Google blocks it for the sensitive Analytics read scope.

1. Confirm the intended Google Cloud project:
   `gcloud config get-value project`
   The OAuth project does not need to own the GSC site or GA4 property. Use a
   small project where the operator can manage OAuth clients and enable APIs. If
   the configured project returns missing `clientauthconfig`, `oauthconfig`, or
   `resourcemanager.projects.get` permissions, select or create another project;
   do not request a broad role such as Firebase Admin just for this CLI.
2. In Google Cloud Console, configure Google Auth Platform for that project:
   - Prefer an Internal audience when the account and project belong to the same
     Google Workspace organization.
   - Otherwise use External + Testing and add the Google account as a test user.
   - Create an OAuth client with application type **Desktop app**.
3. Download the client JSON to a private path outside repositories, for example:
   `$HOME/.config/gcloud/cola-seo-oauth-client.json`
   When browser automation creates the client, do not capture or emit the
   success dialog DOM because it contains the client secret. Trigger **Download
   JSON** directly, then close the dialog.
4. Restrict local file permissions:
   `chmod 600 "$HOME/.config/gcloud/cola-seo-oauth-client.json"`
5. Sign in to `gcloud` if its ordinary user session needs reauthentication:
   `gcloud auth login`
6. Enable the read APIs:
   `gcloud services enable searchconsole.googleapis.com analyticsdata.googleapis.com analyticsadmin.googleapis.com`
7. Create Application Default Credentials with the custom client and read-only
   Google Search Console / Analytics scopes:

   `gcloud auth application-default login --client-id-file="$HOME/.config/gcloud/cola-seo-oauth-client.json" --scopes="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/analytics.readonly"`

8. Complete the consent page personally, then verify without printing a token:
   `node scripts/seo.mjs auth-check`

Never paste the OAuth client JSON or copy it into this skill or a repository. The
Google account must already have read access to `sc-domain:cola.app` and the GA4
property named `Cola`.
