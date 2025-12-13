using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Azure.SignalR.Management;
using Microsoft.Extensions.Configuration;
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
    private readonly IConfiguration _configuration;
    private const string P00QrHubName = "P00Qr";

    public SignalR(IServiceManager serviceManager, IConfiguration configuration, ILoggerFactory loggerFactory)
    {
        _serviceManager = serviceManager;
        _configuration = configuration;
        _logger = loggerFactory.CreateLogger("negotiate");
    }

    [Function(nameof(Negotiate))]
    public async Task<HttpResponseData> Negotiate(
        [HttpTrigger(AuthorizationLevel.Anonymous)] HttpRequestData req,
        [SignalRConnectionInfoInput(HubName = P00QrHubName)] SignalRConnectionInfo connectionInfo)
    {
        if (!IsValidRequestSource(req))
        {
            return req.CreateResponse(HttpStatusCode.Unauthorized);
        }

        HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(connectionInfo);
        return response;
    }

    [Function(nameof(GetFunctionKey))]
    public async Task<HttpResponseData> GetFunctionKey(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get")] HttpRequestData req)
    {
        if (!IsValidRequestSource(req))
        {
            return req.CreateResponse(HttpStatusCode.Unauthorized);
        }

        HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
        var result = new { FunctionKey = _configuration["FunctionKey"] };
        await response.WriteAsJsonAsync(result);

        return response;
    }

    [Function(nameof(AddToGroup))]
    public async Task<HttpResponseData> AddToGroup(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
        [FromBody] EventPayload payload)
    {
        if (!IsValidRequestSource(req))
        {
            return req.CreateResponse(HttpStatusCode.Unauthorized);
        }

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
        if (!IsValidRequestSource(req))
        {
            return req.CreateResponse(HttpStatusCode.Unauthorized);
        }

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

    private bool IsValidRequestSource(HttpRequestData req)
    {
        string? origin = req.Headers.TryGetValues("Origin", out IEnumerable<string>? origins) ? origins.FirstOrDefault() : null;
        string? referer = req.Headers.TryGetValues("Referer", out IEnumerable<string>? referers) ? referers.FirstOrDefault() : null;

        bool isLocal = IsLocalHost(origin) || IsLocalHost(referer);
        if (!isLocal)
        {
            return true;
        }

        if (!req.Headers.TryGetValues("x-local-host-key", out IEnumerable<string>? values))
        {
            return false;
        }

        if (!values.Any(v => v.Equals(_configuration["LocalHostKey"], StringComparison.InvariantCultureIgnoreCase)))
        {
            return false;
        }

        return true;
    }

    public static bool IsLocalHost(string? host)
    {
        if (string.IsNullOrWhiteSpace(host))
            return false;

        // Normalize and strip scheme
        host = host.ToLowerInvariant();
        host = host.Replace("http://", "").Replace("https://", "");

        // Define local prefixes
        string[] localPrefixes = [
            "localhost",
            "127.",
            "192.168.",
            "::1"
        ];

        // Match against known local patterns
        foreach (string prefix in localPrefixes)
        {
            if (host.StartsWith(prefix))
            {
                return true;
            }
        }

        return false;
    }

}