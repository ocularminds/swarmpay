dependencies {
    api(project(":commerce-domain"))
    implementation(libs.paypal)
    api("com.fasterxml.jackson.core:jackson-databind")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
}
