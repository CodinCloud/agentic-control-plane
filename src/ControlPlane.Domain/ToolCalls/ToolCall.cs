namespace ControlPlane.Domain.ToolCalls;

/// <summary>
/// Un appel d'outil, entrée et sortie réduites à ce qui se lit d'un coup d'œil.
///
/// <para>Volontairement <b>pas</b> le payload brut : la sortie d'un <c>Edit</c> ou d'un
/// <c>Write</c> contient <c>originalFile</c>, c'est-à-dire le fichier entier — c'est ce qui
/// pousse les payloads vers la troncature à 32 Ko. Voir plans/005-gantt-exploitable.md,
/// décision #8.</para>
/// </summary>
/// <param name="Id">L'événement source. Pour un groupe, celui du premier appel.</param>
/// <param name="RepeatCount">Nombre d'appels consécutifs du même outil réunis sous ce glyphe.
/// 1 = appel isolé.</param>
/// <param name="Summary">Extrait de l'entrée — la commande, le chemin, le motif. Null quand
/// l'outil n'a pas de règle d'extraction.</param>
/// <param name="Result">Extrait de la sortie, ou le message d'erreur en cas d'échec.</param>
/// <param name="Extractable">False = aucune règle ne connaît cet outil. L'UI doit le dire
/// explicitement plutôt que d'afficher un blanc.</param>
public sealed record ToolCall(
    long Id,
    DateTime At,
    string ToolName,
    int RepeatCount,
    int? DurationMs,
    bool Failed,
    string? Summary,
    string? Result,
    bool Extractable);

/// <summary>Les colonnes brutes d'un événement d'outil, telles que la requête les lit.</summary>
public readonly record struct ToolCallSource(
    long Id,
    DateTime At,
    string? ToolName,
    string? EventName,
    int? DurationMs,
    string? Payload);
