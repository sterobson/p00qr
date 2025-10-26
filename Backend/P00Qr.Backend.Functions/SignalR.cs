using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Azure.SignalR.Management;
using Microsoft.Extensions.Logging;
using System.Net;
using FromBodyAttribute = Microsoft.Azure.Functions.Worker.Http.FromBodyAttribute;

namespace P00Qr.Backend.Functions;

public class EventPayload
{
    public string ConnectionId { get; set; } = string.Empty;
    public string EventId { get; set; } = string.Empty;
    public string? MessageSourceId { get; set; }
}

public class TokenUsedPayload : EventPayload
{
    public int Token { get; set; } = 0;
}

public class EventDetailsPayload : EventPayload
{
    public int? NextToken { get; set; }
    public string EventName { get; set; } = string.Empty;
}

public class SignalR
{
    private readonly ILogger _logger;

    private readonly IServiceManager _serviceManager;

    private const string P00QrHubName = "P00Qr";

    public SignalR(IServiceManager serviceManager, ILoggerFactory loggerFactory)
    {
        _serviceManager = serviceManager;
        _logger = loggerFactory.CreateLogger("negotiate");
    }

    [Function(nameof(Negotiate))]
    public static async Task<HttpResponseData> Negotiate(
        [HttpTrigger(AuthorizationLevel.Anonymous)] HttpRequestData req,
        [SignalRConnectionInfoInput(HubName = P00QrHubName)] SignalRConnectionInfo connectionInfo)
    {
        HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(connectionInfo);
        return response;
    }

    [Function(nameof(AddToGroup))]
    public async Task<HttpResponseData> AddToGroup(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
        [FromBody] EventPayload payload)
    {
        if (string.IsNullOrEmpty(payload.ConnectionId) || string.IsNullOrEmpty(payload.EventId))
        {
            HttpResponseData badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync($"Please provide both {nameof(payload.ConnectionId)} and {nameof(payload.EventId)}.");
            return badResponse;
        }

        IServiceHubContext hubContext = await _serviceManager.CreateHubContextAsync(P00QrHubName);

        await hubContext.Groups.AddToGroupAsync(payload.ConnectionId, payload.EventId);

        HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
        return response;
    }

    [Function(nameof(RemoveFromGroup))]
    public async Task<HttpResponseData> RemoveFromGroup(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
        [FromBody] EventPayload payload)
    {
        if (string.IsNullOrEmpty(payload.ConnectionId) || string.IsNullOrEmpty(payload.EventId))
        {
            HttpResponseData badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync($"Please provide both {nameof(payload.ConnectionId)} and {nameof(payload.EventId)}.");
            return badResponse;
        }

        IServiceHubContext hubContext = await _serviceManager.CreateHubContextAsync(P00QrHubName);

        await hubContext.Groups.RemoveFromGroupAsync(payload.ConnectionId, payload.EventId);

        HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
        return response;
    }

    [Function(nameof(SendTokenUsed))]
    [SignalROutput(HubName = P00QrHubName)]
    public static async Task<SignalRMessageAction> SendTokenUsed(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] TokenUsedPayload payload)
    {
        return new SignalRMessageAction("tokenUsed")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId, payload.Token],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(JoinEvent))]
    [SignalROutput(HubName = P00QrHubName)]
    public static async Task<SignalRMessageAction> JoinEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] EventPayload payload)
    {
        return new SignalRMessageAction("deviceAddedToEvent")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(ResetEvent))]
    [SignalROutput(HubName = P00QrHubName)]
    public static async Task<SignalRMessageAction> ResetEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] EventPayload payload)
    {
        return new SignalRMessageAction("resetEvent")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(SendEventDetails))]
    [SignalROutput(HubName = P00QrHubName)]
    public static async Task<SignalRMessageAction> SendEventDetails(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] EventDetailsPayload payload)
    {
        return new SignalRMessageAction("setEventDetails")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId, payload.EventName, payload.NextToken ?? -1],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(PingEvent))]
    [SignalROutput(HubName = P00QrHubName)]
    public static async Task<SignalRMessageAction> PingEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] EventPayload payload)
    {
        return new SignalRMessageAction("pingEvent")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId],
            GroupName = payload.EventId
        };
    }
}