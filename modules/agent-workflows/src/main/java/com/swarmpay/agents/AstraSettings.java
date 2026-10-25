package com.swarmpay.agents;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;

/** Explicit model routing. Missing Azure configuration never falls back to another provider. */
public record AstraSettings(String provider,String apiKey,String baseUrl,String deployment) {
    public static AstraSettings fromEnvironment(Map<String,String> env) {
        String provider=first(env,"SWARM_AI_PROVIDER");
        if(provider==null) provider="demo".equals(env.get("SWARM_MODE"))?"demo":"azure";
        if(!Set.of("demo","azure","openai").contains(provider)) throw new IllegalStateException("SWARM_AI_PROVIDER must be demo, azure or openai");
        if(provider.equals("demo")) return new AstraSettings("demo","","","");
        String expected=first(env,"OPENAI_MODEL");
        if(expected!=null&&!expected.equals("gpt-6-astra")) throw new IllegalStateException("The approved model is gpt-6-astra");
        if(provider.equals("openai")) return new AstraSettings(provider,secret(env,"OPENAI_API_KEY"),"https://api.openai.com/v1/","gpt-6-astra");
        // Preserve compatibility with the user's initial local configuration,
        // including its OPEANAI spelling, without rewriting credential values.
        String key=secret(env,"AZURE_OPEANAI_KEY","AZURE_OPENAI_API_KEY","AZURE_OPENAI_KEY");
        String endpoint=required(first(env,"AZURE_OPENAI_ENDPOINT","AZURE_OPENAI_URL"),"AZURE_OPENAI_ENDPOINT");
        String deployment=required(first(env,"AZURE_OPENAI_DEPLOYMENT","AZURE_OPENAI_LLM"),"AZURE_OPENAI_DEPLOYMENT");
        if(!deployment.matches("[a-zA-Z0-9._-]{1,120}")) throw new IllegalStateException("Invalid Azure deployment name");
        return new AstraSettings(provider,key,azureBaseUrl(endpoint),deployment);
    }
    public static String azureBaseUrl(String endpoint) {
        try {
            var url=URI.create(endpoint);
            String host=url.getHost();
            boolean azure=host!=null&&(host.endsWith(".openai.azure.com")||host.endsWith(".services.ai.azure.com")||host.endsWith(".cognitiveservices.azure.com"));
            if(!"https".equals(url.getScheme())||!azure||url.getRawUserInfo()!=null||url.getRawQuery()!=null||url.getRawFragment()!=null
                ||url.getPort()!=-1&&url.getPort()!=443) throw new IllegalArgumentException();
            String path=url.getPath().replaceAll("/+$","");
            if(!path.isEmpty()&&!path.equals("/openai/v1")) throw new IllegalArgumentException();
            return "https://"+url.getRawAuthority()+"/openai/v1/";
        } catch(RuntimeException e) {
            throw new IllegalStateException("AZURE_OPENAI_ENDPOINT must be an HTTPS Azure OpenAI resource root or /openai/v1 endpoint without query parameters");
        }
    }
    public String source() { return provider.equals("demo")?"Simulated agent roles":provider.equals("azure")?"Azure OpenAI · "+deployment:"gpt-6-astra"; }
    @Override public String toString() { return "AstraSettings[provider="+provider+", credentials and endpoint redacted]"; }
    private static String first(Map<String,String> env,String... names) {
        for(String name:names) {String value=env.get(name);if(value!=null&&!value.isBlank())return value.strip();}
        return null;
    }
    private static String required(String value,String name) {
        if(value==null||value.isBlank())throw new IllegalStateException(name+" is required for the selected AI provider");
        return value;
    }
    private static String secret(Map<String,String> env,String... names) {
        for(String name:names) {
            String file=first(env,name+"_FILE");
            if(file!=null) {
                try{return required(Files.readString(Path.of(file)).strip(),name);}
                catch(java.io.IOException e){throw new IllegalStateException("Cannot read "+name+"_FILE");}
            }
            String value=first(env,name);if(value!=null)return value;
        }
        throw new IllegalStateException(names.length>1?"AZURE_OPENAI_API_KEY is required for Azure":"OPENAI_API_KEY is required for OpenAI");
    }
}
