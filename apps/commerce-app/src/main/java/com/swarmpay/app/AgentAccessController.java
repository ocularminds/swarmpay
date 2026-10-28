package com.swarmpay.app;

import com.swarmpay.persistence.AgentTokens;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
import java.util.List;
import java.util.UUID;

/** Organizers grant and revoke their own agents' access. Only a signed-in human can; an agent token cannot mint another. */
@RestController
class AgentAccessController {
    private final AgentTokens tokens;
    AgentAccessController(AgentTokens tokens) { this.tokens = tokens; }
    record NewAgent(String label) {}
    @GetMapping("/api/agent-tokens") List<AgentTokens.Grant> list(Principal user) { return tokens.active(user.getName()); }
    @PostMapping("/api/agent-tokens") AgentTokens.Issued issue(@RequestBody(required = false) NewAgent body, Principal user) {
        return tokens.issue(user.getName(), body == null ? null : body.label());
    }
    @DeleteMapping("/api/agent-tokens/{id}") ResponseEntity<Void> revoke(@PathVariable UUID id, Principal user) {
        tokens.revoke(user.getName(), id); return ResponseEntity.noContent().build();
    }
}
