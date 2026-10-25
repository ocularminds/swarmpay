package com.swarmpay.integrations;

import com.swarmpay.domain.*;
import com.swarmpay.domain.Commerce.*;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class ReceiptVerifierTest {
    final Instant now=Instant.parse("2026-10-25T12:00:00Z");
    final KeyPair keys=keys();
    final Plan plan=new PlanFactory(Clock.fixed(now,ZoneOffset.UTC)).create("organizer",
        new Intent("Meetup",30,5,150000,now.plusSeconds(3600),"Europe/Stockholm","Pavilion","Rain","RENT"),
        new DemoCatalog().get("tents-standard"),new DemoCatalog().get("catering-seasonal"),List.of());
    final Line catering=plan.lines().get(1);
    final ReceiptVerifier verifier=new ReceiptVerifier(keys.getPublic(),"venue",Clock.fixed(now,ZoneOffset.UTC));
    Receipt receipt(String merchant,Instant issued,Instant delivered) { return new Receipt("venue",plan.id(),catering.id(),merchant,"Pavilion",30,delivered,issued,UUID.randomUUID().toString()); }
    @Test void admitsOnlyASignedReceiptMatchingTheContract() {
        var receipt=receipt("catering",now,now);
        assertEquals(receipt,verifier.verify(sign(receipt,keys.getPrivate()),plan,catering));
        assertThrows(CommerceException.class,()->verifier.verify(sign(receipt("attacker",now,now),keys.getPrivate()),plan,catering));
    }
    @Test void aValidSignatureFromAnUntrustedKeyIsRejected() {
        assertThrows(CommerceException.class,()->verifier.verify(sign(receipt("catering",now,now),keys().getPrivate()),plan,catering));
    }
    @Test void alterationAfterSigningIsRejected() {
        var signed=sign(receipt("catering",now,now),keys.getPrivate());
        var tampered=new SignedReceipt(Base64.getEncoder().encodeToString("{}".getBytes(StandardCharsets.UTF_8)),signed.signature());
        assertThrows(CommerceException.class,()->verifier.verify(tampered,plan,catering));
    }
    @Test void freshReceiptForWrongDeliveryWindowAndStaleReceiptsAreRejected() {
        assertThrows(CommerceException.class,()->verifier.verify(sign(receipt("catering",now,now.minusSeconds(86400)),keys.getPrivate()),plan,catering));
        assertThrows(CommerceException.class,()->verifier.verify(sign(receipt("catering",now.minusSeconds(901),now),keys.getPrivate()),plan,catering));
    }
    @Test void readsX509Pem() {
        String pem="-----BEGIN PUBLIC KEY-----\n"+Base64.getMimeEncoder().encodeToString(keys.getPublic().getEncoded())+"\n-----END PUBLIC KEY-----\n";
        assertArrayEquals(keys.getPublic().getEncoded(),ReceiptVerifier.publicKey(pem).getEncoded());
    }
    static KeyPair keys() { try{return KeyPairGenerator.getInstance("Ed25519").generateKeyPair();}catch(Exception e){throw new RuntimeException(e);} }
    static SignedReceipt sign(Receipt receipt,PrivateKey key) {
        try {byte[] bytes=Json.write(receipt).getBytes(StandardCharsets.UTF_8);var signer=Signature.getInstance("Ed25519");signer.initSign(key);signer.update(bytes);return new SignedReceipt(Base64.getEncoder().encodeToString(bytes),Base64.getEncoder().encodeToString(signer.sign()));}
        catch(Exception e){throw new RuntimeException(e);}
    }
}
