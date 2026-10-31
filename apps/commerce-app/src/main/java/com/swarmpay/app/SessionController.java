package com.swarmpay.app;

import com.swarmpay.domain.Commerce.Catalog;
import com.swarmpay.domain.CommerceException;
import com.swarmpay.agents.AstraSettings;
import com.swarmpay.integrations.RuntimeSettings;
import jakarta.servlet.http.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
class SessionController {
    private final String mode;
    private final String authority;
    private final AstraSettings ai;
    private final WebAccessPolicy access;
    private final PayPalSignIn paypal;
    private final Catalog catalog;
    SessionController(String runtimeMode,AstraSettings ai,WebAccessPolicy access,PayPalSignIn paypal,Catalog catalog) {
        mode=runtimeMode;this.ai=ai;this.access=access;this.paypal=paypal;this.catalog=catalog;
        authority=authority(RuntimeSettings.value("AGENTSAFE_URL",null),RuntimeSettings.authority(mode));
    }
    @GetMapping("/api/session") Map<String,Object> session(Authentication auth,CsrfToken csrf,HttpServletRequest request) {
        boolean signed=auth!=null && auth.isAuthenticated() && auth.getAuthorities().stream().anyMatch(a->a.getAuthority().equals("ROLE_HUMAN"));
        // A PayPal organizer is shown by their PayPal name; the password organizer by its username.
        var session=request.getSession(false);
        var named=signed&&session!=null&&session.getAttribute(PayPalSignIn.DISPLAY_NAME) instanceof String name?name:signed?auth.getName():"";
        return Map.of("authenticated",signed,"username",signed?auth.getName():"","name",named,"csrfToken",csrf.getToken(),"csrfHeader",csrf.getHeaderName());
    }
    @PostMapping("/api/demo-session") Map<String,String> demo(HttpServletRequest request,HttpServletResponse response) {
        if(!access.demoSessionEnabled(mode)) throw new CommerceException("DEMO_DISABLED","Sign in with your organizer account",404);
        request.getSession(); request.changeSessionId();
        var context=SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(RuntimeSettings.required("ORGANIZER_USERNAME"),null,List.of(new SimpleGrantedAuthority("ROLE_HUMAN"))));
        SecurityContextHolder.setContext(context);
        new HttpSessionSecurityContextRepository().saveContext(context,request,response);
        new HttpSessionCsrfTokenRepository().saveToken(null,request,response);
        return Map.of("mode","demo");
    }
    /** Who decides: the shared hosted gateway answers with Decionis whatever the payment mode. */
    static String authority(String agentSafeUrl,String authority) {
        if (agentSafeUrl!=null && agentSafeUrl.startsWith("https://")) return "AgentSafe hosted gateway · Decionis";
        return authority.equals("local")?"AgentSafe · local test authority":"AgentSafe · Decionis";
    }
    @GetMapping("/api/config") Map<String,Object> config() {
        return Map.ofEntries(Map.entry("mode",mode),Map.entry("demoSessionEnabled",access.demoSessionEnabled(mode)),Map.entry("paypalSignIn",paypal.enabled()),
            Map.entry("aiProvider",ai.provider()),Map.entry("model",ai.source()),Map.entry("authority",authority),
            Map.entry("catalogSource",catalog.sellsTents()?"Curated demo catalog and Channel3 product data":"Curated demo catalog"),
            Map.entry("tentPurchases",catalog.sellsTents()),Map.entry("receiptIssuer",RuntimeSettings.required("VENUE_ISSUER")),
            Map.entry("clientIds",Map.of("tents",RuntimeSettings.value("PAYPAL_TENTS_CLIENT_ID",""),"catering",RuntimeSettings.value("PAYPAL_CATERING_CLIENT_ID",""))),
            Map.entry("policyVersion",RuntimeSettings.required("DECIONIS_POLICY_VERSION")),
            // AG Studio's licence key is meant for the browser; without one the dashboard shows a trial watermark.
            Map.entry("dashboardAgent",!ai.provider().equals("demo")),Map.entry("agStudioLicenseKey",RuntimeSettings.value("AG_STUDIO_LICENSE_KEY","")));
    }
}
