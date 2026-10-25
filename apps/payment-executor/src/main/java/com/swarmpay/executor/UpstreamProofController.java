package com.swarmpay.executor;

import com.swarmpay.integrations.RuntimeSettings;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.nio.charset.StandardCharsets;

/**
 * The token that proves to the hosted AgentSafe fleet this origin is ours
 * (AgentSafe's upstream proof): served at a fixed path, without credentials,
 * as plain text of at most 1 KiB. Unset, the path does not exist.
 */
@RestController
class UpstreamProofController {
    static final String PATH="/.well-known/agentsafe-upstream";
    private final String proof;
    UpstreamProofController() { this(RuntimeSettings.value("AGENTSAFE_UPSTREAM_PROOF",null)); }
    UpstreamProofController(String proof) {
        String value=proof==null?null:proof.strip();
        if (value!=null && value.getBytes(StandardCharsets.UTF_8).length>1024) throw new IllegalStateException("AGENTSAFE_UPSTREAM_PROOF exceeds 1 KiB");
        this.proof=value==null||value.isEmpty()?null:value+"\n";
    }
    @GetMapping(PATH) ResponseEntity<String> proof() {
        if (proof==null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().contentType(new MediaType("text","plain",StandardCharsets.UTF_8))
            .header("Cache-Control","no-store").body(proof);
    }
}
