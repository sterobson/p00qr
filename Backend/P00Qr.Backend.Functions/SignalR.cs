using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Azure.SignalR.Management;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net;
using P00Qr.Backend.Functions.Services;
using FromBodyAttribute = Microsoft.Azure.Functions.Worker.Http.FromBodyAttribute;

namespace P00Qr.Backend.Functions;

public class EventPayload
{
    public string ConnectionId { get; set; } = string.Empty;
    public string EventId { get; set; } = string.Empty;
    public string? MessageSourceId { get; set; }
    public string DeviceId { get; set; } = string.Empty;
}

public class TokenAssignment
{
    public string Position { get; set; } = string.Empty;
    public string AthleteId { get; set; } = string.Empty;
    public string AthleteName { get; set; } = string.Empty;
    public string ConnectionId { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public long Timestamp { get; set; }
}

public class TokenAssignmentsPayload : EventPayload
{
    public List<TokenAssignment> Assignments { get; set; } = new List<TokenAssignment>();
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
    private readonly ITableStorageService _tableStorageService;
    private const string P00QrHubName = "P00Qr";

    public SignalR(IServiceManager serviceManager, IConfiguration configuration, ITableStorageService tableStorageService, ILoggerFactory loggerFactory)
    {
        _serviceManager = serviceManager;
        _configuration = configuration;
        _tableStorageService = tableStorageService;
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
    public async Task<SignalRMessageAction> SendTokenUsed(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] TokenUsedPayload payload)
    {
        // Update device last seen (fire-and-forget)
        _ = Task.Run(async () =>
        {
            try
            {
                await _tableStorageService.UpdateDeviceLastSeenAsync(payload.EventId, payload.DeviceId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update device last seen");
            }
        });

        // Clear token from storage
        try
        {
            await _tableStorageService.ClearTokenAsync(payload.EventId, payload.Token);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear token {Token} for event {EventId}", payload.Token, payload.EventId);
        }

        // Return SignalR broadcast (unchanged)
        return new SignalRMessageAction("tokenUsed")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId, payload.Token],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(SendTokenAssignments))]
    [SignalROutput(HubName = P00QrHubName)]
    public async Task<SignalRMessageAction> SendTokenAssignments(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] TokenAssignmentsPayload payload)
    {
        // Update device last seen (fire-and-forget)
        _ = Task.Run(async () =>
        {
            try
            {
                await _tableStorageService.UpdateDeviceLastSeenAsync(payload.EventId, payload.DeviceId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update device last seen");
            }
        });

        // Save token assignments to storage
        try
        {
            await _tableStorageService.SaveTokenAssignmentsAsync(payload.EventId, payload.Assignments, payload.DeviceId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save token assignments for event {EventId}", payload.EventId);
        }

        // Return SignalR broadcast (unchanged)
        return new SignalRMessageAction("tokenAssignments")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId, payload.Assignments],
            GroupName = payload.EventId
        };
    }


    public class SyncDigestPayload : EventPayload
    {
        public int Count { get; set; }
        public List<int> Tokens { get; set; } = new List<int>();
    }

    [Function(nameof(SendSyncDigest))]
    [SignalROutput(HubName = P00QrHubName)]
    public async Task<SignalRMessageAction> SendSyncDigest(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] SyncDigestPayload payload)
    {
        // Update device last seen (fire-and-forget)
        _ = Task.Run(async () =>
        {
            try
            {
                await _tableStorageService.UpdateDeviceLastSeenAsync(payload.EventId, payload.DeviceId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update device last seen");
            }
        });

        return new SignalRMessageAction("syncDigest")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId, payload.Count, payload.Tokens],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(JoinEvent))]
    [SignalROutput(HubName = P00QrHubName)]
    public async Task<SignalRMessageAction> JoinEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] EventPayload payload)
    {
        // Update device last seen (fire-and-forget)
        _ = Task.Run(async () =>
        {
            try
            {
                await _tableStorageService.UpdateDeviceLastSeenAsync(payload.EventId, payload.DeviceId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update device last seen");
            }
        });

        return new SignalRMessageAction("deviceAddedToEvent")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(ResetEvent))]
    [SignalROutput(HubName = P00QrHubName)]
    public async Task<SignalRMessageAction> ResetEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] EventPayload payload)
    {
        // Update device last seen (fire-and-forget)
        _ = Task.Run(async () =>
        {
            try
            {
                await _tableStorageService.UpdateDeviceLastSeenAsync(payload.EventId, payload.DeviceId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update device last seen");
            }
        });

        return new SignalRMessageAction("resetEvent")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(SendEventDetails))]
    [SignalROutput(HubName = P00QrHubName)]
    public async Task<SignalRMessageAction> SendEventDetails(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] EventDetailsPayload payload)
    {
        // Update device last seen (fire-and-forget)
        _ = Task.Run(async () =>
        {
            try
            {
                await _tableStorageService.UpdateDeviceLastSeenAsync(payload.EventId, payload.DeviceId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update device last seen");
            }
        });

        return new SignalRMessageAction("setEventDetails")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId, payload.EventName, payload.NextToken ?? -1],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(PingEvent))]
    [SignalROutput(HubName = P00QrHubName)]
    public async Task<SignalRMessageAction> PingEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromBody] EventPayload payload)
    {
        // Update device last seen (fire-and-forget)
        _ = Task.Run(async () =>
        {
            try
            {
                await _tableStorageService.UpdateDeviceLastSeenAsync(payload.EventId, payload.DeviceId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to update device last seen");
            }
        });

        return new SignalRMessageAction("pingEvent")
        {
            Arguments = [payload.MessageSourceId ?? "", payload.EventId],
            GroupName = payload.EventId
        };
    }

    [Function(nameof(GetFullHistory))]
    public async Task<HttpResponseData> GetFullHistory(
        [HttpTrigger(AuthorizationLevel.Function, "get")] HttpRequestData req)
    {
        if (!IsValidRequestSource(req))
        {
            return req.CreateResponse(HttpStatusCode.Unauthorized);
        }

        string? eventId = req.Query["eventId"];
        if (string.IsNullOrEmpty(eventId))
        {
            HttpResponseData badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync("Please provide eventId query parameter.");
            return badResponse;
        }

        try
        {
            List<TokenAssignment> assignments = await _tableStorageService.GetAllTokenAssignmentsAsync(eventId);

            HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteAsJsonAsync(assignments);
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get full history for event {EventId}", eventId);
            HttpResponseData errorResponse = req.CreateResponse(HttpStatusCode.InternalServerError);
            await errorResponse.WriteStringAsync("Failed to retrieve token assignments.");
            return errorResponse;
        }
    }

    public class SetDeviceNamePayload
    {
        public string EventId { get; set; } = string.Empty;
        public string DeviceId { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
    }

    [Function(nameof(SetDeviceName))]
    public async Task<HttpResponseData> SetDeviceName(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
        [FromBody] SetDeviceNamePayload payload)
    {
        if (!IsValidRequestSource(req))
        {
            return req.CreateResponse(HttpStatusCode.Unauthorized);
        }

        if (string.IsNullOrEmpty(payload.EventId) || string.IsNullOrEmpty(payload.DeviceId))
        {
            HttpResponseData badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync($"Please provide both {nameof(payload.EventId)} and {nameof(payload.DeviceId)}.");
            return badResponse;
        }

        try
        {
            await _tableStorageService.SetDeviceNameAsync(payload.EventId, payload.DeviceId, payload.DisplayName);

            HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set device name for device {DeviceId} in event {EventId}", payload.DeviceId, payload.EventId);
            HttpResponseData errorResponse = req.CreateResponse(HttpStatusCode.InternalServerError);
            await errorResponse.WriteStringAsync("Failed to set device name.");
            return errorResponse;
        }
    }

    [Function(nameof(GetHighestToken))]
    public async Task<HttpResponseData> GetHighestToken(
        [HttpTrigger(AuthorizationLevel.Function, "get")] HttpRequestData req)
    {
        if (!IsValidRequestSource(req))
        {
            return req.CreateResponse(HttpStatusCode.Unauthorized);
        }

        string? eventId = req.Query["eventId"];
        if (string.IsNullOrEmpty(eventId))
        {
            HttpResponseData badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync("Please provide eventId query parameter.");
            return badResponse;
        }

        try
        {
            int highestToken = await _tableStorageService.GetHighestTokenNumberAsync(eventId);

            HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
            await response.WriteAsJsonAsync(new { highestToken });
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get highest token for event {EventId}", eventId);
            HttpResponseData errorResponse = req.CreateResponse(HttpStatusCode.InternalServerError);
            await errorResponse.WriteStringAsync("Failed to retrieve highest token.");
            return errorResponse;
        }
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