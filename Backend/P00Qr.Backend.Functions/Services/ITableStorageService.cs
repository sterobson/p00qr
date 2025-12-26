namespace P00Qr.Backend.Functions.Services;

public interface ITableStorageService
{
    // Token Assignment Operations
    Task SaveTokenAssignmentsAsync(string eventId, List<TokenAssignment> assignments, string deviceId);
    Task ClearTokenAsync(string eventId, int tokenNumber);
    Task<List<TokenAssignment>> GetAllTokenAssignmentsAsync(string eventId);
    Task<int> GetHighestTokenNumberAsync(string eventId);

    // Device Operations
    Task UpdateDeviceLastSeenAsync(string eventId, string deviceId);
    Task SetDeviceNameAsync(string eventId, string deviceId, string displayName);
}
