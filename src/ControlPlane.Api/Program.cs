using ControlPlane.Api.Extensions;
using ControlPlane.Api.Realtime;
using ControlPlane.Application;
using ControlPlane.Infrastructure;
using ControlPlane.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddRealtime();
builder.Services.AddEndpoints(typeof(Program).Assembly);

var app = builder.Build();

app.Services.ApplyMigrations();

// Le SPA compilé est servi par l'API : un seul process, un seul port à lancer pour observer.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseWebSockets();

app.MapEndpoints();

// Toute route non-API retombe sur le SPA.
app.MapFallbackToFile("index.html");

app.Run();
