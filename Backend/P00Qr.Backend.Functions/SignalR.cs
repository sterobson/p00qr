using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Azure.SignalR.Management;
using Microsoft.Extensions.Logging;
using System.Net;

namespace P00Qr.Backend.Functions;

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
        [FromQuery] string eventId,
        [FromQuery] string connectionId)
    {
        if (string.IsNullOrEmpty(connectionId) || string.IsNullOrEmpty(eventId))
        {
            HttpResponseData badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync("Please provide both connectionId and eventId.");
            return badResponse;
        }

        IServiceHubContext hubContext = await _serviceManager.CreateHubContextAsync(P00QrHubName);

        await hubContext.Groups.AddToGroupAsync(connectionId, eventId);

        HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
        return response;
    }

    [Function(nameof(RemoveFromGroup))]
    public async Task<HttpResponseData> RemoveFromGroup(
    [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
    [FromQuery] string eventId,
    [FromQuery] string connectionId)
    {
        if (string.IsNullOrEmpty(connectionId) || string.IsNullOrEmpty(eventId))
        {
            HttpResponseData badResponse = req.CreateResponse(HttpStatusCode.BadRequest);
            await badResponse.WriteStringAsync("Please provide both connectionId and eventId.");
            return badResponse;
        }

        IServiceHubContext hubContext = await _serviceManager.CreateHubContextAsync(P00QrHubName);

        await hubContext.Groups.RemoveFromGroupAsync(connectionId, eventId);

        HttpResponseData response = req.CreateResponse(HttpStatusCode.OK);
        return response;
    }

    [Function(nameof(SendPositionUsed))]
    [SignalROutput(HubName = P00QrHubName)]
    public static async Task<SignalRMessageAction> SendPositionUsed(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromQuery] string eventId,
        [FromQuery] int position)
    {
        return new SignalRMessageAction("positionUsed")
        {
            Arguments = [eventId, position],
            GroupName = eventId
        };
    }

    [Function(nameof(JoinEvent))]
    [SignalROutput(HubName = P00QrHubName)]
    public static async Task<SignalRMessageAction> JoinEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromQuery] string eventId)
    {
        return new SignalRMessageAction("deviceAddedToEvent")
        {
            Arguments = [eventId],
            GroupName = eventId
        };
    }

    [Function(nameof(ResetEvent))]
    [SignalROutput(HubName = P00QrHubName)]
    public static async Task<SignalRMessageAction> ResetEvent(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromQuery] string eventId)
    {
        return new SignalRMessageAction("resetEvent")
        {
            Arguments = [eventId],
            GroupName = eventId
        };
    }

    [Function(nameof(SendEventDetails))]
    [SignalROutput(HubName = P00QrHubName)]
    public static async Task<SignalRMessageAction> SendEventDetails(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post")] HttpRequestData req,
        [FromQuery] string eventId,
        [FromQuery] string eventName,
        [FromQuery] int? nextPosition
        )
    {
        return new SignalRMessageAction("setEventDetails")
        {
            Arguments = [eventId, eventName, nextPosition ?? -1],
            GroupName = eventId
        };
    }

}