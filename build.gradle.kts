plugins {
    base
    id("org.springframework.boot") version "4.1.2" apply false
}

allprojects {
    group = "com.swarmpay"
    version = "0.1.0-SNAPSHOT"
    repositories { mavenCentral() }
}

subprojects {
    apply(plugin = "java-library")
    extensions.configure<JavaPluginExtension> {
        toolchain.languageVersion.set(JavaLanguageVersion.of(21))
    }
    dependencies {
        "implementation"(platform("org.springframework.boot:spring-boot-dependencies:4.1.2"))
        "testImplementation"(platform("org.springframework.boot:spring-boot-dependencies:4.1.2"))
        "testImplementation"("org.junit.jupiter:junit-jupiter")
        "testRuntimeOnly"("org.junit.platform:junit-platform-launcher")
    }
    tasks.withType<JavaCompile>().configureEach {
        options.encoding = "UTF-8"
        options.compilerArgs.add("-parameters")
    }
    tasks.withType<Test>().configureEach { useJUnitPlatform() }
}

tasks.register("verify") {
    group = "verification"
    description = "Build and test every Java module."
    dependsOn(subprojects.map { "${it.path}:check" })
}

val webInstall by tasks.registering(Exec::class) {
    group = "build"
    workingDir("apps/web")
    commandLine("npm", "ci")
}
tasks.register<Exec>("webBuild") {
    group = "build"
    description = "Build the web app with the Node version in .node-version."
    dependsOn(webInstall)
    workingDir("apps/web")
    commandLine("npm", "run", "build")
}
