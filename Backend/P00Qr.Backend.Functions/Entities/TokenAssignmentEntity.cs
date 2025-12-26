using Azure;
using Azure.Data.Tables;

namespace P00Qr.Backend.Functions.Entities;

public class TokenAssignmentEntity : ITableEntity
{
    // ITableEntity required properties
    public string PartitionKey { get; set; } = string.Empty;  // EventId
    public string RowKey { get; set; } = string.Empty;         // Token number (zero-padded: "0001", "0042", etc.)
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    // Business properties
    public string AthleteId { get; set; } = string.Empty;
    public string AthleteName { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public string Position { get; set; } = string.Empty;
    public long AssignmentTimestamp { get; set; }  // Unix timestamp for business logic

    // Parameterless constructor required for Table SDK
    public TokenAssignmentEntity() { }

    // Convenience constructor
    public TokenAssignmentEntity(string eventId, int tokenNumber)
    {
        PartitionKey = eventId;
        RowKey = tokenNumber.ToString("D4");  // Zero-pad to 4 digits
    }

    // Helper method to convert to TokenAssignment model
    public TokenAssignment ToTokenAssignment()
    {
        return new TokenAssignment
        {
            Position = Position,
            AthleteId = AthleteId,
            AthleteName = AthleteName,
            DeviceId = DeviceId,
            Timestamp = AssignmentTimestamp
        };
    }
}
