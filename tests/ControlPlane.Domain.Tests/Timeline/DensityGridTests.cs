using ControlPlane.Domain.Timeline;

namespace ControlPlane.Domain.Tests.Timeline;

/// <summary>
/// Oracles 6 à 10 de la Definition of Done — plans/006-gantt-vivant.md.
/// </summary>
public sealed class DensityGridTests
{
    private static readonly DateTime Since = new(2026, 8, 10, 18, 0, 0, DateTimeKind.Utc);

    // ---- Oracle 6 : la grille est identique pour toutes les lanes de la réponse ----

    [Fact]
    public void La_grille_est_la_meme_quelle_que_soit_la_lane_qui_la_consulte()
    {
        DateTime until = Since + TimeSpan.FromMinutes(20); // 240 buckets => 5000ms chacun

        Grid grid = DensityGrid.BuildGrid(Since, until);

        Assert.Equal(240, grid.BucketCount);
        Assert.Equal(5_000, grid.BucketMs);

        // Une deuxième lane, avec ses propres bornes, consulte exactement le même calcul —
        // aucun paramètre de lane n'entre dans BuildGrid : c'est ce qui garantit l'unicité.
        Grid sameGrid = DensityGrid.BuildGrid(Since, until);
        Assert.Equal(grid, sameGrid);
    }

    // ---- Oracle 7 : firstBucket positionne correctement une lane qui démarre au milieu ----

    [Fact]
    public void FirstBucket_pointe_le_bucket_ou_la_lane_demarre_reellement()
    {
        DateTime until = Since + TimeSpan.FromMinutes(20);
        Grid grid = DensityGrid.BuildGrid(Since, until);

        // La lane démarre à 10 minutes dans une fenêtre de 20 minutes : au milieu.
        DateTime laneStart = Since + TimeSpan.FromMinutes(10);
        DateTime laneEnd = Since + TimeSpan.FromMinutes(11);

        LaneDensity density = DensityGrid.BuildLaneDensity(laneStart, laneEnd, Since, grid.BucketMs, []);

        int expectedFirstBucket = (int)(TimeSpan.FromMinutes(10).TotalMilliseconds / grid.BucketMs);
        Assert.Equal(expectedFirstBucket, density.FirstBucket);
        Assert.True(density.FirstBucket > 0);
    }

    [Fact]
    public void Une_lane_courte_ne_transporte_pas_les_buckets_qui_la_precedent()
    {
        DateTime until = Since + TimeSpan.FromMinutes(20);
        Grid grid = DensityGrid.BuildGrid(Since, until);

        DateTime laneStart = Since + TimeSpan.FromMinutes(10);
        DateTime laneEnd = laneStart + TimeSpan.FromSeconds(30);

        LaneDensity density = DensityGrid.BuildLaneDensity(laneStart, laneEnd, Since, grid.BucketMs, []);

        Assert.True(density.Buckets.Count < grid.BucketCount);
    }

    // ---- Oracle 8 : trois appels d'outil dans le même bucket donnent count: 3 ----

    [Fact]
    public void Trois_appels_dans_le_meme_bucket_donnent_un_compte_de_trois()
    {
        DateTime until = Since + TimeSpan.FromMinutes(20);
        Grid grid = DensityGrid.BuildGrid(Since, until);

        DateTime laneStart = Since;
        DateTime laneEnd = until;

        DateTime bucketMoment = Since + TimeSpan.FromMilliseconds(grid.BucketMs * 3 + 10);
        List<DateTime> toolCalls =
        [
            bucketMoment,
            bucketMoment + TimeSpan.FromMilliseconds(1),
            bucketMoment + TimeSpan.FromMilliseconds(2),
        ];

        LaneDensity density = DensityGrid.BuildLaneDensity(laneStart, laneEnd, Since, grid.BucketMs, toolCalls);

        int bucketIndex = DensityGrid.BucketIndex(Since, grid.BucketMs, bucketMoment) - density.FirstBucket;
        Assert.Equal(3, density.Buckets[bucketIndex]);
        Assert.Equal(1, density.Buckets.Count(count => count > 0));
    }

    // ---- Oracle 9 : la densité ne compte que les appels d'outil ----

    [Fact]
    public void Un_UserPromptSubmit_dans_le_bucket_nest_jamais_compte()
    {
        // La classification est faite en amont (LaneAssembly.IsToolCallEvent) : cette
        // fonction ne reçoit que ce que l'appelant lui a déjà filtré. On vérifie ici que le
        // filtrage en amont exclut bien UserPromptSubmit avant même d'atteindre la grille.
        Assert.False(LaneAssembly.IsToolCallEvent("UserPromptSubmit"));

        DateTime until = Since + TimeSpan.FromMinutes(20);
        Grid grid = DensityGrid.BuildGrid(Since, until);

        // Aucun horodatage transmis (puisque UserPromptSubmit a été filtré en amont) : la
        // densité de la lane reste à zéro partout.
        LaneDensity density = DensityGrid.BuildLaneDensity(Since, until, Since, grid.BucketMs, []);

        Assert.All(density.Buckets, count => Assert.Equal(0, count));
    }

    // ---- Oracle 10 : une lane d'une seconde ne produit pas une fenêtre dégénérée ----

    [Fact]
    public void Un_span_nul_ne_produit_pas_une_fenetre_degeneree()
    {
        (DateTime contentSince, DateTime contentUntil) = DensityGrid.FloorWindow(Since, Since);

        Assert.True(contentUntil > contentSince);

        Grid grid = DensityGrid.BuildGrid(contentSince, contentUntil);

        Assert.True(grid.BucketMs > 0);
    }

    [Fact]
    public void Un_span_deja_positif_nest_pas_modifie_par_le_plancher()
    {
        DateTime until = Since + TimeSpan.FromHours(1);

        (DateTime contentSince, DateTime contentUntil) = DensityGrid.FloorWindow(Since, until);

        Assert.Equal(Since, contentSince);
        Assert.Equal(until, contentUntil);
    }
}
