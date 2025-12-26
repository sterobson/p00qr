using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Azure.SignalR.Management;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using P00Qr.Backend.Functions.Services;

FunctionsApplicationBuilder builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights();



builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights()
    .AddSingleton<IServiceManager>(serviceProvider =>
        {
            string? connectionString = Environment.GetEnvironmentVariable("AzureSignalRConnectionString");
            return (IServiceManager)new ServiceManagerBuilder()
                .WithOptions(option =>
                {
                    option.ConnectionString = connectionString;
                }).BuildServiceManager(); // Changed from Build() to BuildServiceManager()
        })
    .AddSingleton<ITableStorageService>(serviceProvider =>
        {
            string? connectionString = Environment.GetEnvironmentVariable("AzureWebJobsStorage");
            ILogger<TableStorageService> logger = serviceProvider.GetRequiredService<ILogger<TableStorageService>>();
            return new TableStorageService(connectionString!, logger);
        });

builder.Build().Run();
