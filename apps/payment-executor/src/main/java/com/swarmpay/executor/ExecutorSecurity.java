package com.swarmpay.executor;

import com.swarmpay.integrations.RuntimeSettings;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Configuration
class ExecutorSecurity {
    @Bean org.springframework.security.core.userdetails.UserDetailsService noInteractiveUsers() {
        return new org.springframework.security.provisioning.InMemoryUserDetailsManager();
    }
    @Bean SecurityFilterChain privateRoutes(HttpSecurity http) throws Exception {
        return http.csrf(c -> c.disable()).sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a.requestMatchers("/actuator/health","/internal/webhooks/**").permitAll().anyRequest().permitAll())
            .addFilterBefore(new ExecutorAccessFilter(RuntimeSettings.secret("EXECUTOR_TOKEN")),UsernamePasswordAuthenticationFilter.class).build();
    }

    /**
     * Payment commands need the executor token and the gateway's authority
     * binding; health, webhooks and the hosted gateway's upstream proof are the
     * only routes without the token, and every other path is 404.
     */
    static final class ExecutorAccessFilter extends OncePerRequestFilter {
        private final byte[] token;
        ExecutorAccessFilter(String executorToken) { this.token=("Bearer "+executorToken).getBytes(StandardCharsets.UTF_8); }
        @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
            String uri=request.getRequestURI();
            if (uri.startsWith("/internal/payments/")) {
                String auth=request.getHeader("Authorization");
                if (auth==null || !MessageDigest.isEqual(token,auth.getBytes(StandardCharsets.UTF_8))) { response.sendError(401); return; }
                if (!request.getMethod().equals("GET")) {
                    String hash=request.getHeader("x-agent-safe-intent-hash"), dossier=request.getHeader("x-agent-safe-dossier-id"), decision=request.getHeader("x-agent-safe-decision-id");
                    if (hash==null || !hash.matches("sha256:[a-f0-9]{64}") || dossier==null || decision==null) { response.sendError(403); return; }
                }
            } else if (uri.equals(UpstreamProofController.PATH)) {
                if (!request.getMethod().equals("GET")) { response.sendError(405); return; }
            } else if (!uri.equals("/actuator/health") && !uri.startsWith("/internal/webhooks/")) { response.sendError(404); return; }
            chain.doFilter(request,response);
        }
    }
}
