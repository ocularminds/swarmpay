**SwarmPay on the existing Azure infrastructure**

The selected target is `decionis-rg` in Central US, using AKS `decionis-aks`, ACR `decionisacr.azurecr.io`, and the future hostname `https://swarm.decionis.com`. Azure management-plane reads confirmed these resources on October 25, 2026. The cluster runs Kubernetes 1.35 with IPv4 Azure CNI and Azure network policies; its DNS service address is `10.64.0.10`.

Deployment is pending AKS access. The current CLI identity cannot create namespaces or deployments, or read the ingress classes and certificate issuers. The user is arranging access and explicitly selected Azure as the continuing target. No SwarmPay workloads, role assignments, DNS records or certificates have been created in Azure. The public hostname is not a verified running demo.

The initial hosted bundle uses **Azure AI with simulated payments and a local test authority**. It requires organizer sign-in and keeps those disclosures visible. Hosted Decionis and native PayPal sandbox acceptance remain separate gates in [implementation status](implementation-status.md). The bundle deliberately uses its own namespace, database, credentials and venue fixture key.

**What is ready**

| File | Purpose |
| --- | --- |
| [`infra/azure/target.json`](../infra/azure/target.json) | Confirmed target and explicit empty fields for ingress facts that still need verification |
| [`infra/azure/prepare-secrets.mjs`](../infra/azure/prepare-secrets.mjs) | Owner-only local credential bundle, separate database roles and a host-only venue signing key |
| [`infra/azure/render.mjs`](../infra/azure/render.mjs) | Separate namespace, private workload and public ingress manifests; immutable ACR image digests required |
| [`demo/hosted/run.mjs`](../demo/hosted/run.mjs) | Isolated HTTPS rehearsal, also run by CI |

The manifests use a single replica of each service, ClusterIP services, a restricted pod security namespace, non-root users, read-only image filesystems, dropped Linux capabilities and no mounted Kubernetes API credentials. PostgreSQL and the AgentSafe journal have separate persistent volumes. The network policy starts with ingress/egress denied, then admits the gateway/payment/database paths and the specifically identified ingress controller. The app cannot contact the executor directly. Webhook routing remains restricted by nginx and the executor's authentication rules; a network policy cannot distinguish HTTP paths.

The Java services and gateway may reach external HTTPS addresses. Private/reserved IPv4 ranges and Azure metadata/platform addresses are excluded. This is not an FQDN allowlist. The policy includes an explicit CoreDNS path. These rules have local configuration tests; their enforcement on this AKS cluster still needs a live check.

**Rehearse HTTPS locally**

From the repository root with Docker, Node 22.23.2 and the test browser installed:

```sh
node demo/hosted/run.mjs up
node demo/hosted/run.mjs check
node demo/hosted/run.mjs down
```

For an installed Chrome browser, prefix the check with `SWARM_TEST_BROWSER=chrome`. The fixture serves `https://localhost:5443` with a short-lived, locally generated certificate. It uses the separate Compose project `swarm-pay-hosted-test` and private files under `.local/hosted/`; it neither copies provider credentials nor changes the normal `.env`. The runner trusts that certificate only in its test child processes. Browser certificate bypass is restricted to this localhost fixture and is not a deployment option.

The check covers secure/HttpOnly/SameSite cookies, HTTPS headers, Host/Origin rejection, anonymous model denial, disabled one-click access, invalid and valid organizer passwords, sign-out, both simulated merchant checkouts, signed delivery capture, mobile layout, callback/network isolation and the native AgentSafe journal. All five application containers run with the same user IDs and filesystem restrictions as the planned Kubernetes deployment. This verifies container behavior, not AKS ingress, certificate issuance or CNI enforcement. `down` removes only the disposable rehearsal volumes; it preserves the ordinary local demo and its records.

**Access handoff**

An administrator needs to pre-create the `swarm-pay-demo` namespace with the renderer's restricted pod security labels. Namespace creation is a cluster-scoped action. [Azure Kubernetes Service RBAC Writer](https://learn.microsoft.com/en-us/azure/aks/manage-azure-rbac), scoped to this namespace, can then cover the workload, Secret and NetworkPolicy changes; it does not permit creating the namespace or assigning roles. Keep the application identity free of role-assignment permissions.

The administrator also needs to supply or verify the following existing infrastructure facts:

- An ingress class whose controller is `k8s.io/ingress-nginx`, its controller namespace and exact pod labels, and whether its own egress policy permits the new service. A different ingress implementation needs a reviewed manifest adaptation.
- A working cert-manager DNS-01 `ClusterIssuer` authorized for `decionis.com`. HTTP-01 is not accepted by this bundle because the default-deny policy would also need separately reviewed solver-pod access.
- The ingress service actually bound to the existing public IP `52.143.254.111` (`decionis-ingress-pip`). Its association with this controller has not yet been verified.
- A usable default storage class for the two ReadWriteOnce claims, available node capacity, and the expected CoreDNS labels `k8s-app=kube-dns` in `kube-system`.
- Permission to publish the four `swarm-pay/*` repositories to the existing ACR, and the AKS kubelet's corresponding image-pull access. Use roles appropriate to the registry's permissions mode; registry admin credentials remain disabled.

The existing user kubeconfig is kept privately at `.local/azure/kubeconfig`, converted to Azure CLI authentication. Always select it explicitly; do not change the user's global Kubernetes context. No `--admin`, AKS Run Command or self-assigned roles are needed. Resume denied Kubernetes checks only after access changes. Certificate and DNS changes remain confined to the new application hostname.

