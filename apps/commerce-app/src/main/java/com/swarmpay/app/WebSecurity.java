package com.swarmpay.app;

import com.swarmpay.integrations.RuntimeSettings;
import com.swarmpay.persistence.AgentTokens;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.*;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

@Configuration
class WebSecurity {
    @Bean PasswordEncoder passwordEncoder() { return PasswordEncoderFactories.createDelegatingPasswordEncoder(); }
    @Bean UserDetailsService organizer(PasswordEncoder encoder) {
        return new InMemoryUserDetailsManager(User.withUsername(RuntimeSettings.required("ORGANIZER_USERNAME"))
            .password(encoder.encode(RuntimeSettings.secret("ORGANIZER_PASSWORD"))).roles("HUMAN").build());
    }
    @Bean @Order(1) SecurityFilterChain mcp(HttpSecurity http,AgentTokens agents) throws Exception {
        byte[] token=("Bearer "+RuntimeSettings.secret("MCP_TOKEN")).getBytes(StandardCharsets.UTF_8);
        String organizer=RuntimeSettings.required("ORGANIZER_USERNAME");
        return http.securityMatcher("/mcp","/mcp/**").csrf(c -> c.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a.anyRequest().hasRole("MCP"))
            .addFilterBefore(new OncePerRequestFilter() {
                // Streamable HTTP completes on an ASYNC servlet dispatch. Reauthenticate
                // the retained bearer header there, as well as on the initial request.
                protected boolean shouldNotFilterAsyncDispatch() { return false; }
                protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
                    String auth=request.getHeader("Authorization");
                    // The operator's token acts for the configured organizer; an organizer's own agent token acts for that organizer alone.
                    String owner=auth==null?null:MessageDigest.isEqual(token,auth.getBytes(StandardCharsets.UTF_8))?organizer
                        :auth.startsWith("Bearer ")?agents.owner(auth.substring(7)).orElse(null):null;
                    if(owner==null) { response.sendError(401); return; }
                    var context=SecurityContextHolder.createEmptyContext();
                    context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(owner,null,List.of(new SimpleGrantedAuthority("ROLE_MCP"))));
                    SecurityContextHolder.setContext(context);
                    try { chain.doFilter(request,response); } finally { SecurityContextHolder.clearContext(); }
                }
            },UsernamePasswordAuthenticationFilter.class).build();
    }
    @Bean @Order(2) SecurityFilterChain human(HttpSecurity http) throws Exception {
        return http.csrf(c -> c.csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()).ignoringRequestMatchers("/api/venue/receipts"))
            .authorizeHttpRequests(a -> a.requestMatchers("/api/config","/api/session","/api/login","/api/demo-session","/api/paypal/start","/api/paypal/return","/api/venue/receipts","/actuator/health","/error").permitAll()
                .requestMatchers("/api/**").hasRole("HUMAN").anyRequest().denyAll())
            .formLogin(f -> f.loginProcessingUrl("/api/login").successHandler((q,s,a)->s.setStatus(204)).failureHandler((q,s,e)->s.sendError(401)))
            .logout(l -> l.logoutUrl("/api/logout").logoutSuccessHandler((q,s,a)->s.setStatus(204)))
            .exceptionHandling(e -> e.authenticationEntryPoint((q,s,x)->s.sendError(401)))
            .build();
    }
}
