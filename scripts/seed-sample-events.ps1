<#
.SYNOPSIS
    Envoie des événements représentatifs au Control Plane, sans attendre de vraie session.

.DESCRIPTION
    Les payloads reproduisent fidèlement la forme documentée des hooks Claude Code.
    Ils servent à vérifier la chaîne complète — projection, persistance, KPI, diffusion —
    avant de brancher le harnais sur de vraies sessions.

.EXAMPLE
    ./scripts/seed-sample-events.ps1
    ./scripts/seed-sample-events.ps1 -Url http://localhost:4317/events
#>
param(
    [string]$Url = 'http://localhost:4317/events'
)

$sessionId = [guid]::NewGuid().ToString()
$promptId  = [guid]::NewGuid().ToString()
$agentId   = [guid]::NewGuid().ToString()

# Un échantillon qui couvre les cinq KPI : tokens, échec outil, coût d'un sous-agent,
# compaction, et refus de permission.
$events = @(
    @{
        session_id = $sessionId; hook_event_name = 'SessionStart'
        cwd = 'C:\Dev\agentic-control-plane'; source = 'startup'; model = 'claude-opus-5'
    },
    @{
        session_id = $sessionId; prompt_id = $promptId; hook_event_name = 'UserPromptSubmit'
        cwd = 'C:\Dev\agentic-control-plane'; permission_mode = 'default'
        user_input = 'Ajoute la jauge de contexte'; effort = @{ level = 'high' }
    },
    @{
        session_id = $sessionId; prompt_id = $promptId; hook_event_name = 'PostToolUse'
        cwd = 'C:\Dev\agentic-control-plane'; permission_mode = 'default'
        tool_name = 'Read'; tool_use_id = 'toolu_01SAMPLE0001'
        tool_input = @{ file_path = 'C:\Dev\agentic-control-plane\README.md' }
        tool_response = @{ content = 'contenu du fichier…' }
        execution_time_ms = 42
        tokens_used = @{ input = 18400; output = 260 }
        cache_creation_input_tokens = 0
        cache_read_input_tokens = 17200
    },
    @{
        session_id = $sessionId; prompt_id = $promptId; hook_event_name = 'PostToolUseFailure'
        cwd = 'C:\Dev\agentic-control-plane'
        tool_name = 'Bash'; tool_use_id = 'toolu_01SAMPLE0002'
        tool_input = @{ command = 'dotnet test' }
        tool_error = 'Le projet de tests est introuvable.'
        execution_time_ms = 1830
    },
    @{
        session_id = $sessionId; prompt_id = $promptId; hook_event_name = 'PermissionDenied'
        cwd = 'C:\Dev\agentic-control-plane'; permission_mode = 'auto'
        tool_name = 'Bash'; tool_use_id = 'toolu_01SAMPLE0003'
        denial_reason = 'Commande destructive hors périmètre.'
    },
    # Un sous-agent : c'est cet événement qui alimente le KPI « coût de la délégation ».
    @{
        session_id = $sessionId; prompt_id = $promptId; hook_event_name = 'SubagentStart'
        cwd = 'C:\Dev\agentic-control-plane'; agent_id = $agentId; agent_type = 'backend-dev'
    },
    @{
        session_id = $sessionId; prompt_id = $promptId; hook_event_name = 'SubagentStop'
        cwd = 'C:\Dev\agentic-control-plane'; agent_id = $agentId; agent_type = 'backend-dev'
        last_assistant_message = 'Slice implémentée, build vert.'
        stop_reason = 'end_turn'
        tokens_used = @{ input = 81000; output = 4200 }
        cache_creation_input_tokens = 12000
        cache_read_input_tokens = 64000
    },
    @{
        session_id = $sessionId; hook_event_name = 'PreCompact'; trigger = 'auto'
    },
    @{
        session_id = $sessionId; prompt_id = $promptId; hook_event_name = 'Stop'
        cwd = 'C:\Dev\agentic-control-plane'; stop_reason = 'end_turn'
        tokens_used = @{ input = 96500; output = 1350 }
        cache_creation_input_tokens = 3000
        cache_read_input_tokens = 88000
    }
)

$sent = 0
foreach ($event in $events) {
    $body = $event | ConvertTo-Json -Depth 10 -Compress
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing
        Write-Host ("  {0,-20} -> {1}" -f $event.hook_event_name, $response.StatusCode) -ForegroundColor Green
        $sent++
    }
    catch {
        Write-Host ("  {0,-20} -> ECHEC : {1}" -f $event.hook_event_name, $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "$sent/$($events.Count) evenements envoyes. Session : $sessionId"
