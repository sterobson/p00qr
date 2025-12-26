using Azure;
using Azure.Data.Tables;
using Microsoft.Extensions.Logging;
using P00Qr.Backend.Functions.Entities;

namespace P00Qr.Backend.Functions.Services;

public class TableStorageService : ITableStorageService
{
    private readonly TableServiceClient _tableServiceClient;
    private readonly ILogger<TableStorageService> _logger;
    private TableClient? _tokenAssignmentsTable;
    private TableClient? _eventDevicesTable;

    private const string TokenAssignmentsTableName = "TokenAssignments";
    private const string EventDevicesTableName = "EventDevices";

    public TableStorageService(string connectionString, ILogger<TableStorageService> logger)
    {
        _tableServiceClient = new TableServiceClient(connectionString);
        _logger = logger;
    }

    private async Task<TableClient> GetTokenAssignmentsTableAsync()
    {
        if (_tokenAssignmentsTable == null)
        {
            _tokenAssignmentsTable = _tableServiceClient.GetTableClient(TokenAssignmentsTableName);
            await _tokenAssignmentsTable.CreateIfNotExistsAsync();
            _logger.LogInformation("TokenAssignments table initialized");
        }
        return _tokenAssignmentsTable;
    }

    private async Task<TableClient> GetEventDevicesTableAsync()
    {
        if (_eventDevicesTable == null)
        {
            _eventDevicesTable = _tableServiceClient.GetTableClient(EventDevicesTableName);
            await _eventDevicesTable.CreateIfNotExistsAsync();
            _logger.LogInformation("EventDevices table initialized");
        }
        return _eventDevicesTable;
    }

