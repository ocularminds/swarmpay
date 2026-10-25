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
    SessionController(String runtimeMode,AstraSettings ai) { mode=runtimeMode;this.ai=ai; }
    @GetMapping("/api/session") Map<String,Object> session(Authentication auth,CsrfToken csrf) {
        boolean signed=auth!=null && auth.isAuthenticated() && auth.getAuthorities().stream().anyMatch(a->a.getAuthority().equals("ROLE_HUMAN"));
        return Map.of("authenticated",signed,"username",signed?auth.getName():"","csrfToken",csrf.getToken(),"csrfHeader",csrf.getHeaderName());
    }
    @PostMapping("/api/demo-session") Map<String,String> demo(HttpServletRequest request,HttpServletResponse response) {
        if(!mode.equals("demo")) throw new CommerceException("DEMO_DISABLED","Use your organizer account for sandbox mode",404);
        request.getSession(); request.changeSessionId();
        var context=SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(RuntimeSettings.required("ORGANIZER_USERNAME"),null,List.of(new SimpleGrantedAuthority("ROLE_HUMAN"))));
        SecurityContextHolder.setContext(context);
        new HttpSessionSecurityContextRepository().saveContext(context,request,response);
        new HttpSessionCsrfTokenRepository().saveToken(null,request,response);
        return Map.of("mode","demo");
    }
    @GetMapping("/api/config") Map<String,Object> config() {
        return Map.of("mode",mode,"aiProvider",ai.provider(),"model",ai.source(),
            "authority",mode.equals("demo")?"AgentSafe · local test authority":"AgentSafe · Decionis",
            "catalogSource","Curated demo catalog","receiptIssuer",RuntimeSettings.required("VENUE_ISSUER"),
            "clientIds",Map.of("tents",RuntimeSettings.value("PAYPAL_TENTS_CLIENT_ID",""),"catering",RuntimeSettings.value("PAYPAL_CATERING_CLIENT_ID","")),
            "policyVersion",RuntimeSettings.required("DECIONIS_POLICY_VERSION"));
    }
}
