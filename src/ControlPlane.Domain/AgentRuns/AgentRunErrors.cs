using ControlPlane.Domain.Abstractions;

namespace ControlPlane.Domain.AgentRuns;

public static class AgentRunErrors
{
    public static Error NotFound(string agentId) =>
        Error.NotFound("AgentRuns.NotFound", $"The agent run '{agentId}' was not found");
}
