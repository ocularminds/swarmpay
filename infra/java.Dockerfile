# syntax=docker/dockerfile:1.7
FROM maven:3.9-eclipse-temurin-21@sha256:99e61abcff91a9b1333463bd8451fb18495d6eba9250ac66a338b518f8278320 AS build
WORKDIR /workspace
COPY . .
ARG APP
# Parallel service builds must not write Gradle's journal from separate containers.
RUN --mount=type=cache,id=swarm-pay-gradle,target=/root/.gradle,sharing=locked ./gradlew :${APP}:bootJar --no-daemon --console=plain
RUN cp apps/${APP}/build/libs/*-SNAPSHOT.jar /tmp/app.jar

FROM eclipse-temurin:21-jre@sha256:227118764cccd3c3294617061aaa93a08309c63a395eefa83e6b35032992ea99
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /tmp/app.jar /app/app.jar
USER 10001:10001
ENTRYPOINT ["java","-XX:MaxRAMPercentage=65","-jar","/app/app.jar"]
