using Microsoft.AspNetCore.SignalR;

namespace KanbanServer.Hubs;

/// <summary>
/// チケット変更のリアルタイム通知用 Hub
/// </summary>
public class TicketHub : Hub
{
    /// <summary>
    /// チケットが変更されたことを全クライアントに通知
    /// </summary>
    public async Task BroadcastTicketChanged()
    {
        await Clients.Others.SendAsync("TicketChanged");
    }
}
