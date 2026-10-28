package com.swarmpay.app;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

/** The deployment's origin is configuration, never a forwarded request header. */
final class WebAccessPolicy {
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "[::1]");
    private final Origin publicOrigin;
    private final String configured;

    WebAccessPolicy(String configuredOrigin, boolean secureCookie) {
        publicOrigin = configuredOrigin == null || configuredOrigin.isBlank() ? null : parse(configuredOrigin, true);
        configured = publicOrigin == null ? null : configuredOrigin.replaceAll("/$", "");
        if (publicOrigin != null && (!publicOrigin.scheme().equals("https") || !secureCookie))
            throw new IllegalArgumentException("Hosted access requires an HTTPS SWARM_PUBLIC_ORIGIN and SWARM_SESSION_COOKIE_SECURE=true");
    }

    boolean hosted() { return publicOrigin != null; }
    boolean demoSessionEnabled(String mode) { return mode.equals("demo") && !hosted(); }

    /** The site's own origin: the configured one when hosted, else the loopback host the request was checked against. */
    String origin(String host) {
        if (hosted()) return configured;
        if (!allowsHost(host)) throw invalid();
        return "http://" + host;
    }

    boolean allowsHost(String host) {
        try {
            Origin target = parse((hosted() ? "https" : "http") + "://" + host, false);
            return hosted() ? target.equals(publicOrigin) : LOOPBACK.contains(target.host());
        } catch (IllegalArgumentException ignored) { return false; }
    }

    boolean allowsOrigin(String host, String origin) {
        try {
            Origin browser = parse(origin, false);
            return hosted() ? browser.equals(publicOrigin) : browser.equals(parse("http://" + host, false));
        } catch (IllegalArgumentException ignored) { return false; }
    }

    private static Origin parse(String value, boolean configuration) {
        if (value == null || !value.equals(value.strip())) throw invalid();
        try {
            URI uri = URI.create(value);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost();
            String path = uri.getRawPath();
            if (!Set.of("http", "https").contains(scheme) || host == null || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (path != null && !path.isEmpty() && !(configuration && path.equals("/")))
                || host.endsWith(".") || uri.getPort() == 0 || uri.getPort() > 65535) throw invalid();
            int port = uri.getPort() == -1 ? (scheme.equals("https") ? 443 : 80) : uri.getPort();
            return new Origin(scheme, host.toLowerCase(Locale.ROOT), port);
        } catch (IllegalArgumentException ignored) { throw invalid(); }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Use one valid origin without credentials, a path, a query or a fragment");
    }
    private record Origin(String scheme, String host, int port) {}
}