**Prepare the release after access is available**

1. Verify the infrastructure facts above and fill the empty ingress/issuer fields in `infra/azure/target.json`. Keep the confirmed resource group, namespace, host and DNS resolver. The renderer refuses unverified fields, mutable image tags, or a private venue key.
2. Prepare the private credentials once from the configured Azure environment file:

   ```sh
   node infra/azure/prepare-secrets.mjs .env .local/azure/bootstrap
   ```

   The source must have owner-only permissions. The script preserves it, copies only the Azure model settings, and generates distinct database passwords, executor/MCP tokens, organizer password and demo venue key. It refuses an existing output directory to avoid silently rotating database credentials. Keep `secrets.json`, `organizer.env` and `venue-private.pem` private and out of source, logs and build contexts. Only `venue-public.pem` is mounted by the application. Kubernetes Secret data is base64 encoding, not encryption; cluster access and storage controls remain required.
3. Build from the reviewed commit for the cluster's node architecture and publish four images to the existing registry: `swarm-pay/web` from `apps/web/Dockerfile`, `swarm-pay/agentsafe` from `infra/agentsafe/Dockerfile`, and the two Java services from `infra/java.Dockerfile` with the appropriate `APP` build argument. The web and gateway build contexts are their respective directories; the Java context is the repository root. Use the deployed commit as the release tag and resolve the registry digests after publishing. Do not upload a source context containing private files. No images have been published by this phase.
4. Write `.local/azure/images.json` as a JSON object with keys `web`, `commerce-app`, `payment-executor`, and `agentsafe`. Each value must be the corresponding `decionisacr.azurecr.io/swarm-pay/<component>@sha256:<actual registry digest>` reference. Render the release:

   ```sh
   node infra/azure/render.mjs infra/azure/target.json .local/azure/images.json .local/azure/bootstrap/venue-public.pem .local/azure/release
   ```

5. Have the administrator create/review `namespace.json`. Once namespace-scoped access works, validate the actual resource manifests and credentials without printing Secret contents:

   ```sh
   kubectl --kubeconfig .local/azure/kubeconfig apply --dry-run=server -f .local/azure/bootstrap/secrets.json
   kubectl --kubeconfig .local/azure/kubeconfig apply --dry-run=server -f .local/azure/release/privateResources.json
   kubectl --kubeconfig .local/azure/kubeconfig apply --dry-run=server -f .local/azure/release/ingress.json
   ```

6. Apply credentials and private workloads first, then wait for all five deployments and persistent claims. Before publishing ingress, verify actual pod-to-pod isolation, app-to-executor denial, database role separation, Azure model connectivity, and the sign-in flow through a controlled port-forward using the configured Host/Origin. Avoid printing runtime environments or Secret objects. Preserve this evidence separately from the local fixture results.
7. Review and apply `ingress.json`, wait for a valid certificate, then test the ingress IP with TLS SNI and Host `swarm.decionis.com` (for example, `curl --resolve` without `--insecure`). DNS-01 allows certificate issuance before the public A record. Only after this succeeds, create/update the **`swarm` A record** in the existing `decionis.com` zone to the verified ingress IP. Do not replace the zone, apex, wildcard or records used by other products.
8. Verify public HTTPS, forced HTTP redirect, organizer sign-in/sign-out, anonymous denial, simulated-payment labels, one signed-receipt journey and an evidence export. Check actual ingress rate-limit behavior: the app proxy sees the ingress peer, so its limits are shared across clients; it does not trust arbitrary forwarded client addresses. Protect the Azure model budget operationally as well. Record the deployed commit, image digests, certificate expiry and verification results in the delivery record.

Once the hosted fixture is live, its separate demo receipt can be signed locally using an exported workflow:

```sh
SWARM_VENUE_PRIVATE_KEY_FILE=.local/azure/bootstrap/venue-private.pem node demo/sign-receipt.mjs /path/to/workflow.json /path/to/receipt.json
```

The signer remains a demo venue fixture. Do not copy its private key into a pod or expose a signing API.

**Operating limits and rollback**

This is a small, single-organizer hackathon deployment. PostgreSQL is dedicated to this demo, not the existing shared Azure PostgreSQL server. There is no high-availability database, managed backup policy or zero-downtime session store. Workload updates use `Recreate`; application restarts invalidate organizer sessions. Take and verify private database/journal backups before updates that affect persistent state. Never delete the namespace or PVCs as an application reset; restore or migrate data deliberately if an update fails. Application rollback alone does not reverse a database migration.

Keep public ingress separate so it can be withdrawn while private records are preserved. Pin a reviewed image digest for each rollout. Maintenance or backup jobs need explicit network-policy admission. Azure logs, alerts, backup ownership, certificate renewal, image scanning and end-to-end network-policy checks must be verified on the actual cluster before describing this as an operationally complete service.

Verify the native AgentSafe journal after any abrupt process or storage interruption. The pinned gateway checkpoints periodically, so a crash can leave a reported sequence overlap even when retained record hashes are valid. Preserve the original journal and the failed verifier report; a new clean fixture cannot establish continuity for an interrupted history. See the [observed crash limitation](security-and-reliability.md). Disk-capacity alerts and graceful shutdown are particularly relevant to this deployment.

Native PayPal sandbox and hosted Decionis use a separately configured environment and database. Existing demo records cannot be relabeled as sandbox payments. The pending ngrok option remains callback-only; it is not a way to expose the ordinary one-click local organizer session. See [sandbox setup](sandbox-setup.md) and [security and reliability](security-and-reliability.md).
