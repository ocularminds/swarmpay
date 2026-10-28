package com.swarmpay.app;

import com.swarmpay.domain.CommerceException;
import com.swarmpay.integrations.Json;
import com.swarmpay.integrations.RuntimeSettings;
import com.swarmpay.persistence.OrganizerAccounts;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Sign-up and sign-in with PayPal. The app sends the browser to PayPal and, when PayPal sends it
 * back, hands the one-time code to the separate sign-in service: the app, where the agents run,
 * never reaches PayPal and never holds the login secret. The first sign-in creates the organizer's
 * account from their PayPal name and email; later ones sign them back in to the same plans.
 */
@RestController
class PayPalSignIn {
    static final String STATE_COOKIE = "SWARM_PAYPAL_STATE";
    static final String DISPLAY_NAME = "swarm.displayName";
    static final String AUTHORIZE = "https://www.sandbox.paypal.com/signin/authorize";
    /** What the sign-in service answers: who signed in, never PayPal's tokens. */
    record Identity(String userId, String payerId, String name, String email, boolean emailVerified, boolean verifiedAccount) {}

    private static final SecureRandom RANDOM = new SecureRandom();
    private final String clientId, identityUrl, identityToken;
    private final boolean secureCookie;
    private final WebAccessPolicy access;
    private final OrganizerAccounts accounts;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();

    @Autowired PayPalSignIn(WebAccessPolicy access, OrganizerAccounts accounts, @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie) {
        this(access, accounts, secureCookie, RuntimeSettings.value("PAYPAL_LOGIN_CLIENT_ID", ""),
            RuntimeSettings.value("IDENTITY_URL", "http://identity:8085"), RuntimeSettings.optionalSecret("IDENTITY_TOKEN"));
    }
    PayPalSignIn(WebAccessPolicy access, OrganizerAccounts accounts, boolean secureCookie, String clientId, String identityUrl, String identityToken) {
        this.access = access; this.accounts = accounts; this.secureCookie = secureCookie;
        this.clientId = clientId; this.identityUrl = identityUrl; this.identityToken = identityToken;
    }

    boolean enabled() { return !clientId.isBlank() && identityToken != null; }

    @GetMapping("/api/paypal/start") ResponseEntity<Void> start(HttpServletRequest request) {
        if (!enabled()) throw new CommerceException("PAYPAL_SIGN_IN_DISABLED", "Sign-in with PayPal is not configured", 404);
        byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        var query = new LinkedHashMap<String, String>();
        query.put("flowEntry", "static"); query.put("client_id", clientId); query.put("response_type", "code");
        query.put("scope", "openid profile email"); query.put("redirect_uri", returnUrl(request)); query.put("state", state);
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, AUTHORIZE + "?" + encode(query))
            .header(HttpHeaders.SET_COOKIE, stateCookie(state, Duration.ofMinutes(10)).toString()).header(HttpHeaders.CACHE_CONTROL, "no-store").build();
    }

    /** PayPal's redirect back. Every outcome returns to the landing; only a matching state and a confirmed code sign anyone in. */
    @GetMapping("/api/paypal/return") ResponseEntity<Void> back(@RequestParam(required = false) String code, @RequestParam(required = false) String state,
        @CookieValue(name = STATE_COOKIE, required = false) String expected, HttpServletRequest request, HttpServletResponse response) {
        if (!enabled()) return home("paypal-failed");
        // PayPal returns without a code when the organizer cancels.
        if (code == null || code.isBlank()) return home("paypal-cancelled");
        if (state == null || expected == null || !MessageDigest.isEqual(state.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8)))
            return home("paypal-failed");
        Identity who;
        try { who = identity(code); } catch (RuntimeException e) { return home("paypal-failed"); }
        var account = account(who);
        // A fresh session for this organizer: nothing from before sign-in carries over.
        var previous = request.getSession(false);
        if (previous != null) previous.invalidate();
        request.getSession(true).setAttribute(DISPLAY_NAME, account.name() == null ? "" : account.name());
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(account.owner(), null, List.of(new SimpleGrantedAuthority("ROLE_HUMAN"))));
        SecurityContextHolder.setContext(context);
        new HttpSessionSecurityContextRepository().saveContext(context, request, response);
        new HttpSessionCsrfTokenRepository().saveToken(null, request, response);
        return home(null);
    }

    OrganizerAccounts.Account account(Identity who) { return accounts.signInWithPayPal(who.userId(), who.name(), who.email(), who.emailVerified()); }

    Identity identity(String code) {
        var call = HttpRequest.newBuilder(URI.create(identityUrl + "/identity/paypal")).timeout(Duration.ofSeconds(35))
            .header("Authorization", "Bearer " + identityToken).header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(Json.write(Map.of("code", code)))).build();
        HttpResponse<String> answer;
        try { answer = http.send(call, HttpResponse.BodyHandlers.ofString()); }
        catch (java.io.IOException e) { throw new IllegalStateException("The sign-in service is unreachable", e); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("Interrupted", e); }
        if (answer.statusCode() != 200) throw new IllegalStateException("The sign-in service answered " + answer.statusCode());
        var who = Json.read(answer.body(), Identity.class);
        if (who.userId() == null || who.userId().isBlank()) throw new IllegalStateException("No PayPal user");
        return who;
    }

    /** The URL PayPal returns to: the configured site when hosted, the loopback host the browser used locally. */
    String returnUrl(HttpServletRequest request) { return access.origin(request.getHeader(HttpHeaders.HOST)) + "/api/paypal/return"; }

    private ResponseCookie stateCookie(String value, Duration age) {
        // Lax, unlike the session cookie: PayPal's redirect back is a cross-site navigation, and the state must ride along.
        return ResponseCookie.from(STATE_COOKIE, value).httpOnly(true).secure(secureCookie).sameSite("Lax").path("/api/paypal").maxAge(age).build();
    }
    private ResponseEntity<Void> home(String outcome) {
        return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, outcome == null ? "/" : "/?signin=" + outcome)
            .header(HttpHeaders.SET_COOKIE, stateCookie("", Duration.ZERO).toString()).header(HttpHeaders.CACHE_CONTROL, "no-store").build();
    }
    private static String encode(Map<String, String> query) {
        return query.entrySet().stream().map(e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8).replace("+", "%20")).collect(Collectors.joining("&"));
    }
}
