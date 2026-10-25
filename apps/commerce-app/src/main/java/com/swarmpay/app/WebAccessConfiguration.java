package com.swarmpay.app;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class WebAccessConfiguration {
    @Bean WebAccessPolicy webAccessPolicy(@Value("${swarm.public-origin:}") String origin,
        @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie) {
        return new WebAccessPolicy(origin, secureCookie);
    }
}
