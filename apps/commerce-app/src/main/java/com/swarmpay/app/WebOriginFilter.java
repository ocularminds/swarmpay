package com.swarmpay.app;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.Collections;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
final class WebOriginFilter extends OncePerRequestFilter {
    private final WebAccessPolicy access;
    WebOriginFilter(WebAccessPolicy access) { this.access = access; }

    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        // Container probes stay private; nginx does not proxy actuator routes.
        return request.getRequestURI().equals("/actuator/health");
    }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        var hosts = Collections.list(request.getHeaders("Host"));
        var origins = Collections.list(request.getHeaders("Origin"));
        if (hosts.size() != 1 || !access.allowsHost(hosts.getFirst())) {
            refuse(response, "INVALID_HOST"); return;
        }
        if (origins.size() > 1 || (!origins.isEmpty() && !access.allowsOrigin(hosts.getFirst(), origins.getFirst()))) {
            refuse(response, "INVALID_ORIGIN"); return;
        }
        if (access.hosted()) response.setHeader("Strict-Transport-Security", "max-age=31536000");
        chain.doFilter(request, response);
    }

    private static void refuse(HttpServletResponse response, String code) throws IOException {
        response.setStatus(403);
        response.setContentType("application/json");
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"This request is not for the configured SwarmPay site.\"}");
    }
}
