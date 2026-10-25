rootProject.name = "swarm-pay"

include("commerce-domain", "persistence", "integrations", "agent-workflows", "mcp-tools")
listOf("commerce-domain", "persistence", "integrations", "agent-workflows", "mcp-tools").forEach {
    project(":$it").projectDir = file("modules/$it")
}
include("commerce-app", "payment-executor")
project(":commerce-app").projectDir = file("apps/commerce-app")
project(":payment-executor").projectDir = file("apps/payment-executor")
