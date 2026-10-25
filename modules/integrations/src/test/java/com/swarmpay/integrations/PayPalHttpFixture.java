package com.swarmpay.integrations;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import okhttp3.OkHttpClient;

/** Exercises the real SDK's OAuth, serialization and HTTP error handling. */
final class PayPalHttpFixture implements AutoCloseable {
    record Request(String method,String path,Map<String,List<String>> headers,String body) {
        String header(String name) {
            return headers.entrySet().stream().filter(e->e.getKey().equalsIgnoreCase(name))
                .flatMap(e->e.getValue().stream()).findFirst().orElse(null);
        }
    }
    record Response(int status,Object body,Map<String,String> headers) {
        Response(int status,Object body) { this(status,body,Map.of()); }
    }
    interface Handler { Response respond(Request request) throws Exception; }
    final List<Request> requests=new CopyOnWriteArrayList<>();
    final AtomicReference<Throwable> failure=new AtomicReference<>();
    final HttpServer server;
    final ExecutorService executor=Executors.newVirtualThreadPerTaskExecutor();
    volatile Handler handler=request->new Response(404,Map.of());

    PayPalHttpFixture() throws IOException {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.setExecutor(executor);
        server.createContext("/",exchange->{
            try(exchange) {
                var request=new Request(exchange.getRequestMethod(),exchange.getRequestURI().getPath(),
                    Map.copyOf(exchange.getRequestHeaders()),new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
                requests.add(request);
                var response=handler.respond(request);
                if(response==null) return; // Simulate a connection lost after provider commitment.
                byte[] bytes=Json.write(response.body()).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type","application/json");
                response.headers().forEach((name,value)->exchange.getResponseHeaders().set(name,value));
                exchange.sendResponseHeaders(response.status(),response.status()==204 ? -1 : bytes.length);
                if(response.status()!=204) exchange.getResponseBody().write(bytes);
            } catch(Throwable error) {
                if(!(error instanceof IOException)) failure.compareAndSet(null,error);
            }
        });
        server.start();
    }
    URI base() { return URI.create("http://127.0.0.1:"+server.getAddress().getPort()); }
    OkHttpClient transport() { return transport(Duration.ofSeconds(3)); }
    OkHttpClient transport(Duration timeout) {
        return PayPalPaymentProvider.sandboxHttpClient().newBuilder().callTimeout(timeout).addInterceptor(chain->{
            var original=chain.request();
            if(!original.url().host().equals("api-m.sandbox.paypal.com") || !original.url().isHttps())
                throw new IOException("Fixture refused a non-sandbox SDK destination");
            return chain.proceed(original.newBuilder().url(base()+original.url().encodedPath()).build());
        }).build();
    }
    static Response oauth() { return new Response(200,Map.of("access_token","fixture-token","token_type","Bearer","expires_in",3600)); }
    List<Request> paymentPosts() { return requests.stream().filter(r->r.method().equals("POST") && r.path().startsWith("/v2/")).toList(); }
    @Override public void close() {
        server.stop(0); executor.shutdownNow();
        if(failure.get()!=null) throw new AssertionError("HTTP fixture handler failed",failure.get());
    }
}
