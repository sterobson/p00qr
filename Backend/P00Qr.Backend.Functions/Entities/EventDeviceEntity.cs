using Azure;
using Azure.Data.Tables;

namespace P00Qr.Backend.Functions.Entities;

public class EventDeviceEntity : ITableEntity
{
    // ITableEntity required properties
    public string PartitionKey { get; set; } = string.Empty;  // EventId
    public string RowKey { get; set; } = string.Empty;         // DeviceId
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    // Business properties
    public string DisplayName { get; set; } = string.Empty;
    public long LastSeenTimestamp { get; set; }  // Unix timestamp

    // Parameterless constructor
    public EventDeviceEntity() { }

    // Convenience constructor
    public EventDeviceEntity(string eventId, string deviceId)
    {
        PartitionKey = eventId;
        RowKey = deviceId;
    }
}
