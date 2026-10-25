package com.swarmpay.app;

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
    private final AstraSettings ai;
    private final WebAccessPolicy access;
    SessionController(String runtimeMode,AstraSettings ai,WebAccessPolicy access) { mode=runtimeMode;this.ai=ai;this.access=access; }
    @GetMapping("/api/session") Map<String,Object> session(Authentication auth,CsrfToken csrf) {
        boolean signed=auth!=null && auth.isAuthenticated() && auth.getAuthorities().stream().anyMatch(a->a.getAuthority().equals("ROLE_HUMAN"));
        return Map.of("authenticated",signed,"username",signed?auth.getName():"","csrfToken",csrf.getToken(),"csrfHeader",csrf.getHeaderName());
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
    static String authority(String agentSafeUrl,String mode) {
        if (agentSafeUrl!=null && agentSafeUrl.startsWith("https://")) return "AgentSafe hosted gateway · Decionis";
        return mode.equals("demo")?"AgentSafe · local test authority":"AgentSafe · Decionis";
    }
    private String authority() { return authority(RuntimeSettings.value("AGENTSAFE_URL",null),mode); }
    @GetMapping("/api/config") Map<String,Object> config() {
        return Map.of("mode",mode,"demoSessionEnabled",access.demoSessionEnabled(mode),"aiProvider",ai.provider(),"model",ai.source(),
            "authority",authority(),
            "catalogSource","Curated demo catalog","receiptIssuer",RuntimeSettings.required("VENUE_ISSUER"),
            "clientIds",Map.of("tents",RuntimeSettings.value("PAYPAL_TENTS_CLIENT_ID",""),"catering",RuntimeSettings.value("PAYPAL_CATERING_CLIENT_ID","")),
            "policyVersion",RuntimeSettings.required("DECIONIS_POLICY_VERSION"));
    }
}