    public async Task SaveTokenAssignmentsAsync(string eventId, List<TokenAssignment> assignments, string deviceId)
    {
        if (assignments == null || assignments.Count == 0)
        {
            _logger.LogWarning("No assignments to save for event {EventId}", eventId);
            return;
        }

        try
        {
            TableClient tableClient = await GetTokenAssignmentsTableAsync();

            // Process in batches of 100 (Azure Table Storage batch limit)
            const int batchSize = 100;
            for (int i = 0; i < assignments.Count; i += batchSize)
            {
                List<TokenAssignment> batch = assignments.Skip(i).Take(batchSize).ToList();

                // Use batch transaction for better performance
                List<TableTransactionAction> transactionActions = new List<TableTransactionAction>();

                foreach (TokenAssignment assignment in batch)
                {
                    // Parse token number from Position (e.g., "P0001" -> 1)
                    if (int.TryParse(assignment.Position.TrimStart('P'), out int tokenNumber))
                    {
                        TokenAssignmentEntity entity = new TokenAssignmentEntity(eventId, tokenNumber)
                        {
                            AthleteId = assignment.AthleteId,
                            AthleteName = assignment.AthleteName,
                            DeviceId = deviceId,
                            Position = assignment.Position,
                            AssignmentTimestamp = assignment.Timestamp
                        };

                        transactionActions.Add(new TableTransactionAction(TableTransactionActionType.UpsertReplace, entity));
                    }
                }

                if (transactionActions.Count > 0)
                {
                    await tableClient.SubmitTransactionAsync(transactionActions);
                    _logger.LogInformation("Saved {Count} token assignments for event {EventId}", transactionActions.Count, eventId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save token assignments for event {EventId}", eventId);
            throw;
        }
    }

    public async Task ClearTokenAsync(string eventId, int tokenNumber)
    {
        try
        {
            TableClient tableClient = await GetTokenAssignmentsTableAsync();
            string rowKey = tokenNumber.ToString("D4");

            await tableClient.DeleteEntityAsync(eventId, rowKey);
            _logger.LogInformation("Cleared token {Token} for event {EventId}", tokenNumber, eventId);
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            // Entity doesn't exist, which is fine
            _logger.LogDebug("Token {Token} not found for event {EventId} (already cleared)", tokenNumber, eventId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear token {Token} for event {EventId}", tokenNumber, eventId);
            throw;
        }
    }

    public async Task<List<TokenAssignment>> GetAllTokenAssignmentsAsync(string eventId)
    {
        try
        {
            TableClient tableClient = await GetTokenAssignmentsTableAsync();
            List<TokenAssignment> assignments = new List<TokenAssignment>();

            // Query all entities for this event (by PartitionKey)
            AsyncPageable<TokenAssignmentEntity> queryResults = tableClient.QueryAsync<TokenAssignmentEntity>(
                filter: $"PartitionKey eq '{eventId}'");

            await foreach (TokenAssignmentEntity entity in queryResults)
            {
                assignments.Add(entity.ToTokenAssignment());
            }

            _logger.LogInformation("Retrieved {Count} token assignments for event {EventId}", assignments.Count, eventId);
            return assignments;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get token assignments for event {EventId}", eventId);
            throw;
        }
    }

    public async Task<int> GetHighestTokenNumberAsync(string eventId)
    {
        try
        {
            TableClient tableClient = await GetTokenAssignmentsTableAsync();
            int highestToken = 0;

            // Query all entities for this event
            AsyncPageable<TokenAssignmentEntity> queryResults = tableClient.QueryAsync<TokenAssignmentEntity>(
                filter: $"PartitionKey eq '{eventId}'");

            await foreach (TokenAssignmentEntity entity in queryResults)
            {
                // Parse token number from RowKey (e.g., "0001" -> 1)
                if (int.TryParse(entity.RowKey, out int tokenNumber))
                {
                    if (tokenNumber > highestToken)
                    {
                        highestToken = tokenNumber;
                    }
                }
            }

            _logger.LogInformation("Highest token for event {EventId} is {HighestToken}", eventId, highestToken);
            return highestToken;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get highest token for event {EventId}", eventId);
            throw;
        }
    }

    public async Task UpdateDeviceLastSeenAsync(string eventId, string deviceId)
    {
        try
        {
            TableClient tableClient = await GetEventDevicesTableAsync();
            long currentTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            EventDeviceEntity entity = new EventDeviceEntity(eventId, deviceId)
            {
                LastSeenTimestamp = currentTimestamp
            };

            // Get existing entity if it exists to preserve DisplayName
            try
            {
                Response<EventDeviceEntity> existingEntityResponse = await tableClient.GetEntityAsync<EventDeviceEntity>(eventId, deviceId);
                entity.DisplayName = existingEntityResponse.Value.DisplayName;
                entity.ETag = existingEntityResponse.Value.ETag;
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                // Entity doesn't exist, will be created
            }

            await tableClient.UpsertEntityAsync(entity, TableUpdateMode.Replace);
            _logger.LogDebug("Updated last seen for device {DeviceId} in event {EventId}", deviceId, eventId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update last seen for device {DeviceId} in event {EventId}", deviceId, eventId);
            // Don't throw - this is non-critical
        }
    }

    public async Task SetDeviceNameAsync(string eventId, string deviceId, string displayName)
    {
        try
        {
            TableClient tableClient = await GetEventDevicesTableAsync();
            long currentTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            EventDeviceEntity entity = new EventDeviceEntity(eventId, deviceId)
            {
                DisplayName = displayName,
                LastSeenTimestamp = currentTimestamp
            };

            // Try to get existing entity to preserve LastSeenTimestamp if it's more recent
            try
            {
                Response<EventDeviceEntity> existingEntityResponse = await tableClient.GetEntityAsync<EventDeviceEntity>(eventId, deviceId);
                if (existingEntityResponse.Value.LastSeenTimestamp > currentTimestamp)
                {
                    entity.LastSeenTimestamp = existingEntityResponse.Value.LastSeenTimestamp;
                }
                entity.ETag = existingEntityResponse.Value.ETag;
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                // Entity doesn't exist, will be created
            }

            await tableClient.UpsertEntityAsync(entity, TableUpdateMode.Replace);
            _logger.LogInformation("Set display name '{DisplayName}' for device {DeviceId} in event {EventId}", displayName, deviceId, eventId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set device name for device {DeviceId} in event {EventId}", deviceId, eventId);
            throw;
        }
    }
}
