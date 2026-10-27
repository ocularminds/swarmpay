**SwarmPay on the existing Azure infrastructure**

The selected target is `decionis-rg` in Central US, using AKS `decionis-aks`, ACR `decionisacr.azurecr.io`, and hostname `https://swarm.decionis.com`. Azure reads confirmed these resources on October 25, 2026. The cluster runs Kubernetes 1.35 with IPv4 Azure CNI and Azure network policies; its DNS service address is `10.64.0.10`.

Refreshing `az login` using the Decionis runbook established deployment access inside the existing `decionis` namespace. The user explicitly approved using that namespace. Namespace creation and cluster-wide ingress/issuer reads remain unavailable; no roles or access grants were changed. Five dedicated `swarm-pay-*` deployments are healthy, both persistent claims are bound, and private organizer access, Azure intent extraction and actual network/database isolation have passed. **[The public demo](https://swarm.decionis.com) passed HTTPS and browser acceptance on October 25.**

The existing `decionis-nginx` ingress issued a trusted Let's Encrypt certificate for `swarm.decionis.com`, valid until January 23, 2027 at 07:36:24 UTC. TLS and HTTP 200 were verified against the ingress IP before creating the new `swarm` A record, which points to `52.143.254.111` with a 300-second TTL. The DNS write required the record not to exist. The 21 pre-existing deployments retained their generations and available replicas throughout the rollout.

The four application images were published and their registry digests verified on October 25. ACR run `cj3k` succeeded on `linux/amd64` from merged commit `d3ea8602c903e799d4c9d05f15a5e90cdf0328ea` (PR #7), whose [master verification run](https://github.com/ocularminds/swarmpay/actions/runs/40171279032) passed. The [recorded image map](../infra/azure/releases/d3ea860.images.json) can be supplied directly to the renderer for this release. The [deployment record](../infra/azure/releases/2026-10-25.deployment.json) binds the applied manifest hashes and acceptance results. The source/build record remains private under `.local/azure/releases/d3ea8602c903e799d4c9d05f15a5e90cdf0328ea-acr/`.

The public callbacks now use `/webhooks/paypal/tents` and `/webhooks/paypal/catering`. A [recorded configuration update](../infra/azure/releases/2026-10-25.webhook-routes.json) changed only `swarm-pay-nginx-template` and gracefully reloaded the existing web pod after Nginx validation. No image or payment runtime changed. Both new routes reach the executor, legacy paths return 404, and trusted HTTPS, POST-only access and payload limits passed. Both PayPal app registrations match these URLs; the demo executor still returns `SANDBOX_ONLY` until the separate sandbox environment is activated.

The initial hosted bundle uses **Azure AI with simulated payments and a local test authority**. It requires organizer sign-in and keeps those disclosures visible. Hosted Decionis and native PayPal sandbox acceptance remain separate gates in [implementation status](implementation-status.md). The bundle uses dedicated names, selectors, database, credentials and a venue fixture key inside the approved existing namespace. It creates no Namespace object and changes no shared namespace labels.

**What is ready**

| File | Purpose |
| --- | --- |
| [`infra/azure/target.json`](../infra/azure/target.json) | Selected namespace, storage class, existing ingress class/controller peer and DNS-01 issuer |
| [`infra/azure/prepare-secrets.mjs`](../infra/azure/prepare-secrets.mjs) | Owner-only local credential bundle, separate database roles and a host-only venue signing key |
| [`infra/azure/release.mjs`](../infra/azure/release.mjs) | Committed source package, CI check, Azure registry build and verified image digests |
| [`infra/azure/render.mjs`](../infra/azure/render.mjs) | Separate SwarmPay network-policy, private-workload and ingress manifests; immutable ACR image digests required |
| [`demo/hosted/run.mjs`](../demo/hosted/run.mjs) | Isolated HTTPS rehearsal, also run by CI |
| [`demo/check-deployed.mjs`](../demo/check-deployed.mjs) | Explicit public acceptance run with real Azure AI, simulated payments and normal TLS verification |

The manifests use a single replica of each service, ClusterIP services, non-root users, read-only image filesystems, dropped Linux capabilities, RuntimeDefault seccomp and no mounted Kubernetes API credentials. PostgreSQL and the AgentSafe journal have separate `decionis-zrs` volumes. Every resource is prefixed `swarm-pay-`. Even the default-deny policy selects only `app.kubernetes.io/part-of=swarm-pay`; component peers require that label as well. Existing Decionis workloads are outside these selectors. Sharing a namespace does not isolate SwarmPay from an administrator who can modify its resources.

Apply network policies before creating pods. They admit the gateway/payment/database paths and the specifically identified ingress controller. The app cannot contact the executor directly. Webhook routing remains restricted by nginx and the executor's authentication rules; a network policy cannot distinguish HTTP paths. A mounted nginx template uses full Kubernetes service DNS names because nginx's explicit resolver does not apply the pod's search suffixes. The published images remain unchanged.

The Java services and gateway may reach external HTTPS addresses. Private/reserved IPv4 ranges and Azure metadata/platform addresses are excluded. This is not an FQDN allowlist. The policy includes an explicit CoreDNS path. Live checks confirmed app-to-executor timeout by pod IP, gateway-to-executor HTTP 200, refusal of the application's database role at the payment schema, and the absence of PayPal secrets, a venue signing key and a Kubernetes API token in the application. Azure intent extraction succeeded from the AKS application in 5.6 seconds. The private check report is `.local/azure/private-acceptance.json`.

The public acceptance run took 27.5 seconds and verified both Azure assessments, a $1,400 simulated workflow, two separate merchant checkouts, photo-only hold, signed fixture capture, five recorded commands and the application evidence chain. Sign-in/sign-out, anonymous model denial, secure cookies, Origin rejection, private-route rejection, desktop/mobile rendering and a bounded login-rate-limit check also passed. AgentSafe's native journal verified all 26 records with no findings. Private reports, screenshots and exported evidence are under `.local/azure/acceptance-20261025/`. This clean hosted journal does not repair the earlier interrupted local journal.

**Rehearse HTTPS locally**

From the repository root with Docker, Node 22.23.2 and the test browser installed:

```sh
node demo/hosted/run.mjs up
node demo/hosted/run.mjs check
node demo/hosted/run.mjs down
```

For an installed Chrome browser, prefix the check with `SWARM_TEST_BROWSER=chrome`. The fixture serves `https://localhost:5443` with a short-lived, locally generated certificate. It uses the separate Compose project `swarm-pay-hosted-test` and private files under `.local/hosted/`; it neither copies provider credentials nor changes the normal `.env`. The runner trusts that certificate only in its test child processes. Browser certificate bypass is restricted to this localhost fixture and is not a deployment option.

The check covers secure/HttpOnly/SameSite cookies, HTTPS headers, Host/Origin rejection, anonymous model denial, disabled one-click access, invalid and valid organizer passwords, sign-out, both simulated merchant checkouts, signed delivery capture, mobile layout, callback/network isolation and the native AgentSafe journal. All five application containers run with the same user IDs and filesystem restrictions as the planned Kubernetes deployment. This verifies container behavior, not AKS ingress, certificate issuance or CNI enforcement. `down` removes only the disposable rehearsal volumes; it preserves the ordinary local demo and its records.

**Access and existing infrastructure**

Use the human Azure CLI login from the Decionis repository's deployment runbook, followed by `az aks get-credentials` into a private file and `kubelogin convert-kubeconfig -l azurecli`. Do not borrow the separate CI managed identity, change role assignments or request cluster-admin credentials. The approved namespace is `decionis`; the renderer refuses the previously proposed separate namespace.

The deployment inputs were established from namespaced live resources and the Decionis infrastructure manifests:

- Existing ingresses select `decionis-nginx` and report `52.143.254.111`. The Decionis manifest identifies AKS application routing; its existing error-service network policy corroborates namespace `app-routing-system` and controller pod selector `app=nginx-decionis-0`.
- Existing ingresses use `letsencrypt-prod`. The Decionis issuer manifest configures Azure DNS-01 for `decionis.com`. Direct issuer/certificate CRD reads are unavailable to this identity; certificate readiness must be established by a trusted TLS handshake for the new hostname. HTTP-01 requires a separate review of solver access.
- Existing PVCs use `decionis-zrs`, and both new SwarmPay claims bound successfully. This Premium ZRS class has a Retain policy; deleting application resources is not a storage cleanup or backup procedure.
- All four immutable ACR images were pulled and became healthy. In-cluster DNS, the required service paths and real Azure AI connectivity passed. Registry admin credentials remain disabled.

The refreshed kubeconfig is `.local/azure/kubeconfig-decionis-login`, converted to Azure CLI authentication. Always select it explicitly; the prior `.local/azure/kubeconfig` and global Kubernetes context were preserved. No `--admin`, AKS Run Command or self-assigned roles are needed. Resume denied cluster-level checks only after access changes. Certificate and DNS changes remain confined to the new application hostname.

**Build images from a tested merged commit**

From the repository root, use Node 22.23.2, Git, an authenticated `gh` CLI and an Azure CLI identity already authorized for this registry. ACR Tasks builds the images in Azure; no local Docker build or GitHub repository token is uploaded. The registry must retain its verified `LegacyRegistryPermissions` mode. [ACR quick tasks](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-tasks-overview) use Azure build compute and registry storage.

```sh
git fetch origin master
swarm_release_commit=$(git rev-parse origin/master)
node infra/azure/release.mjs prepare "$swarm_release_commit"
node infra/azure/release.mjs submit ".local/azure/releases/$swarm_release_commit"
```

`prepare` accepts a full SHA already merged into `origin/master`. It copies regular Git blobs with their executable modes, so local modifications, line-ending filters, `.env`, credentials, browser reports and database files cannot enter through a working-directory upload. It refuses tracked private paths, symlinks, submodules, known configured credential values and private-key material. This is a targeted safeguard, not a comprehensive secret scanner. The private release directory must be ignored by Git and cannot already exist.

`submit` checks that the exact commit has a successful `master` push run of `verify.yml`, verifies the registry identity, then records submission before making the request. The generated task enables BuildKit and builds all four images for `linux/amd64` before its push step. Tags contain the full commit and a random suffix; the OCI labels record the source repository and revision. Dockerfile paths are relative to the uploaded task root, and the web/gateway build contexts remain scoped to their directories. The source package is reproducible from Git; package downloads during a build can still change the resulting image.

Check the saved run later with a single read:

```sh
node infra/azure/release.mjs collect ".local/azure/releases/$swarm_release_commit"
```

`RUNNING` means no deployable image map is available yet. Only a successful AMD64 run reporting exactly the expected four repository/tag/digest bindings, followed by four matching registry manifest reads, produces `images.json`. It contains the immutable image references accepted by the manifest renderer. Keep `release.json`, the private submission response and `images.json` together: they record the Git tree, file hashes, recipe, CI run, build identity and registry digests. This is local release provenance, not a signed supply-chain attestation or a vulnerability scan. A successful build does not establish AKS pull access or runtime health.

The tool never automatically submits a second build from a release directory; an exclusive `submission.claim` also prevents concurrent callers from dispatching twice. If submission loses its response, retain that claim, the `SUBMISSION_UNKNOWN`/`SUBMITTING` record and private CLI output; inspect Azure's run history before deciding whether another build is appropriate. Azure CLI can suppress JSON with `--no-wait`, so the tool also accepts its exact queued-run receipt from captured stderr. Refused or failed builds need investigation, not repeated access attempts. Preserve failed records and use a new private directory only after the outcome is resolved and a correction is reviewed. Do not delete the record to bypass this check. Build logs may contain private source information and must remain outside Git.

**Deploy into the approved existing namespace**

1. Recheck the target facts above if the cluster changes. Review the resource-name and network-policy selectors before applying to the shared namespace. The renderer refuses missing inputs, mutable image tags, the wrong namespace or a private venue key.
2. Prepare the private credentials once from the configured Azure environment file:

   ```sh
   node infra/azure/prepare-secrets.mjs .env .local/azure/bootstrap-decionis
   ```

   The source must have owner-only permissions. The script preserves it, copies only the Azure model settings (the endpoint alone also goes to `swarm-pay-egress-settings`, the egress proxy's only setting), and generates distinct database passwords, executor/MCP tokens, organizer password and demo venue key. It refuses an existing output directory to avoid silently rotating database credentials. Keep `secrets.json`, `organizer.env` and `venue-private.pem` private and out of source, logs and build contexts. Only `venue-public.pem` is mounted by the application. Kubernetes Secret data is base64 encoding, not encryption; cluster access and storage controls remain required.
3. Finish the source/build procedure above for the reviewed commit. The successful release's `images.json` must have keys `web`, `commerce-app`, `payment-executor`, `agentsafe` and `egress`, each bound to its actual `decionisacr.azurecr.io/swarm-pay/<component>@sha256:<digest>` manifest. Do not hand-fill placeholder digests or substitute mutable tags.
4. Render the release using that verified map (adjust the private directory if a custom one was selected):

   ```sh
   node infra/azure/render.mjs infra/azure/target.json ".local/azure/releases/$swarm_release_commit/images.json" .local/azure/bootstrap-decionis/venue-public.pem .local/azure/release
   ```

   The published release also has a tracked image map at `infra/azure/releases/d3ea860.images.json`. Rendering refuses an existing output directory so old namespace manifests cannot mix with a new release. The initial applied manifests are preserved under `.local/azure/decionis-release-v2/`.
5. Check for name collisions and validate the actual resource manifests and credentials without printing Secret contents. There is no namespace creation step:

   ```sh
   kubectl --kubeconfig .local/azure/kubeconfig-decionis-login -n decionis apply --server-side --field-manager=swarm-pay --dry-run=server -f .local/azure/release/networkPolicies.json
   kubectl --kubeconfig .local/azure/kubeconfig-decionis-login -n decionis apply --server-side --field-manager=swarm-pay --dry-run=server -f .local/azure/bootstrap-decionis/secrets.json
   kubectl --kubeconfig .local/azure/kubeconfig-decionis-login -n decionis apply --server-side --field-manager=swarm-pay --dry-run=server -f .local/azure/release/privateResources.json
   kubectl --kubeconfig .local/azure/kubeconfig-decionis-login -n decionis apply --server-side --field-manager=swarm-pay --dry-run=server -f .local/azure/release/ingress.json
   ```

6. Apply `networkPolicies.json` first, followed by credentials and private workloads, then wait for all five deployments and persistent claims. The initial rollout started PostgreSQL before the application deployments. Before publishing ingress, verify actual pod-to-pod isolation, app-to-executor denial, database role separation, Azure model connectivity, and the sign-in flow through a controlled port-forward using the configured Host/Origin. Avoid printing runtime environments or Secret objects. Preserve this evidence separately from the local fixture results.
7. Review and apply `ingress.json`, wait for a valid certificate, then test the ingress IP with TLS SNI and Host `swarm.decionis.com` (for example, `curl --resolve` without `--insecure`). DNS-01 allows certificate issuance before the public A record. Only after this succeeds, create/update the **`swarm` A record** in the existing `decionis.com` zone to the verified ingress IP. Do not replace the zone, apex, wildcard or records used by other products.
8. Verify public HTTPS, forced HTTP redirect, organizer sign-in/sign-out, anonymous denial, simulated-payment labels, one signed-receipt journey and an evidence export. Check actual ingress rate-limit behavior: the web proxy takes the client address from the ingress's `X-Forwarded-For` (`SWARM_TRUSTED_PROXY`), which is safe only because its network policy admits the ingress controller alone, so several reviewers no longer share one sign-in limit. If the load balancer does not preserve client addresses, the limit is per ingress-visible address instead. Protect the Azure model budget operationally as well. Record the deployed commit, image digests, certificate expiry and verification results in the delivery record.

Once the hosted fixture is live, its separate demo receipt can be signed locally using an exported workflow:

```sh
SWARM_VENUE_PRIVATE_KEY_FILE=.local/azure/bootstrap-decionis/venue-private.pem node demo/sign-receipt.mjs /path/to/workflow.json /path/to/receipt.json
```

The signer remains a demo venue fixture. Do not copy its private key into a pod or expose a signing API.

For a full public acceptance run, install the web dependencies and a Playwright browser, then explicitly run:

```sh
SWARM_TEST_BROWSER=chrome node demo/check-deployed.mjs https://swarm.decionis.com .local/azure/bootstrap-decionis .local/azure/acceptance
```

Choose a new ignored report directory for each run. The script refuses any other host, disabled TLS verification, non-demo payments, a different authority/fixture issuer, exposed PayPal client IDs or one-click organizer access. It makes two real Azure model calls and creates one simulated workflow, checking separate merchant checkouts, photo-only hold, signed fixture capture, evidence export, secure sessions and mobile sign-out. Reports, screenshots and evidence stay private; it does not record a browser trace or print credentials. Ordinary CI continues to use only isolated fixtures. `SWARM_CHECK_LOGIN_LIMIT=1` additionally sends eight invalid sign-ins and requires HTTP 429; the proxy sees the ingress peer, so this optional check can briefly throttle other users' sign-ins too.

**The agent's only route out**

The commerce application (the agents) reaches nothing outside the cluster directly: its NetworkPolicy admits DNS, PostgreSQL, its gateway and the `swarm-pay-egress` proxy on 3128, and nothing else, PayPal included. The JVM sends HTTPS through the proxy (`JAVA_TOOL_OPTIONS`); `java.net.http` and the OpenAI client both honour it. The proxy admits the Azure OpenAI host from `swarm-pay-egress-settings` and, on the hosted gateway, `swarm.decionisedge.com`; it refuses every other host, PayPal by name. A deployment prepared before this change lacks that secret; create it from the endpoint without printing anything:

```sh
node -e "const {parseEnv}=require('node:util');const e=parseEnv(require('node:fs').readFileSync('.env','utf8'));process.stdout.write(e.AZURE_OPENAI_ENDPOINT||e.AZURE_OPENAI_URL)" \
  | kubectl --kubeconfig .local/azure/kubeconfig-decionis-login -n decionis create secret generic swarm-pay-egress-settings --from-file=AZURE_OPENAI_ENDPOINT=/dev/stdin
```

## Hosted AgentSafe endpoints

Decided October 25, 2026: SwarmPay uses the shared hosted AgentSafe gateway at `https://swarm.decionisedge.com` instead of a gateway of its own, in enforcement, under the named Decionis policy `swarm-pay-payments`. The fleet forwards to the executor at its own HTTPS host, admitted from the fleet's egress address only (`20.88.59.229`), and the executor still requires its token on every command. Once the gateway enforces, it holds that token in a key vault of the tenant's own and the application holds only the tenant key.

It depends on two Decionis changes being live: named policies (a bundle's `policy_id`, resolved by id and newest version, and the gateway key bound to it) and the fleet rollout (the shared host on an AgentSafe build with hosted enforcement, the provisioner's enforcement switch on, and the operator's `swarm` tenant pieces: custody vault, address and pods). Until then the steps below stop at shadow.

1. **Executor host.** Pick the executor's hostname (for example `swarm-executor.decionis.com`), then render with `hostedGateway` in the target:

   ```json
   "hostedGateway": {"url": "https://swarm.decionisedge.com", "fleetEgressIp": "20.88.59.229",
     "executorHost": "swarm-executor.decionis.com", "policyVersion": "swarm-pay-sandbox-v1"}
   ```

   The render then sets the app's `AGENTSAFE_URL` to the hosted gateway, runs no AgentSafe in the cluster, admits the ingress controller to the executor, and writes `executorIngress.json`: TLS through the existing ClusterIssuer, `whitelist-source-range` to the fleet address, and only `/internal/payments` and `/.well-known/agentsafe-upstream`. Apply it, wait for the certificate, then add the executor's A record to the ingress IP. Confirm the ingress controller sees client addresses (externalTrafficPolicy `Local`); otherwise the allowlist refuses the fleet too, which fails closed.
2. **Policy.** Publish the named policy with a short-lived administrator key of the SwarmPay workspace, then revoke that key:

   ```sh
   node demo/connect-decionis.mjs .env --admin-key-file .secrets/decionis-admin-key --hosted
   ```

3. **Reserve and activate.** In the Decionis workspace's deployments view, reserve the gateway with the company name `Swarm` (the label becomes `swarm`), then activate it with the executor's origin (`https://swarm-executor.decionis.com`). Put the proof token the workspace shows into the executor's secret and restart it:

   ```sh
   kubectl -n decionis patch secret swarm-pay-payment-secrets --type merge -p "{\"stringData\":{\"AGENTSAFE_UPSTREAM_PROOF\":\"<token>\"}}"
   kubectl -n decionis rollout restart deployment/swarm-pay-payment-executor
   ```

   `GET https://swarm-executor.decionis.com/.well-known/agentsafe-upstream` must return the token from the fleet's address and refuse every other address.
4. **Shadow.** Reveal the tenant key once in the workspace, add it to `swarm-pay-commerce-secrets` as `AGENTSAFE_TENANT_KEY`, and restart the application. In shadow the app still sends the executor token; the executor refuses every command, because a shadow gateway never claims the authority binding the executor requires, so no payment runs. The workspace shows what the policy would have decided.
5. **Enforcement.** Turn enforcement on in the workspace with header `authorization`, value `Bearer <EXECUTOR_TOKEN>` (the executor token from `swarm-pay-payment-secrets`), and policy id `swarm-pay-payments`. Once the workspace shows the gateway enforcing, remove `EXECUTOR_TOKEN` from `swarm-pay-commerce-secrets` and restart the application: it then sends only `AgentSafe-Tenant-Key`, and the gateway presents the executor token itself.
6. **Verify** with `SWARM_EXPECTED_AUTHORITY='AgentSafe hosted gateway · Decionis' SWARM_EXPECTED_POLICY_VERSION=swarm-pay-sandbox-v1 node demo/check-deployed.mjs ...`: an allowed checkout returns `FORWARDED` with a dossier, a refused command never reaches the executor, and with the gateway unreachable nothing executes.

Payments stay simulated (`SWARM_MODE=demo`) on this deployment; the authority is real. The PayPal sandbox remains the separate stack in [sandbox setup](sandbox-setup.md).

**Operating limits and rollback**

This is a small, single-organizer hackathon deployment. PostgreSQL is dedicated to this demo, not the existing shared Azure PostgreSQL server. There is no high-availability database, managed backup policy or zero-downtime session store. Workload updates use `Recreate`; application restarts invalidate organizer sessions. Take and verify private database/journal backups before updates that affect persistent state. Never delete the namespace or PVCs as an application reset; restore or migrate data deliberately if an update fails. Application rollback alone does not reverse a database migration.

Keep public ingress separate so it can be withdrawn while private records are preserved. Pin a reviewed image digest for each rollout. Maintenance or backup jobs need explicit network-policy admission. Azure logs, alerts, backup ownership, certificate renewal, image scanning and end-to-end network-policy checks must be verified on the actual cluster before describing this as an operationally complete service.

Verify the native AgentSafe journal after any abrupt process or storage interruption. The pinned gateway checkpoints periodically, so a crash can leave a reported sequence overlap even when retained record hashes are valid. Preserve the original journal and the failed verifier report; a new clean fixture cannot establish continuity for an interrupted history. See the [observed crash limitation](security-and-reliability.md). Disk-capacity alerts and graceful shutdown are particularly relevant to this deployment.

Native PayPal sandbox and hosted Decionis use a separately configured environment and database. Existing demo records cannot be relabeled as sandbox payments. The pending ngrok option remains callback-only; it is not a way to expose the ordinary one-click local organizer session. See [sandbox setup](sandbox-setup.md) and [security and reliability](security-and-reliability.md).
