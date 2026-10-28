package com.swarmpay.app;

import com.swarmpay.persistence.OrganizerAccounts;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import java.net.URI;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PayPalSignInTest {
    final List<String> codes=new ArrayList<>();
    final UUID account=UUID.randomUUID();
    final PayPalSignIn signIn=new PayPalSignIn(new WebAccessPolicy("https://swarm.decionis.com",true),null,true,"swarm-login-client","http://identity:8085","internal") {
        @Override Identity identity(String code) { codes.add(code); return new Identity("https://www.paypal.com/user/ada",null,"Ada Organizer","ada@example.com",true,true); }
        @Override OrganizerAccounts.Account account(Identity who) { return new OrganizerAccounts.Account(account,"paypal:"+account,who.name(),who.email(),true); }
    };
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    MockHttpServletRequest request(String path) {
        var request=new MockHttpServletRequest("GET",path);request.addHeader("Host","swarm.decionis.com");return request;
    }
    static Map<String,String> query(String url) {
        var values=new LinkedHashMap<String,String>();
        for(var pair:URI.create(url).getRawQuery().split("&")) { var kv=pair.split("=",2); values.put(kv[0],java.net.URLDecoder.decode(kv[1],java.nio.charset.StandardCharsets.UTF_8)); }
        return values;
    }

    @Test void startsAtPayPalWithTheRegisteredReturnUrlAndAStateOnlyThisBrowserHolds() {
        var started=signIn.start(request("/api/paypal/start"));
        assertEquals(302,started.getStatusCode().value());
        var location=started.getHeaders().getLocation().toString();
        assertTrue(location.startsWith(PayPalSignIn.AUTHORIZE+"?"));
        var params=query(location);
        assertEquals("swarm-login-client",params.get("client_id"));assertEquals("code",params.get("response_type"));
        assertEquals("openid profile email",params.get("scope"));
        assertEquals("https://swarm.decionis.com/api/paypal/return",params.get("redirect_uri"));
        var cookie=started.getHeaders().getFirst("Set-Cookie");
        assertTrue(cookie.startsWith(PayPalSignIn.STATE_COOKIE+"="+params.get("state")+";"));
        for(var attribute:List.of("Path=/api/paypal","HttpOnly","Secure","SameSite=Lax"))assertTrue(cookie.contains(attribute),cookie);
        assertTrue(params.get("state").length()>=43,"a 256-bit state");
    }

    @Test void aMissingOrForeignStateSignsNoOneIn() {
        for(var cookie:new String[]{null,"another-browser"}) {
            var request=request("/api/paypal/return");request.setParameter("code","C21-code");request.setParameter("state","issued-state");
            if(cookie!=null)request.setCookies(new Cookie(PayPalSignIn.STATE_COOKIE,cookie));
            var back=signIn.back("C21-code","issued-state",cookie,request,new MockHttpServletResponse());
            assertEquals("/?signin=paypal-failed",back.getHeaders().getLocation().toString());
            assertNull(request.getSession(false));
        }
        assertTrue(codes.isEmpty(),"a code is never exchanged without the matching state");
    }

    @Test void cancellingAtPayPalReturnsToTheLanding() {
        var back=signIn.back(null,"issued-state","issued-state",request("/api/paypal/return"),new MockHttpServletResponse());
        assertEquals("/?signin=paypal-cancelled",back.getHeaders().getLocation().toString());
        assertTrue(back.getHeaders().getFirst("Set-Cookie").contains("Max-Age=0"));
    }

    @Test void aMatchingStateCreatesTheOrganizerSessionFromTheirPayPalAccount() {
        var request=request("/api/paypal/return");
        var old=request.getSession(true);old.setAttribute("before","sign-in");
        var response=new MockHttpServletResponse();
        var back=signIn.back("C21-code","issued-state","issued-state",request,response);
        assertEquals("/",back.getHeaders().getLocation().toString());
        assertEquals(List.of("C21-code"),codes);
        var session=request.getSession(false);
        assertNotSame(old,session,"sign-in starts a fresh session");assertNull(session.getAttribute("before"));
        assertEquals("Ada Organizer",session.getAttribute(PayPalSignIn.DISPLAY_NAME));
        var context=(SecurityContext)session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        assertEquals("paypal:"+account,context.getAuthentication().getName());
        assertTrue(context.getAuthentication().getAuthorities().stream().anyMatch(a->a.getAuthority().equals("ROLE_HUMAN")));
    }

    @Test void locallyItReturnsToTheLoopbackHostTheBrowserUsed() {
        var local=new PayPalSignIn(new WebAccessPolicy("",false),null,false,"client","http://identity:8085","internal");
        var request=new MockHttpServletRequest("GET","/api/paypal/start");request.addHeader("Host","localhost:5175");
        assertEquals("http://localhost:5175/api/paypal/return",local.returnUrl(request));
        request=new MockHttpServletRequest("GET","/api/paypal/start");request.addHeader("Host","evil.example");
        var refused=request;
        assertThrows(IllegalArgumentException.class,()->local.returnUrl(refused));
        assertFalse(new PayPalSignIn(new WebAccessPolicy("",false),null,false,"","http://identity:8085","internal").enabled());
        assertFalse(new PayPalSignIn(new WebAccessPolicy("",false),null,false,"client","http://identity:8085",null).enabled());
    }
}
