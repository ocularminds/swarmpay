dependencies {
    api(project(":commerce-domain"))
    implementation(libs.paypal)
    implementation("com.squareup.okhttp3:okhttp")
    api("com.fasterxml.jackson.core:jackson-databind")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
}
