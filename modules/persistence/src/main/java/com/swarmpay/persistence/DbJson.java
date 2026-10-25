package com.swarmpay.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

final class DbJson {
    static final ObjectMapper MAPPER = new ObjectMapper().registerModule(new JavaTimeModule()).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    static String write(Object value) {
        try { return MAPPER.writeValueAsString(value); } catch (Exception e) { throw new IllegalArgumentException("Cannot persist data", e); }
    }
    static <T> T read(String value, Class<T> type) {
        try { return MAPPER.readValue(value, type); } catch (Exception e) { throw new IllegalStateException("Stored data is invalid", e); }
    }
}
